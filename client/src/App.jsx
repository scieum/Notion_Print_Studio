import { useEffect, useState } from 'react';
import { Printer, ArrowLeft } from 'lucide-react';
import { getJson } from './lib/api.js';
import Connect from './pages/Connect.jsx';
import PageSelect from './pages/PageSelect.jsx';
import Editor from './pages/Editor.jsx';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [page, setPage] = useState(null); // 선택된 노션 페이지 {id, title, icon}

  useEffect(() => {
    getJson('/api/me')
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-muted text-sm">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="flex-none flex items-center gap-3 px-4 h-12 border-b" style={{ borderColor: 'var(--border)' }}>
        {/* 로고 클릭 → 홈(페이지 선택)으로 */}
        <button
          className="flex items-center gap-3 rounded px-1 -mx-1 hover:bg-surface transition-colors"
          onClick={() => setPage(null)}
          aria-label="홈으로"
        >
          <Printer size={18} className="text-accent" aria-hidden />
          <span className="text-sm font-semibold">Notion Print Studio</span>
        </button>
        {me?.workspace?.name && (
          <span className="text-xs text-muted">{me.workspace.name}</span>
        )}
        <div className="flex-1" />
        {page && (
          <button className="btn-secondary !py-1 !px-3 text-xs" onClick={() => setPage(null)}>
            <ArrowLeft size={14} aria-hidden /> 페이지 변경
          </button>
        )}
      </header>

      <main className="flex-1 min-h-0">
        {!me ? (
          <Connect />
        ) : !page ? (
          <PageSelect onSelect={setPage} onReconnect={() => setMe(null)} />
        ) : (
          <Editor page={page} onReconnect={() => setMe(null)} />
        )}
      </main>

      {/* 푸터 — 에디터 화면에서는 작업 공간 확보를 위해 숨김 */}
      {!page && (
        <footer
          className="flex-none flex items-center justify-center gap-2 h-10 border-t text-xs text-placeholder"
          style={{ borderColor: 'var(--border)' }}
        >
          <span>© 2026 NotionTalk. All rights reserved.</span>
          <span aria-hidden>·</span>
          <a
            href="https://open.kakao.com/o/gpSvPKGg"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 hover:underline"
            style={{ color: 'var(--muted)' }}
          >
            {/* 브랜드 로고라 예외적으로 고유 색(카카오 옐로우) 유지 — currentColor 상속 안 함 */}
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden focusable="false">
              <rect width="24" height="24" rx="7" fill="#FEE500" />
              <path
                d="M12 5.5c-4.28 0-7.75 2.78-7.75 6.2 0 2.19 1.4 4.12 3.52 5.23-.15.57-.56 2.07-.64 2.39-.1.4.15.39.31.29.13-.09 2.08-1.41 2.92-1.99.52.07 1.05.11 1.64.11 4.28 0 7.75-2.78 7.75-6.2S16.28 5.5 12 5.5z"
                fill="#3C1E1E"
              />
            </svg>
            카카오톡 오픈채팅
          </a>
        </footer>
      )}
    </div>
  );
}
