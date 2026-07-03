import { Router } from 'express';
import { requireAuth } from './middleware.js';
import { searchPages, retrievePage, extractPageTitle } from '../notion/client.js';
import { fetchBlockTree } from '../notion/blockFetcher.js';
import { normalizeBlocks } from '../normalize/normalizer.js';
import { getCachedPage, setCachedPage } from '../cache/blockCache.js';
import { cacheImage } from '../cache/imageCache.js';
import { getDocSettings } from '../db/dao.js';

const router = Router();

// 페이지 ID 등 민감 식별자는 POST body로만 (불변 제약 C5)

router.post('/api/pages/search', requireAuth, async (req, res, next) => {
  try {
    const { query } = req.body || {};
    const result = await searchPages(req.notionToken, query);
    res.json({
      pages: result.results.map((p) => ({
        id: p.id,
        title: extractPageTitle(p),
        icon: p.icon?.type === 'emoji' ? p.icon.emoji : null,
        lastEdited: p.last_edited_time,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** 블록 트리 fetch + 정규화 + 캐시 (설계서 §4 ①~②). 재요청 시 캐시 반환. */
export async function getNormalizedPage(user, token, pageId, logError = () => {}) {
  const cached = getCachedPage(user.id, pageId);
  if (cached) return cached;

  const [page, rawBlocks] = await Promise.all([
    retrievePage(token, pageId),
    fetchBlockTree(token, pageId),
  ]);
  const blocks = await normalizeBlocks(rawBlocks, {
    cacheImage: (blockId, url) => cacheImage(blockId, url),
    logError,
  });
  const entry = { title: extractPageTitle(page), blocks };
  setCachedPage(user.id, pageId, entry);
  return entry;
}

router.post('/api/pages/fetch', requireAuth, async (req, res, next) => {
  try {
    const { pageId } = req.body || {};
    if (!pageId) return res.status(400).json({ error: 'pageId required' });
    const { title, blocks } = await getNormalizedPage(req.user, req.notionToken, pageId);
    const saved = getDocSettings(req.user.id, pageId);
    res.json({
      title,
      blockCount: blocks.length,
      savedSettings: saved, // 문서별 마지막 인쇄 설정 (doc_settings)
    });
  } catch (err) {
    next(err);
  }
});

export default router;
