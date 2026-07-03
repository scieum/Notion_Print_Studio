import FontPicker from './FontPicker.jsx';

/** 설정 패널 — 여백/자간/행간/폰트/배경색/제목 스타일 (설계서 §1.1) */
export default function SettingsPanel({ template, onChange }) {
  const set = (path, value) => {
    const next = structuredClone(template);
    let obj = next;
    const keys = path.split('.');
    for (const key of keys.slice(0, -1)) obj = obj[key];
    obj[keys.at(-1)] = value;
    onChange(next);
  };

  const num = (path, value) => set(path, Number(value));

  return (
    <div className="space-y-5 text-sm">
      <Section title="용지">
        <Row label="크기">
          <select className="input-underline" value={template.page.size} onChange={(e) => set('page.size', e.target.value)}>
            <option value="A4">A4</option>
            <option value="B5">B5</option>
            <option value="Letter">Letter</option>
          </select>
        </Row>
        <Row label="방향">
          <select className="input-underline" value={template.page.orientation} onChange={(e) => set('page.orientation', e.target.value)}>
            <option value="portrait">세로</option>
            <option value="landscape">가로</option>
          </select>
        </Row>
        <Row label="여백 (mm)">
          <div className="grid grid-cols-4 gap-2">
            {['top', 'bottom', 'left', 'right'].map((side) => (
              <label key={side} className="block">
                <span className="text-[11px] text-placeholder block">
                  {{ top: '상', bottom: '하', left: '좌', right: '우' }[side]}
                </span>
                <input
                  type="number" min="0" max="60" className="input-underline"
                  value={template.page.margin[side]}
                  onChange={(e) => num(`page.margin.${side}`, e.target.value)}
                />
              </label>
            ))}
          </div>
        </Row>
        <Row label="용지 배경색">
          <input
            type="color" value={template.page.background}
            className="h-7 w-14 rounded border cursor-pointer bg-transparent"
            style={{ borderColor: 'var(--border)' }}
            onChange={(e) => set('page.background', e.target.value)}
          />
        </Row>
      </Section>

      <Section title="본문">
        <Row label="폰트">
          <FontPicker value={template.body.font} onChange={(id) => set('body.font', id)} />
        </Row>
        <Row label={`크기 ${template.body.size}pt`}>
          <input type="range" min="8" max="16" step="0.5" className="w-full accent-[var(--accent)]"
            value={template.body.size} onChange={(e) => num('body.size', e.target.value)} />
        </Row>
        <Row label={`행간 ${template.body.lineHeight.toFixed(2)}`}>
          <input type="range" min="1" max="2.5" step="0.05" className="w-full accent-[var(--accent)]"
            value={template.body.lineHeight} onChange={(e) => num('body.lineHeight', e.target.value)} />
        </Row>
        <Row label={`자간 ${template.body.letterSpacing.toFixed(3)}em`}>
          <input type="range" min="-0.05" max="0.3" step="0.005" className="w-full accent-[var(--accent)]"
            value={template.body.letterSpacing} onChange={(e) => num('body.letterSpacing', e.target.value)} />
        </Row>
        <Row label="정렬">
          <select className="input-underline" value={template.body.align} onChange={(e) => set('body.align', e.target.value)}>
            <option value="justify">양쪽 맞춤</option>
            <option value="left">왼쪽</option>
          </select>
        </Row>
      </Section>

      <Section title="제목 스타일">
        {['h1', 'h2', 'h3'].map((level) => (
          <div key={level} className="mb-3 last:mb-0">
            <p className="text-xs font-semibold text-muted mb-1.5">
              {{ h1: '대제목 (H1)', h2: '중제목 (H2)', h3: '소제목 (H3)' }[level]}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-[11px] text-placeholder block">크기(pt)</span>
                <input type="number" min="8" max="40" className="input-underline"
                  value={template.headings[level].size}
                  onChange={(e) => num(`headings.${level}.size`, e.target.value)} />
              </label>
              <label className="block">
                <span className="text-[11px] text-placeholder block">굵기</span>
                <select className="input-underline" value={template.headings[level].weight}
                  onChange={(e) => num(`headings.${level}.weight`, e.target.value)}>
                  <option value="400">보통</option>
                  <option value="600">중간</option>
                  <option value="700">굵게</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-placeholder block">번호</span>
                <select className="input-underline" value={template.headings[level].numbering}
                  onChange={(e) => set(`headings.${level}.numbering`, e.target.value)}>
                  <option value="none">없음</option>
                  <option value="roman">I. II. III.</option>
                  <option value="decimal">1. 2. 3.</option>
                  <option value="hangul">가. 나. 다.</option>
                </select>
              </label>
            </div>
          </div>
        ))}
      </Section>

      <Section title="문서 옵션">
        <Check label="토글 블록 펼쳐서 인쇄" checked={template.options.toggleExpand}
          onChange={(v) => set('options.toggleExpand', v)} />
        <Check label="다단 레이아웃 세로로 쌓기" checked={template.options.columnStack}
          onChange={(v) => set('options.columnStack', v)} />
        <Check label="쪽번호 표시" checked={template.options.pageNumber}
          onChange={(v) => set('options.pageNumber', v)} />
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2.5">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-muted block mb-0.5">{label}</span>
      {children}
    </label>
  );
}

function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--accent)]" />
      <span className="text-sm">{label}</span>
    </label>
  );
}
