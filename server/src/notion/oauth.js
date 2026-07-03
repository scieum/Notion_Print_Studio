import { config } from '../config.js';

export function buildAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: config.notion.clientId,
    response_type: 'code',
    owner: 'user',
    redirect_uri: config.notion.redirectUri,
    state,
  });
  return `https://api.notion.com/v1/oauth/authorize?${params}`;
}

/** code → access_token 교환. 응답에 workspace 정보와 owner user가 포함된다. */
export async function exchangeCode(code) {
  const basic = Buffer.from(
    `${config.notion.clientId}:${config.notion.clientSecret}`
  ).toString('base64');

  const res = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.notion.redirectUri,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OAuth token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}
