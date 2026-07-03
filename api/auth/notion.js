import crypto from 'node:crypto';

/** OAuth 시작 — Notion 인증 화면으로 리다이렉트. redirect_uri는 이 배포의 /auth/notion/callback */
export default function handler(req, res) {
  const state = crypto.randomBytes(16).toString('hex');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = process.env.NOTION_REDIRECT_URI || `https://${host}/auth/notion/callback`;

  const params = new URLSearchParams({
    client_id: process.env.NOTION_CLIENT_ID || '',
    response_type: 'code',
    owner: 'user',
    redirect_uri: redirectUri,
    state,
  });

  res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  res.redirect(302, `https://api.notion.com/v1/oauth/authorize?${params}`);
}
