import { Router } from 'express';
import crypto from 'node:crypto';
import { buildAuthUrl, exchangeCode } from '../notion/oauth.js';
import { upsertUser, saveToken, createSession, deleteSession, getSessionUser, getToken } from '../db/dao.js';
import { config } from '../config.js';

const router = Router();

router.get('/auth/notion', (req, res) => {
  // 쿠키는 도메인별 저장이고 콜백은 항상 NOTION_REDIRECT_URI의 도메인으로 돌아온다.
  // 다른 도메인(Vercel 배포별 URL, 프로젝트 별칭 등)에서 시작하면 state·세션 쿠키가
  // 콜백 도메인에 없어 로그인이 조용히 튕긴다 → 먼저 canonical 도메인으로 이동시킨다.
  try {
    const canonical = new URL(config.notion.redirectUri);
    const reqHost = req.headers['x-forwarded-host'] || req.headers.host;
    if (reqHost && reqHost !== canonical.host && !String(reqHost).startsWith('localhost')) {
      return res.redirect(`${canonical.origin}/auth/notion`);
    }
  } catch {
    /* redirectUri 파싱 실패 시 기존 흐름 유지 */
  }
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
    const user = await upsertUser({
      notionUserId: owner?.id || tokenRes.bot_id,
      name: owner?.name,
      avatarUrl: owner?.avatar_url,
    });
    await saveToken(user.id, {
      accessToken: tokenRes.access_token,
      workspaceId: tokenRes.workspace_id,
      workspaceName: tokenRes.workspace_name,
    });

    const sid = await createSession(user.id);
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

router.post('/auth/logout', async (req, res, next) => {
  try {
    if (req.cookies?.sid) await deleteSession(req.cookies.sid);
    res.clearCookie('sid');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/api/me', async (req, res, next) => {
  try {
    const user = await getSessionUser(req.cookies?.sid);
    // TODO: 진단 후 제거 — 401 원인 추적용 임시 디버그 필드
    if (!user) {
      return res.status(401).json({
        error: 'unauthorized',
        reconnect: true,
        d: { sid6: (req.cookies?.sid || '').slice(0, 6), hasCookieHeader: !!req.headers.cookie },
      });
    }
    const token = await getToken(user.id);
    res.json({
      user: { name: user.name, avatarUrl: user.avatar_url },
      workspace: token ? { id: token.workspace_id, name: token.workspace_name } : null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
