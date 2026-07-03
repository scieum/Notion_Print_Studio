import { useEffect, useState } from 'react';
import { Search, File } from 'lucide-react';
import { postJson } from '../lib/api.js';
import { useDebouncedValue } from '../lib/useDebounce.js';

export default function PageSelect({ onSelect, onReconnect }) {
  const [query, setQuery] = useState('');
  const [pages, setPages] = useState(null); // null = 로딩
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h2 className="text-lg font-bold mb-1">인쇄할 페이지 선택</h2>
        <p className="text-sm text-muted mb-5">연결된 워크스페이스에서 접근 가능한 페이지 목록입니다.</p>

        <div className="relative mb-4">
          <Search size={16} className="absolute left-0 top-2.5 text-placeholder" aria-hidden />
          <input
            className="input-underline pl-6"
            placeholder="페이지 제목 검색…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

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
