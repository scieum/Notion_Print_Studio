import { requireSession, sendError } from '../_lib/session.js';
import { searchPages, extractPageTitle } from '../../server/src/notion/client.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const result = await searchPages(session.accessToken, req.body?.query);
    res.json({
      pages: result.results.map((p) => ({
        id: p.id,
        title: extractPageTitle(p),
        icon: p.icon?.type === 'emoji' ? p.icon.emoji : null,
        lastEdited: p.last_edited_time,
      })),
    });
  } catch (err) {
    sendError(res, err);
  }
}
