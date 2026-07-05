import { Router } from 'express';
import { requireAuth } from './middleware.js';
import { validateTemplate, DEFAULT_TEMPLATE } from '@nps/shared';
import { getNormalizedPage } from './pages.js';
import { buildHtml } from '../render/htmlBuilder.js';
import { renderPdf, RENDER_BASE_URL } from '../render/puppeteerPool.js';
import {
  startRenderJob, finishRenderJob, appendRenderJobError, saveDocSettings,
} from '../db/dao.js';

const router = Router();

/**
 * 양식 검증. 실패 시 기본 프리셋으로 폴백 + 응답 헤더로 알림 (설계서 §11 단계 6).
 */
function resolveTemplate(input, res) {
  const result = validateTemplate(input ?? DEFAULT_TEMPLATE);
  if (result.ok) return result.template;
  res.set('X-Template-Fallback', '1');
  return DEFAULT_TEMPLATE;
}

async function handleRender(req, res, next, kind) {
  const { pageId, template: templateInput } = req.body || {};
  if (!pageId) return res.status(400).json({ error: 'pageId required' });

  const template = resolveTemplate(templateInput, res);
  const jobId = await startRenderJob(req.user.id, pageId, kind);
  try {
    const { title, blocks } = await getNormalizedPage(
      req.user, req.notionToken, pageId,
      (msg) => appendRenderJobError(jobId, msg)
    );
    const html = buildHtml({
      title, blocks, template,
      baseUrl: RENDER_BASE_URL, // Puppeteer 요청 가로채기가 이미지(/img/:id)를 DB에서 응답
    });
    const pdf = await renderPdf({ html, template, title, preview: kind === 'preview' });

    // PDF 헤더 매직바이트 검증 (설계서 §11 단계 8)
    if (pdf.length < 5 || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new Error('invalid PDF output');
    }

    await saveDocSettings(req.user.id, pageId, null, template); // 문서별 마지막 인쇄 설정 저장
    await finishRenderJob(jobId, 'done');

    res.set('Content-Type', 'application/pdf');
    if (kind === 'pdf') {
      const filename = encodeURIComponent(`${title}.pdf`);
      res.set('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    }
    res.send(Buffer.from(pdf));
  } catch (err) {
    await finishRenderJob(jobId, 'error', err.message);
    next(err);
  }
}

// TODO(설계서 §9): preview는 페이지별 PNG 목록이 목표 — 초안은 저사양 PDF로 대체
router.post('/api/render/preview', requireAuth, (req, res, next) => handleRender(req, res, next, 'preview'));
router.post('/api/render/pdf', requireAuth, (req, res, next) => handleRender(req, res, next, 'pdf'));

export default router;
