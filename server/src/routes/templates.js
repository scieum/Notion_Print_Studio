import { Router } from 'express';
import { requireAuth } from './middleware.js';
import { validateTemplate } from '@nps/shared';
import { listTemplates, createTemplate, updateTemplate, deleteTemplate } from '../db/dao.js';

const router = Router();

router.get('/api/templates', requireAuth, async (req, res, next) => {
  try {
    const all = await listTemplates(req.user.id);
    res.json({
      presets: all.filter((t) => t.isPreset),
      mine: all.filter((t) => !t.isPreset),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/api/templates', requireAuth, async (req, res, next) => {
  try {
    const result = validateTemplate(req.body?.style);
    if (!result.ok) return res.status(400).json({ error: 'invalid_template', issues: result.issues });
    const name = String(req.body?.name || result.template.name).slice(0, 60);
    const id = await createTemplate(req.user.id, name, { ...result.template, name });
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

router.put('/api/templates/:id', requireAuth, async (req, res, next) => {
  try {
    const result = validateTemplate(req.body?.style);
    if (!result.ok) return res.status(400).json({ error: 'invalid_template', issues: result.issues });
    const name = String(req.body?.name || result.template.name).slice(0, 60);
    const changed = await updateTemplate(req.user.id, Number(req.params.id), name, { ...result.template, name });
    if (!changed) return res.status(404).json({ error: 'not_found' }); // 프리셋/타인 양식은 수정 불가
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/api/templates/:id', requireAuth, async (req, res, next) => {
  try {
    const changed = await deleteTemplate(req.user.id, Number(req.params.id));
    if (!changed) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
