import { useEffect, useState } from 'react';
import { getJson } from '../lib/api.js';

let fontsCache = null; // 세션 내 1회만 fetch

/** 활성 폰트 목록 select (라이선스 플래그 OFF 폰트는 서버가 목록에서 제외 — C6) */
export default function FontPicker({ value, onChange }) {
  const [fonts, setFonts] = useState(fontsCache || []);

  useEffect(() => {
    if (fontsCache) return;
    getJson('/api/fonts')
      .then((data) => {
        fontsCache = data.fonts;
        setFonts(data.fonts);
      })
      .catch(() => setFonts([]));
  }, []);

  const categories = [...new Set(fonts.map((f) => f.category))];

  return (
    <select className="input-underline" value={value} onChange={(e) => onChange(e.target.value)}>
      {categories.map((cat) => (
        <optgroup key={cat} label={cat}>
          {fonts.filter((f) => f.category === cat).map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </optgroup>
      ))}
      {fonts.length === 0 && <option value={value}>{value}</option>}
    </select>
  );
}
