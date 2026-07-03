import { requireSession, sendError } from '../_lib/session.js';
import { getNormalizedPage } from '../_lib/getPage.js';

/** 서버리스 — 캐시/DB 없음: 제목·블록 수만 반환하고 저장된 문서 설정은 없다 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const session = requireSession(req, res);
  if (!session) return;
  const pageId = req.body?.pageId;
  if (!pageId) return res.status(400).json({ error: 'pageId required' });
  try {
    const { title, blocks } = await getNormalizedPage(session.accessToken, pageId);
    res.json({ title, blockCount: blocks.length, savedSettings: null });
  } catch (err) {
    sendError(res, err);
  }
}
