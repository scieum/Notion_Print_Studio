import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, RefreshCw, FileSearch, ZoomIn, ZoomOut, Maximize2,
} from 'lucide-react';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];

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
 * 미리보기 뷰어. PDF를 pdf.js로 캔버스에 직접 그린다 (내장 뷰어 의존 X).
 * 상단 툴바: 페이지 넘기기 + 확대/축소(맞춤/배율). 설정 변경 시 새 blob → 즉시 재렌더.
 */
export default function PreviewPager({ blob, rendering, error, onRetry, onThumbnail }) {
  const [doc, setDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [zoom, setZoom] = useState('fit'); // 'fit' | 배율(number)
  const [containerW, setContainerW] = useState(0);

  const docRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const renderSeq = useRef(0);
  const onThumbnailRef = useRef(onThumbnail);
  onThumbnailRef.current = onThumbnail;

  // 컨테이너 폭 추적 (맞춤 배율 계산용)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

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

  // 현재 페이지를 캔버스에 렌더 (이전 렌더를 확실히 취소·대기해 race 방지)
  useEffect(() => {
    if (!doc || !containerW) return;
    const seq = ++renderSeq.current;
    let cancelled = false;
    (async () => {
      // 같은 캔버스에 대한 이전 렌더가 끝나기 전에 새로 시작하면 pdf.js가 throw → 반드시 취소 후 대기
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        try {
          await renderTaskRef.current.promise;
        } catch {
          /* 취소 예외 무시 */
        }
      }
      if (cancelled || seq !== renderSeq.current) return;

      const page = await doc.getPage(Math.min(pageNum, doc.numPages));
      const canvas = canvasRef.current;
      if (cancelled || seq !== renderSeq.current || !canvas) return;

      const base = page.getViewport({ scale: 1 });
      const dpr = window.devicePixelRatio || 1;
      const cssWidth =
        zoom === 'fit'
          ? Math.min(Math.max(containerW - 48, 200), 1400)
          : base.width * zoom;
      const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.ceil(viewport.width / dpr)}px`;
      canvas.style.height = `${Math.ceil(viewport.height / dpr)}px`;

      const task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch {
        /* 취소 시 예외 무시 */
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [doc, pageNum, zoom, containerW]);

  const numPages = doc?.numPages || 0;
  const prevPage = useCallback(() => setPageNum((p) => Math.max(1, p - 1)), []);
  const nextPage = useCallback(() => setPageNum((p) => Math.min(numPages, p + 1)), [numPages]);

  const zoomPct = zoom === 'fit' ? null : Math.round(zoom * 100);
  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const cur = z === 'fit' ? 1 : z;
      const below = [...ZOOM_STEPS].reverse().find((s) => s < cur - 0.001);
      return below ?? ZOOM_STEPS[0];
    });
  }, []);
  const zoomIn = useCallback(() => {
    setZoom((z) => {
      const cur = z === 'fit' ? 1 : z;
      const above = ZOOM_STEPS.find((s) => s > cur + 0.001);
      return above ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
    });
  }, []);

  // 키보드: ←/→ 페이지, +/- 줌
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') prevPage();
      else if (e.key === 'ArrowRight') nextPage();
      else if (e.key === '+' || e.key === '=') zoomIn();
      else if (e.key === '-') zoomOut();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevPage, nextPage, zoomIn, zoomOut]);

  const iconBtn =
    'p-1.5 rounded hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent transition-colors';

  return (
    <div className="flex-1 min-h-0 relative flex flex-col">
      {/* 상단 툴바 — 페이지 네비 + 확대/축소 */}
      {doc && (
        <div
          className="flex-none flex items-center gap-1 px-3 h-10 border-b bg-bg"
          style={{ borderColor: 'var(--border)' }}
        >
          <button className={iconBtn} onClick={prevPage} disabled={pageNum <= 1} aria-label="이전 페이지">
            <ChevronLeft size={16} aria-hidden />
          </button>
          <span className="text-xs text-muted tabular-nums min-w-[3.5rem] text-center select-none">
            {pageNum} / {numPages}
          </span>
          <button className={iconBtn} onClick={nextPage} disabled={pageNum >= numPages} aria-label="다음 페이지">
            <ChevronRight size={16} aria-hidden />
          </button>

          <div className="flex-1" />

          <button className={iconBtn} onClick={zoomOut} aria-label="축소">
            <ZoomOut size={16} aria-hidden />
          </button>
          <button
            className="text-xs text-muted tabular-nums min-w-[3rem] text-center px-1 py-1 rounded hover:bg-surface transition-colors select-none"
            onClick={() => setZoom('fit')}
            title="폭 맞춤으로"
          >
            {zoom === 'fit' ? '맞춤' : `${zoomPct}%`}
          </button>
          <button className={iconBtn} onClick={zoomIn} aria-label="확대">
            <ZoomIn size={16} aria-hidden />
          </button>
          <button
            className={iconBtn + (zoom === 'fit' ? ' text-accent' : '')}
            onClick={() => setZoom('fit')}
            aria-label="폭 맞춤"
            title="폭 맞춤"
          >
            <Maximize2 size={15} aria-hidden />
          </button>
        </div>
      )}

      {/* 캔버스 영역 */}
      {doc ? (
        <div ref={containerRef} className="flex-1 min-h-0 overflow-auto px-6 py-6">
          <canvas ref={canvasRef} className="mx-auto block shadow-card bg-white" />
        </div>
      ) : (
        <div ref={containerRef} className="h-full flex flex-col items-center justify-center gap-3 text-placeholder">
          <FileSearch size={32} strokeWidth={1.5} aria-hidden />
          <p className="text-sm">{rendering ? '' : '설정을 조정하면 미리보기가 생성됩니다.'}</p>
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
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <button className="btn-secondary bg-bg text-xs" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden /> 미리보기 갱신 실패 — 다시 시도
          </button>
        </div>
      )}
    </div>
  );
}
