import { Router } from 'express';
import { getImageFile } from '../cache/imageCache.js';
import { enabledFonts } from '../render/cssVars.js';

const router = Router();

/** 캐시된 이미지 서빙 (설계서 §9). 숫자 ID만 노출 — 원본 노션 URL은 드러나지 않는다. */
router.get('/img/:cacheId', async (req, res, next) => {
  try {
    const img = await getImageFile(Number(req.params.cacheId));
    if (!img) return res.status(404).end();
    res.set('Content-Type', img.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(img.bytes);
  } catch (err) {
    next(err);
  }
});

/** 활성 폰트 목록 (FontPicker용) — 라이선스 플래그 OFF 폰트는 여기 안 나온다 (C6) */
router.get('/api/fonts', (req, res) => {
  res.json({
    fonts: enabledFonts().map((f) => ({ id: f.id, name: f.name, category: f.category })),
  });
});

// TODO: 진단 후 제거 — DB 상태·최근 렌더 에러 확인용 임시 엔드포인트 (키 없으면 404)
router.get('/api/_diag2', async (req, res) => {
  if (req.query.k !== 'nps-diag-7f3a91') return res.status(404).end();
  try {
    const { createClient } = await import('@libsql/client/web');
    const db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    const q = async (sql) => (await db.execute(sql)).rows;
    res.json({
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7),
      users: await q('SELECT id, created_at FROM users'),
      sessions: await q('SELECT substr(id,1,6) AS id6, user_id, created_at FROM sessions ORDER BY created_at DESC LIMIT 5'),
      renderJobs: await q("SELECT id, kind, status, started_at, substr(COALESCE(error,''),1,300) AS err FROM render_jobs ORDER BY id DESC LIMIT 5"),
    });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err).slice(0, 300) });
  }
});

export default router;
