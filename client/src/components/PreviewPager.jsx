import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, FileSearch } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** 작업 기록용 1페이지 썸네일 (약 280px 폭 JPEG data URL) */
async function renderThumbnail(doc) {
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 280 / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.8);
}

/**
 * 미리보기 뷰어. PDF를 pdf.js로 캔버스에 직접 그린다 — 내장 PDF 뷰어가 없는
 * 브라우저(모바일 등)에서 iframe 방식이 "미리보기 미지원"으로 뜨는 문제를 해결한다.
 * 페이지별 페이저 UI (설계서 §9).
 */
export default function PreviewPager({ blob, rendering, error, onRetry, onThumbnail }) {
  const [doc, setDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const docRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const onThumbnailRef = useRef(onThumbnail);
  onThumbnailRef.current = onThumbnail;

  // 새 PDF blob 도착 → 문서 로드 + 썸네일 통지
  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    (async () => {
      const data = await blob.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data }).promise;
      if (cancelled) return pdf.destroy();
      docRef.current?.destroy();
      docRef.current = pdf;
      setDoc(pdf);
      setPageNum((p) => Math.min(Math.max(1, p), pdf.numPages));
      try {
        const thumb = await renderThumbnail(pdf);
        if (!cancelled) onThumbnailRef.current?.(thumb);
      } catch {
        /* 썸네일 실패는 미리보기에 영향 없음 */
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [blob]);

  // 언마운트 시 문서 해제
  useEffect(() => () => docRef.current?.destroy(), []);

  // 현재 페이지를 컨테이너 폭에 맞춰 캔버스에 렌더
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(Math.min(pageNum, doc.numPages));
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (cancelled || !canvas || !container) return;
      const base = page.getViewport({ scale: 1 });
      const cssWidth = Math.min(Math.max(container.clientWidth - 48, 240), 900);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.ceil(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.ceil(viewport.height / dpr)}px`;
      renderTaskRef.current?.cancel();
      const task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport });
      renderTaskRef.current = task;
      await task.promise; // 취소 시 예외 → 아래 catch로 무시
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [doc, pageNum]);

  return (
    <div className="flex-1 min-h-0 relative flex flex-col">
      {doc ? (
        <div ref={containerRef} className="flex-1 min-h-0 overflow-auto px-6 py-6">
          <canvas ref={canvasRef} className="mx-auto block shadow-card bg-white" />
        </div>
      ) : (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-placeholder">
          <FileSearch size={32} strokeWidth={1.5} aria-hidden />
          <p className="text-sm">{rendering ? '' : '설정을 조정하면 미리보기가 생성됩니다.'}</p>
        </div>
      )}

      {doc && doc.numPages > 1 && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-bg border rounded-full px-1.5 py-1 shadow-card"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            className="p-1 rounded-full hover:bg-surface disabled:opacity-30 transition-colors"
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            disabled={pageNum <= 1}
            aria-label="이전 페이지"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <span className="text-xs text-muted px-1 tabular-nums">
            {pageNum} / {doc.numPages}
          </span>
          <button
            className="p-1 rounded-full hover:bg-surface disabled:opacity-30 transition-colors"
            onClick={() => setPageNum((p) => Math.min(doc.numPages, p + 1))}
            disabled={pageNum >= doc.numPages}
            aria-label="다음 페이지"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      )}

      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(246,245,244,0.6)' }}>
          <span className="text-sm text-muted bg-bg border rounded px-3 py-1.5 shadow-card" style={{ borderColor: 'var(--border)' }}>
            미리보기 렌더 중…
          </span>
        </div>
      )}

      {error && !rendering && (
        // 렌더 실패 시 수동 갱신 버튼 노출 (설계서 §11 단계 7 — 에스컬레이션)
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2">
          <button className="btn-secondary bg-bg text-xs" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden /> 미리보기 갱신 실패 — 다시 시도
          </button>
        </div>
      )}
    </div>
  );
}
