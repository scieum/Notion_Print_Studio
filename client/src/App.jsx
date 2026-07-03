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
        <Printer size={18} className="text-accent" aria-hidden />
        <span className="text-sm font-semibold">Notion Print Studio</span>
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
    </div>
  );
}
