import { getSession } from './_lib/session.js';

export default function handler(req, res) {
  const session = getSession(req);
  if (!session?.accessToken) return res.status(401).json({ error: 'unauthorized', reconnect: true });
  res.json({
    user: { name: session.userName, avatarUrl: null },
    workspace: { id: null, name: session.workspaceName },
  });
}
