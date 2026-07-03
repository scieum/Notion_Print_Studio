import { Router } from 'express';
import { getImageFile } from '../cache/imageCache.js';
import { enabledFonts } from '../render/cssVars.js';

const router = Router();

/** 캐시된 이미지 서빙 (설계서 §9). 숫자 ID만 노출 — 원본 노션 URL은 드러나지 않는다. */
router.get('/img/:cacheId', (req, res) => {
  const row = getImageFile(Number(req.params.cacheId));
  if (!row) return res.status(404).end();
  res.set('Content-Type', row.content_type || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(row.file_path);
});

/** 활성 폰트 목록 (FontPicker용) — 라이선스 플래그 OFF 폰트는 여기 안 나온다 (C6) */
router.get('/api/fonts', (req, res) => {
  res.json({
    fonts: enabledFonts().map((f) => ({ id: f.id, name: f.name, category: f.category })),
  });
});

export default router;
