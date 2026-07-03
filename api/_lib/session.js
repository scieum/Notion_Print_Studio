import crypto from 'node:crypto';

/**
 * 서버리스 세션: Notion 토큰을 AES-256-GCM으로 암호화한 httpOnly 쿠키.
 * DB가 없는 Vercel 환경에서 C2(토큰 클라이언트 노출 금지)를 지키는 방식 —
 * 쿠키는 httpOnly라 클라이언트 JS가 읽을 수 없고, 내용은 서버 키로만 복호화된다.
 */

const COOKIE_NAME = 'nps_session';

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptSession(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf-8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

export function decryptSession(token) {
  try {
    const buf = Buffer.from(token, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf-8'));
  } catch {
    return null;
  }
}

/** req.cookies는 Vercel Node 런타임이 파싱해 준다. 세션 없으면 null. */
export function getSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  return token ? decryptSession(token) : null;
}

export function setSessionCookie(res, payload) {
  const token = encryptSession(payload);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

/** 인증 필수 핸들러 래퍼: 세션 없으면 401 + reconnect */
export function requireSession(req, res) {
  const session = getSession(req);
  if (!session?.accessToken) {
    res.status(401).json({ error: 'unauthorized', reconnect: true });
    return null;
  }
  return session;
}

/** Notion 401 등 공통 에러 응답 */
export function sendError(res, err) {
  if (err?.notion && err.status === 401) {
    return res.status(401).json({ error: 'notion_unauthorized', reconnect: true });
  }
  console.error(err);
  res.status(err?.status && err.status >= 400 ? err.status : 500).json({ error: err?.message || 'internal_error' });
}
