// '/web' 엔트리는 순수 HTTP(hrana) 클라이언트 — 네이티브 .node 바이너리가 없어
// 서버리스(Vercel) 번들링·콜드스타트에 안전하다. 원격 Turso(libsql://)만 지원.
import { createClient } from '@libsql/client/web';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SYSTEM_PRESETS } from '@nps/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 서버리스(Vercel) 호환 DB: Turso(libSQL) 원격. HTTP 기반이라 함수 호출마다 안전하게 재사용된다.
 * TURSO_DATABASE_URL + TURSO_AUTH_TOKEN 필수 (로컬 개발도 동일한 원격 DB 사용).
 */
if (!process.env.TURSO_DATABASE_URL) {
  throw new Error(
    'TURSO_DATABASE_URL이 설정되지 않았습니다. .env(로컬) 또는 Vercel 환경변수에 Turso 접속 정보를 넣어야 합니다.'
  );
}
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');

// 스키마 생성 + 프리셋 시드를 인스턴스당 1회만 (memoized). 모든 요청은 ensureReady()를 먼저 await.
let readyPromise = null;
export function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.executeMultiple(schemaSql);
      await seedPresets();
    })().catch((err) => {
      readyPromise = null; // 실패 시 다음 요청에서 재시도
      throw err;
    });
  }
  return readyPromise;
}

const run = (sql, args = []) => db.execute({ sql, args });
const first = async (sql, args = []) => (await db.execute({ sql, args })).rows[0] ?? null;
const all = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const lastId = (res) => Number(res.lastInsertRowid);

// --- users / tokens -------------------------------------------------------

export async function upsertUser({ notionUserId, name, avatarUrl }) {
  await run(
    `INSERT INTO users (notion_user_id, name, avatar_url) VALUES (?, ?, ?)
     ON CONFLICT(notion_user_id) DO UPDATE SET name = excluded.name, avatar_url = excluded.avatar_url`,
    [notionUserId, name ?? null, avatarUrl ?? null]
  );
  return first('SELECT * FROM users WHERE notion_user_id = ?', [notionUserId]);
}

export async function saveToken(userId, { accessToken, workspaceId, workspaceName }) {
  await run(
    `INSERT INTO notion_tokens (user_id, access_token, workspace_id, workspace_name, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET access_token = excluded.access_token,
       workspace_id = excluded.workspace_id, workspace_name = excluded.workspace_name,
       updated_at = datetime('now')`,
    [userId, accessToken, workspaceId ?? null, workspaceName ?? null]
  );
}

export function getToken(userId) {
  return first('SELECT * FROM notion_tokens WHERE user_id = ?', [userId]);
}

// --- sessions ---------------------------------------------------------------

export async function createSession(userId) {
  const id = crypto.randomBytes(32).toString('hex');
  await run('INSERT INTO sessions (id, user_id) VALUES (?, ?)', [id, userId]);
  return id;
}

export function getSessionUser(sessionId) {
  if (!sessionId) return null;
  return first(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    [sessionId]
  );
}

export async function deleteSession(sessionId) {
  await run('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

// --- templates ---------------------------------------------------------------

export async function seedPresets() {
  // 이름 기준 upsert — 프리셋 정의(폰트 등)가 바뀌면 배포 시 최신으로 갱신된다.
  // (COUNT 체크 방식은 한 번 시드된 뒤 프리셋 변경이 영영 반영되지 않는 문제가 있었다.)
  for (const preset of SYSTEM_PRESETS) {
    const json = JSON.stringify(preset);
    const res = await run(
      `UPDATE templates SET style_json = ?, updated_at = datetime('now')
       WHERE user_id IS NULL AND name = ?`,
      [json, preset.name]
    );
    if (!res.rowsAffected) {
      await run('INSERT INTO templates (user_id, name, style_json) VALUES (NULL, ?, ?)', [
        preset.name,
        json,
      ]);
    }
  }
}

export async function listTemplates(userId) {
  const rows = await all(
    'SELECT * FROM templates WHERE user_id IS NULL OR user_id = ? ORDER BY user_id IS NOT NULL, id',
    [userId]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    isPreset: r.user_id === null,
    style: JSON.parse(r.style_json),
  }));
}

export async function createTemplate(userId, name, style) {
  const res = await run('INSERT INTO templates (user_id, name, style_json) VALUES (?, ?, ?)', [
    userId,
    name,
    JSON.stringify(style),
  ]);
  return lastId(res);
}

export async function updateTemplate(userId, id, name, style) {
  const res = await run(
    `UPDATE templates SET name = ?, style_json = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [name, JSON.stringify(style), id, userId]
  );
  return res.rowsAffected;
}

export async function deleteTemplate(userId, id) {
  const res = await run('DELETE FROM templates WHERE id = ? AND user_id = ?', [id, userId]);
  return res.rowsAffected;
}

// --- doc settings -------------------------------------------------------------

export async function saveDocSettings(userId, pageId, templateId, override) {
  await run(
    `INSERT INTO doc_settings (user_id, notion_page_id, template_id, override_json, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, notion_page_id) DO UPDATE SET template_id = excluded.template_id,
       override_json = excluded.override_json, updated_at = datetime('now')`,
    [userId, pageId, templateId ?? null, override ? JSON.stringify(override) : null]
  );
}

export async function getDocSettings(userId, pageId) {
  const row = await first(
    'SELECT * FROM doc_settings WHERE user_id = ? AND notion_page_id = ?',
    [userId, pageId]
  );
  if (!row) return null;
  return {
    templateId: row.template_id,
    override: row.override_json ? JSON.parse(row.override_json) : null,
  };
}

// --- page history (작업 기록 + 썸네일) -------------------------------------------
// 기록 실패가 본 기능(페이지 열기/렌더)을 막지 않도록 best-effort.

export async function upsertPageHistory(userId, pageId, { title, icon } = {}) {
  try {
    await run(
      `INSERT INTO page_history (user_id, notion_page_id, title, icon, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, notion_page_id) DO UPDATE SET
         title = excluded.title, icon = excluded.icon, updated_at = datetime('now')`,
      [userId, pageId, title ?? null, icon ?? null]
    );
  } catch {
    /* 기록 실패는 무시 */
  }
}

export async function saveHistoryThumbnail(userId, pageId, thumbnail) {
  try {
    await run(
      `INSERT INTO page_history (user_id, notion_page_id, thumbnail, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, notion_page_id) DO UPDATE SET
         thumbnail = excluded.thumbnail, updated_at = datetime('now')`,
      [userId, pageId, thumbnail]
    );
  } catch {
    /* 기록 실패는 무시 */
  }
}

export function listPageHistory(userId, limit = 24) {
  return all(
    `SELECT notion_page_id, title, icon, thumbnail, updated_at
     FROM page_history WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`,
    [userId, limit]
  );
}

// --- image cache ---------------------------------------------------------------

export function findCachedImage(blockId, sourceHash) {
  return first(
    'SELECT id, content_type FROM image_cache WHERE notion_block_id = ? AND source_hash = ?',
    [blockId, sourceHash]
  );
}

export async function insertCachedImage({ blockId, sourceHash, bytes, contentType }) {
  const res = await run(
    `INSERT INTO image_cache (notion_block_id, source_hash, bytes, content_type)
     VALUES (?, ?, ?, ?)`,
    [blockId, sourceHash, bytes, contentType ?? null]
  );
  return lastId(res);
}

export function getCachedImageById(id) {
  return first('SELECT id, bytes, content_type FROM image_cache WHERE id = ?', [id]);
}

// --- render jobs (관측/디버깅용, 설계서 §8) ---------------------------------------
// 서버리스에서 렌더 지연을 늘리지 않도록 best-effort: 실패해도 렌더를 막지 않는다.

export async function startRenderJob(userId, pageId, kind) {
  try {
    const res = await run(
      'INSERT INTO render_jobs (user_id, notion_page_id, kind) VALUES (?, ?, ?)',
      [userId, pageId, kind]
    );
    return lastId(res);
  } catch {
    return null;
  }
}

export async function finishRenderJob(jobId, status, error = null) {
  if (jobId == null) return;
  try {
    await run(
      `UPDATE render_jobs SET status = ?, error = ?, finished_at = datetime('now') WHERE id = ?`,
      [status, error, jobId]
    );
  } catch {
    /* 관측용 로그 실패는 무시 */
  }
}

export async function appendRenderJobError(jobId, message) {
  if (jobId == null) return;
  try {
    await run(
      `UPDATE render_jobs SET error = COALESCE(error || char(10), '') || ? WHERE id = ?`,
      [message, jobId]
    );
  } catch {
    /* 관측용 로그 실패는 무시 */
  }
}
