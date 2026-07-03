import { Router } from 'express';
import crypto from 'node:crypto';
import { buildAuthUrl, exchangeCode } from '../notion/oauth.js';
import { upsertUser, saveToken, createSession, deleteSession, getSessionUser, getToken } from '../db/dao.js';
import { config } from '../config.js';
import { notionRequest } from '../notion/client.js';

const router = Router();

const SESSION_COOKIE = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

/** 내부 인티그레이션 토큰이 설정돼 있으면 OAuth 없이 세션을 부트스트랩 (개발용) */
async function bootstrapInternalSession(res) {
  const token = config.notion.internalToken;
  if (!token) return null;
  try {
    const bot = await notionRequest(token, '/users/me'); // 토큰 유효성 검증 겸용
    const user = upsertUser({
      notionUserId: bot.id,
      name: bot.name || '내부 연동',
      avatarUrl: bot.avatar_url,
    });
    saveToken(user.id, {
      accessToken: token,
      workspaceId: null,
      workspaceName: bot.bot?.workspace_name || '내부 인티그레이션',
    });
    res.cookie('sid', createSession(user.id), SESSION_COOKIE);
    return user;
  } catch {
    return null; // 토큰이 무효하면 일반 401 흐름으로
  }
}

router.get('/auth/notion', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
  res.redirect(buildAuthUrl(state));
});

router.get('/auth/notion/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query;
    if (error || !code) return res.redirect(config.clientUrl + '/?connect_error=1');
    if (!state || state !== req.cookies?.oauth_state) return res.redirect(config.clientUrl + '/?connect_error=state');
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

    res.cookie('sid', createSession(user.id), SESSION_COOKIE);
    res.redirect(config.clientUrl);
  } catch (err) {
    next(err);
  }
});

router.post('/auth/logout', (req, res) => {
  if (req.cookies?.sid) deleteSession(req.cookies.sid);
  res.clearCookie('sid');
  res.json({ ok: true });
});

router.get('/api/me', async (req, res) => {
  let user = getSessionUser(req.cookies?.sid);
  if (!user) user = await bootstrapInternalSession(res);
  if (!user) return res.status(401).json({ error: 'unauthorized', reconnect: true });
  const token = getToken(user.id);
  res.json({
    user: { name: user.name, avatarUrl: user.avatar_url },
    workspace: token ? { id: token.workspace_id, name: token.workspace_name } : null,
  });
});

export default router;
