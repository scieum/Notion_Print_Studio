import { enabledFonts } from '../server/src/render/cssVars.js';

export default function handler(req, res) {
  res.json({
    fonts: enabledFonts().map((f) => ({ id: f.id, name: f.name, category: f.category })),
  });
}
