import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { getJson, postJson, postBlob } from '../lib/api.js';
import { useDebouncedEffect } from '../lib/useDebounce.js';
import SettingsPanel from '../components/SettingsPanel.jsx';
import TemplateManager from '../components/TemplateManager.jsx';
import PreviewPager from '../components/PreviewPager.jsx';

export default function Editor({ page, onReconnect }) {
  const [templates, setTemplates] = useState({ presets: [], mine: [] });
  const [template, setTemplate] = useState(null); // 현재 편집 중인 스타일 JSON
  const [docTitle, setDocTitle] = useState(page.title);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [fallbackNotice, setFallbackNotice] = useState(false);
  const previewUrlRef = useRef(null);

  // 초기 로드: 양식 목록 + 페이지 fetch(정규화 캐시 워밍) + 저장된 문서 설정 복원
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tpls, fetched] = await Promise.all([
          getJson('/api/templates'),
          postJson('/api/pages/fetch', { pageId: page.id }),
        ]);
        if (cancelled) return;
        setTemplates(tpls);
        setDocTitle(fetched.title);
        const saved = fetched.savedSettings?.override;
        setTemplate(saved || tpls.presets[0]?.style || null);
      } catch (err) {
        if (err.reconnect) return onReconnect();
        if (!cancelled) setRenderError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page.id, onReconnect]);

  async function renderPreview() {
    if (!template) return;
    setRendering(true);
    setRenderError(null);
    try {
      const { blob, templateFallback } = await postBlob('/api/render/preview', {
        pageId: page.id,
        template,
      });
      setFallbackNotice(templateFallback);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err) {
      if (err.reconnect) return onReconnect();
      setRenderError(err.message);
    } finally {
      setRendering(false);
    }
  }

  // 설정 변경 후 1.2초 디바운스 → 미리보기 자동 재렌더 (설계서 §3)
  useDebouncedEffect(() => {
    renderPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(template), page.id], 1200);

  async function downloadPdf() {
    if (!template) return;
    setDownloading(true);
    try {
      const { blob } = await postBlob('/api/render/pdf', { pageId: page.id, template });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docTitle}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err.reconnect) return onReconnect();
      setRenderError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  async function reloadTemplates() {
    setTemplates(await getJson('/api/templates'));
  }

  return (
    <div className="h-full flex min-h-0">
      {/* 미리보기 영역 */}
      <section className="flex-1 min-w-0 bg-surface flex flex-col">
        <div className="flex-none flex items-center gap-3 px-4 h-11 border-b bg-bg" style={{ borderColor: 'var(--border)' }}>
          <span className="text-sm font-semibold truncate">{docTitle}</span>
          {fallbackNotice && (
            <span className="text-xs rounded-full px-2 py-0.5" style={{ background: '#f2f9ff', color: 'var(--accent)' }}>
              양식 오류 — 기본 프리셋으로 대체됨
            </span>
          )}
          <div className="flex-1" />
          <button className="btn-primary !py-1.5 text-xs" onClick={downloadPdf} disabled={downloading || !template}>
            <Download size={14} aria-hidden />
            {downloading ? '생성 중…' : 'PDF 다운로드'}
          </button>
        </div>
        <PreviewPager url={previewUrl} rendering={rendering} error={renderError} onRetry={renderPreview} />
      </section>

      {/* 설정 패널 */}
      <aside className="flex-none w-80 border-l overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
        {template ? (
          <div className="p-4 space-y-5">
            <TemplateManager
              templates={templates}
              current={template}
              onApply={setTemplate}
              onChanged={reloadTemplates}
            />
            <SettingsPanel template={template} onChange={setTemplate} />
          </div>
        ) : (
          <p className="p-4 text-sm text-placeholder">양식 불러오는 중…</p>
        )}
      </aside>
    </div>
  );
}
