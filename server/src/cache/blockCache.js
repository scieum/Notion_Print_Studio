import { config } from '../config.js';

/**
 * 정규화 블록 인메모리 캐시 (설계서 §4 — 페이지별, TTL 10분).
 * 설정만 바꾸는 미리보기 재렌더는 Notion API 재호출 없이 여기서 읽는다.
 */
const cache = new Map(); // key: `${userId}:${pageId}` → { title, blocks, cachedAt }

export function getCachedPage(userId, pageId) {
  const entry = cache.get(`${userId}:${pageId}`);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > config.blockCacheTtlMs) {
    cache.delete(`${userId}:${pageId}`);
    return null;
  }
  return entry;
}

export function setCachedPage(userId, pageId, { title, blocks }) {
  cache.set(`${userId}:${pageId}`, { title, blocks, cachedAt: Date.now() });
}
