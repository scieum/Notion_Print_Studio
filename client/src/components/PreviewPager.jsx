import { RefreshCw, FileSearch } from 'lucide-react';

/**
 * 미리보기 뷰어. 초안은 저사양 PDF를 iframe으로 표시한다.
 * TODO(설계서 §9): 페이지별 PNG 목록 + 페이저 UI로 교체.
 */
export default function PreviewPager({ url, rendering, error, onRetry }) {
  return (
    <div className="flex-1 min-h-0 relative">
      {url ? (
        <iframe title="미리보기" src={`${url}#toolbar=0`} className="w-full h-full border-0" />
      ) : (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-placeholder">
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
