import { Router } from 'express';
import crypto from 'node:crypto';
import { buildAuthUrl, exchangeCode } from '../notion/oauth.js';
import { upsertUser, saveToken, createSession, deleteSession, getSessionUser, getToken } from '../db/dao.js';

const router = Router();

router.get('/auth/notion', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
  res.redirect(buildAuthUrl(state));
});

router.get('/auth/notion/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query;
    if (error || !code) return res.redirect('/?connect_error=1');
    if (!state || state !== req.cookies?.oauth_state) return res.redirect('/?connect_error=state');
    res.clearCookie('oauth_state');

    const tokenRes = await exchangeCode(code);
    const owner = tokenRes.owner?.user;
    const user = upsertUser({
      notionUserId: owner?.id || tokenRes.bot_id,
      name: owner?.name,
      avatarUrl: owner?.avatar_url,
    });
    saveToken(user.id, {
      accessToken: tokenRes.access_token,
      workspaceId: tokenRes.workspace_id,
      workspaceName: tokenRes.workspace_name,
    });

    const sid = createSession(user.id);
    res.cookie('sid', sid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

router.post('/auth/logout', (req, res) => {
  if (req.cookies?.sid) deleteSession(req.cookies.sid);
  res.clearCookie('sid');
  res.json({ ok: true });
});

router.get('/api/me', (req, res) => {
  const user = getSessionUser(req.cookies?.sid);
  if (!user) return res.status(401).json({ error: 'unauthorized', reconnect: true });
  const token = getToken(user.id);
  res.json({
    user: { name: user.name, avatarUrl: user.avatar_url },
    workspace: token ? { id: token.workspace_id, name: token.workspace_name } : null,
  });
});

export default router;
