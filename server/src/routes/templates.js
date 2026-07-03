import { Router } from 'express';
import { requireAuth } from './middleware.js';
import { validateTemplate } from '@nps/shared';
import { listTemplates, createTemplate, updateTemplate, deleteTemplate } from '../db/dao.js';

const router = Router();

router.get('/api/templates', requireAuth, (req, res) => {
  // 구버전 style_json도 스키마 기본값(hf 등)이 채워진 형태로 내려준다
  const all = listTemplates(req.user.id).map((t) => {
    const v = validateTemplate(t.style);
    return v.ok ? { ...t, style: v.template } : t;
  });
  res.json({
    presets: all.filter((t) => t.isPreset),
    mine: all.filter((t) => !t.isPreset),
  });
});

router.post('/api/templates', requireAuth, (req, res) => {
  const result = validateTemplate(req.body?.style);
  if (!result.ok) return res.status(400).json({ error: 'invalid_template', issues: result.issues });
  const name = String(req.body?.name || result.template.name).slice(0, 60);
  const id = createTemplate(req.user.id, name, { ...result.template, name });
  res.status(201).json({ id });
});

router.put('/api/templates/:id', requireAuth, (req, res) => {
  const result = validateTemplate(req.body?.style);
  if (!result.ok) return res.status(400).json({ error: 'invalid_template', issues: result.issues });
  const name = String(req.body?.name || result.template.name).slice(0, 60);
  const changed = updateTemplate(req.user.id, Number(req.params.id), name, { ...result.template, name });
  if (!changed) return res.status(404).json({ error: 'not_found' }); // 프리셋/타인 양식은 수정 불가
  res.json({ ok: true });
});

router.delete('/api/templates/:id', requireAuth, (req, res) => {
  const changed = deleteTemplate(req.user.id, Number(req.params.id));
  if (!changed) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

export default router;
