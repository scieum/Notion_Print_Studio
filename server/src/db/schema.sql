-- 설계서 §8 SQLite 스키마 + 세션 테이블

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notion_user_id TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notion_tokens (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  access_token TEXT NOT NULL,
  workspace_id TEXT,
  workspace_name TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id), -- NULL이면 시스템 프리셋
  name TEXT NOT NULL,
  style_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS doc_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  notion_page_id TEXT NOT NULL,
  template_id INTEGER REFERENCES templates(id),
  override_json TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, notion_page_id)
);

-- 서버리스(Vercel)에서는 디스크가 임시/읽기전용이라 이미지 바이트를 DB에 직접 저장한다 (C4).
CREATE TABLE IF NOT EXISTS image_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notion_block_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  bytes BLOB NOT NULL,
  content_type TEXT,
  width INTEGER,
  height INTEGER,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_image_cache_block ON image_cache(notion_block_id, source_hash);

CREATE TABLE IF NOT EXISTS render_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  notion_page_id TEXT,
  kind TEXT CHECK (kind IN ('preview','pdf')),
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  error TEXT
);

-- 작업 기록: 사용자가 열었던 문서 + 미리보기 썸네일(작은 JPEG data URL) — 재진입용
CREATE TABLE IF NOT EXISTS page_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  notion_page_id TEXT NOT NULL,
  title TEXT,
  icon TEXT,
  thumbnail TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, notion_page_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
