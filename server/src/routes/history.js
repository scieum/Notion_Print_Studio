import { Router } from 'express';
import { requireAuth } from './middleware.js';
import { listPageHistory, saveHistoryThumbnail } from '../db/dao.js';

const router = Router();

/** 최근 작업 목록 (썸네일 포함). 페이지 ID는 응답 body로만 오간다 (C5). */
router.get('/api/history', requireAuth, async (req, res, next) => {
  try {
    const rows = await listPageHistory(req.user.id);
    res.json({
      items: rows.map((r) => ({
        pageId: r.notion_page_id,
        title: r.title,
        icon: r.icon,
        thumbnail: r.thumbnail,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** 미리보기 1페이지 썸네일 저장 (클라이언트 pdf.js 캔버스에서 생성한 JPEG data URL). */
router.post('/api/history/thumbnail', requireAuth, async (req, res, next) => {
  try {
    const { pageId, thumbnail } = req.body || {};
    if (!pageId) return res.status(400).json({ error: 'pageId required' });
    if (typeof thumbnail !== 'string' || !thumbnail.startsWith('data:image/') || thumbnail.length > 200_000) {
      return res.status(400).json({ error: 'invalid thumbnail' });
    }
    await saveHistoryThumbnail(req.user.id, pageId, thumbnail);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
