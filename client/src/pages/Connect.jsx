import { Link2, ShieldCheck, FileText } from 'lucide-react';

export default function Connect() {
  const connectError = new URLSearchParams(location.search).has('connect_error');

  return (
    <div className="h-full flex items-center justify-center bg-surface">
      <div className="card max-w-md w-full mx-4 p-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight mb-2">Notion Print Studio</h1>
        <p className="text-sm text-muted leading-relaxed mb-6">
          노션 페이지를 연결하면 여백·자간·행간·폰트까지,
          <br />
          워드프로세서 수준의 인쇄 제어로 고품질 PDF를 만듭니다.
        </p>

        {connectError && (
          <p className="text-sm mb-4 text-muted">
            연결에 실패했습니다. 다시 시도해 주세요.
          </p>
        )}

        <a href="/auth/notion" className="btn-primary justify-center w-full">
          <Link2 size={16} aria-hidden />
          Notion 워크스페이스 연결
        </a>

        <div className="mt-6 pt-5 border-t text-left space-y-2" style={{ borderColor: 'var(--border)' }}>
          <p className="flex items-center gap-2 text-xs text-muted">
            <ShieldCheck size={14} aria-hidden /> 읽기 전용 — 노션에 어떤 것도 쓰지 않습니다.
          </p>
          <p className="flex items-center gap-2 text-xs text-muted">
            <FileText size={14} aria-hidden /> 연결 시 인쇄할 페이지를 직접 선택합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
