import { setSessionCookie } from '../_lib/session.js';

/** OAuth 콜백 — code를 토큰으로 교환해 암호화 쿠키에 저장 후 앱으로 복귀 */
export default async function handler(req, res) {
  const { code, state, error } = req.query;
  if (error || !code) return res.redirect(302, '/?connect_error=1');
  if (!state || state !== req.cookies?.oauth_state) return res.redirect(302, '/?connect_error=state');

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = process.env.NOTION_REDIRECT_URI || `https://${host}/auth/notion/callback`;
  const basic = Buffer.from(
    `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
  ).toString('base64');

  try {
    const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    });
    if (!tokenRes.ok) {
      console.error('token exchange failed', tokenRes.status, await tokenRes.text().catch(() => ''));
      return res.redirect(302, '/?connect_error=exchange');
    }
    const data = await tokenRes.json();
    setSessionCookie(res, {
      accessToken: data.access_token,
      workspaceName: data.workspace_name || null,
      userName: data.owner?.user?.name || null,
    });
    res.redirect(302, '/');
  } catch (err) {
    console.error(err);
    res.redirect(302, '/?connect_error=1');
  }
}
