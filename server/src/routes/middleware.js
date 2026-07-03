import { getSessionUser, getToken } from '../db/dao.js';

/** 세션 쿠키(httpOnly) → req.user / req.notionToken 부착. 미인증이면 401. */
export function requireAuth(req, res, next) {
  const user = getSessionUser(req.cookies?.sid);
  if (!user) return res.status(401).json({ error: 'unauthorized', reconnect: true });
  const token = getToken(user.id);
  if (!token) return res.status(401).json({ error: 'no_token', reconnect: true });
  req.user = user;
  req.notionToken = token.access_token;
  req.workspace = { id: token.workspace_id, name: token.workspace_name };
  next();
}

/** Notion 401(토큰 만료/권한 회수) → 프론트 재연결 유도 (설계서 §5) */
export function errorHandler(err, req, res, _next) {
  if (err?.notion && err.status === 401) {
    return res.status(401).json({ error: 'notion_unauthorized', reconnect: true });
  }
  console.error(err);
  res.status(err?.status || 500).json({ error: err?.message || 'internal_error' });
}
