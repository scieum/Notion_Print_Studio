import { clearSessionCookie } from '../_lib/session.js';

export default function handler(req, res) {
  clearSessionCookie(res);
  res.json({ ok: true });
}
