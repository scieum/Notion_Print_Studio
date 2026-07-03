import { requireSession, sendError } from '../_lib/session.js';
import { renderPagePdf, resolveTemplate } from '../_lib/pdf.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const session = requireSession(req, res);
  if (!session) return;
  const pageId = req.body?.pageId;
  if (!pageId) return res.status(400).json({ error: 'pageId required' });
  try {
    const template = resolveTemplate(req.body?.template, res);
    const { pdf, title } = await renderPagePdf({
      token: session.accessToken, pageId, template, preview: false,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${title}.pdf`)}`);
    res.send(pdf);
  } catch (err) {
    sendError(res, err);
  }
}
