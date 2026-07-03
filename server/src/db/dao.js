import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from '../config.js';
import { SYSTEM_PRESETS } from '@nps/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const db = new Database(path.join(DATA_DIR, 'nps.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8'));

// --- users / tokens -------------------------------------------------------

export function upsertUser({ notionUserId, name, avatarUrl }) {
  db.prepare(
    `INSERT INTO users (notion_user_id, name, avatar_url) VALUES (?, ?, ?)
     ON CONFLICT(notion_user_id) DO UPDATE SET name = excluded.name, avatar_url = excluded.avatar_url`
  ).run(notionUserId, name ?? null, avatarUrl ?? null);
  return db.prepare('SELECT * FROM users WHERE notion_user_id = ?').get(notionUserId);
}

export function saveToken(userId, { accessToken, workspaceId, workspaceName }) {
  db.prepare(
    `INSERT INTO notion_tokens (user_id, access_token, workspace_id, workspace_name, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET access_token = excluded.access_token,
       workspace_id = excluded.workspace_id, workspace_name = excluded.workspace_name,
       updated_at = datetime('now')`
  ).run(userId, accessToken, workspaceId ?? null, workspaceName ?? null);
}

export function getToken(userId) {
  return db.prepare('SELECT * FROM notion_tokens WHERE user_id = ?').get(userId);
}

// --- sessions ---------------------------------------------------------------

export function createSession(userId) {
  const id = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (id, user_id) VALUES (?, ?)').run(id, userId);
  return id;
}

export function getSessionUser(sessionId) {
  if (!sessionId) return null;
  return db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`
    )
    .get(sessionId);
}

export function deleteSession(sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

// --- templates ---------------------------------------------------------------

export function seedPresets() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM templates WHERE user_id IS NULL').get().n;
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO templates (user_id, name, style_json) VALUES (NULL, ?, ?)');
  for (const preset of SYSTEM_PRESETS) insert.run(preset.name, JSON.stringify(preset));
}

export function listTemplates(userId) {
  const rows = db
    .prepare('SELECT * FROM templates WHERE user_id IS NULL OR user_id = ? ORDER BY user_id IS NOT NULL, id')
    .all(userId);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isPreset: r.user_id === null,
    style: JSON.parse(r.style_json),
  }));
}

export function createTemplate(userId, name, style) {
  const info = db
    .prepare('INSERT INTO templates (user_id, name, style_json) VALUES (?, ?, ?)')
    .run(userId, name, JSON.stringify(style));
  return info.lastInsertRowid;
}

export function updateTemplate(userId, id, name, style) {
  return db
    .prepare(
      `UPDATE templates SET name = ?, style_json = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    )
    .run(name, JSON.stringify(style), id, userId).changes;
}

export function deleteTemplate(userId, id) {
  return db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?').run(id, userId).changes;
}

// --- doc settings -------------------------------------------------------------

export function saveDocSettings(userId, pageId, templateId, override) {
  db.prepare(
    `INSERT INTO doc_settings (user_id, notion_page_id, template_id, override_json, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, notion_page_id) DO UPDATE SET template_id = excluded.template_id,
       override_json = excluded.override_json, updated_at = datetime('now')`
  ).run(userId, pageId, templateId ?? null, override ? JSON.stringify(override) : null);
}

export function getDocSettings(userId, pageId) {
  const row = db
    .prepare('SELECT * FROM doc_settings WHERE user_id = ? AND notion_page_id = ?')
    .get(userId, pageId);
  if (!row) return null;
  return {
    templateId: row.template_id,
    override: row.override_json ? JSON.parse(row.override_json) : null,
  };
}

// --- image cache ---------------------------------------------------------------

export function findCachedImage(blockId, sourceHash) {
  return db
    .prepare('SELECT * FROM image_cache WHERE notion_block_id = ? AND source_hash = ?')
    .get(blockId, sourceHash);
}

export function insertCachedImage({ blockId, sourceHash, filePath, contentType }) {
  const info = db
    .prepare(
      `INSERT INTO image_cache (notion_block_id, source_hash, file_path, content_type)
       VALUES (?, ?, ?, ?)`
    )
    .run(blockId, sourceHash, filePath, contentType ?? null);
  return info.lastInsertRowid;
}

export function getCachedImageById(id) {
  return db.prepare('SELECT * FROM image_cache WHERE id = ?').get(id);
}

// --- render jobs (관측/디버깅용, 설계서 §8) ---------------------------------------

export function startRenderJob(userId, pageId, kind) {
  return db
    .prepare('INSERT INTO render_jobs (user_id, notion_page_id, kind) VALUES (?, ?, ?)')
    .run(userId, pageId, kind).lastInsertRowid;
}

export function finishRenderJob(jobId, status, error = null) {
  db.prepare(
    `UPDATE render_jobs SET status = ?, error = ?, finished_at = datetime('now') WHERE id = ?`
  ).run(status, error, jobId);
}

export function appendRenderJobError(jobId, message) {
  db.prepare(
    `UPDATE render_jobs SET error = COALESCE(error || char(10), '') || ? WHERE id = ?`
  ).run(message, jobId);
}
