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

// TODO: 배포 환경 진단 후 제거 — DB 연결 대상·렌더 가능 여부 확인용 임시 엔드포인트
router.get('/api/_diag', async (req, res) => {
  let tursoHost = null;
  try {
    tursoHost = new URL((process.env.TURSO_DATABASE_URL || '').replace('libsql://', 'https://')).host;
  } catch {
    /* 미설정 */
  }
  let render = null;
  try {
    const [{ renderPdf }, { DEFAULT_TEMPLATE }] = await Promise.all([
      import('../render/puppeteerPool.js'),
      import('@nps/shared'),
    ]);
    const pdf = await renderPdf({ html: '<h1>diag</h1>', template: DEFAULT_TEMPLATE, preview: true });
    render = { ok: pdf.subarray(0, 5).toString('latin1') === '%PDF-', bytes: pdf.length };
  } catch (err) {
    render = { ok: false, error: String((err && err.message) || err).slice(0, 400) };
  }
  res.json({
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7),
    nodeEnv: process.env.NODE_ENV,
    tursoHost,
    render,
  });
});

export default router;
