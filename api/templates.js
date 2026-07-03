import { requireSession } from './_lib/session.js';
import { SYSTEM_PRESETS, validateTemplate } from '../shared/index.js';

/**
 * 서버리스 — DB가 없어 커스텀 양식 서버 저장은 미지원(501).
 * 클라이언트는 501을 받으면 localStorage에 저장한다.
 */
export default function handler(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  if (req.method === 'GET') {
    return res.json({
      presets: SYSTEM_PRESETS.map((p, i) => {
        const v = validateTemplate(p);
        return { id: `preset-${i}`, name: p.name, isPreset: true, style: v.ok ? v.template : p };
      }),
      mine: [],
    });
  }
  res.status(501).json({ error: 'stateless', message: '서버 저장 미지원 — 브라우저에 저장됩니다' });
}
