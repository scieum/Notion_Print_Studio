import { useEffect, useState } from 'react';
import { Search, File, FileText } from 'lucide-react';
import { getJson, postJson } from '../lib/api.js';
import { useDebouncedValue } from '../lib/useDebounce.js';

export default function PageSelect({ onSelect, onReconnect }) {
  const [query, setQuery] = useState('');
  const [pages, setPages] = useState(null); // null = 로딩
  const [history, setHistory] = useState([]); // 최근 작업 기록
  const [error, setError] = useState(null);
  const debouncedQuery = useDebouncedValue(query, 400);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    postJson('/api/pages/search', { query: debouncedQuery })
      .then((data) => !cancelled && setPages(data.pages))
      .catch((err) => {
        if (cancelled) return;
        if (err.reconnect) return onReconnect();
        setError(err.message);
        setPages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, onReconnect]);

  // 작업 기록 (썸네일 포함) — 실패해도 페이지 검색에는 영향 없음
  useEffect(() => {
    let cancelled = false;
    getJson('/api/history')
      .then((data) => !cancelled && setHistory(data.items || []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h2 className="text-lg font-bold mb-1">인쇄할 페이지 선택</h2>
        <p className="text-sm text-muted mb-5">연결된 워크스페이스에서 접근 가능한 페이지 목록입니다.</p>

        <div className="relative mb-4">
          <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-placeholder pointer-events-none" aria-hidden />
          <input
            className="input-underline pl-8"
            placeholder="페이지 제목 검색…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* 최근 작업 — 다시 들어갈 수 있는 문서 기록 (검색 중에는 숨김) */}
        {!debouncedQuery && history.length > 0 && (
          <section className="mb-8">
            <h3 className="text-sm font-semibold mt-6 mb-3">최근 작업</h3>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {history.map((h) => (
                <li key={h.pageId}>
                  <button
                    className="w-full text-left card overflow-hidden hover:bg-surface transition-colors"
                    onClick={() => onSelect({ id: h.pageId, title: h.title || '제목 없음', icon: h.icon })}
                  >
                    <div
                      className="aspect-[3/4] bg-surface border-b flex items-center justify-center overflow-hidden"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {h.thumbnail ? (
                        <img src={h.thumbnail} alt="" className="w-full h-full object-cover object-top" />
                      ) : (
                        <FileText size={22} className="text-placeholder" strokeWidth={1.5} aria-hidden />
                      )}
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-sm font-medium truncate">
                        {h.icon ? `${h.icon} ` : ''}
                        {h.title || '제목 없음'}
                      </p>
                      <p className="text-xs text-placeholder">{h.updatedAt?.slice(0, 10)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <h3 className="text-sm font-semibold mt-8 mb-3">전체 페이지</h3>
          </section>
        )}

        {error && <p className="text-sm text-muted py-4">불러오지 못했습니다: {error}</p>}
        {pages === null && <p className="text-sm text-placeholder py-4">검색 중…</p>}
        {pages?.length === 0 && !error && (
          <p className="text-sm text-muted py-4">
            {debouncedQuery ? `"${debouncedQuery}" 결과 없음.` : '접근 가능한 페이지가 없습니다.'}
          </p>
        )}

        <ul className="space-y-1.5">
          {pages?.map((p) => (
            <li key={p.id}>
              <button
                className="w-full flex items-center gap-3 text-left card !rounded-lg px-4 py-3 hover:bg-surface transition-colors"
                onClick={() => onSelect(p)}
              >
                {p.icon ? (
                  <span className="text-base flex-none">{p.icon}</span>
                ) : (
                  <File size={16} className="text-placeholder flex-none" aria-hidden />
                )}
                <span className="flex-1 text-sm font-medium truncate">{p.title}</span>
                <span className="text-xs text-placeholder flex-none">
                  {p.lastEdited?.slice(0, 10)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
