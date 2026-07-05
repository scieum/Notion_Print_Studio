import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { FONTS_DIR } from '../config.js';

// require로 읽어야 Vercel 번들러(nft)가 JSON을 함수 번들에 포함시킨다
const require = createRequire(import.meta.url);
const fontsConfig = require('../../../fonts/fonts.config.json');

export function enabledFonts() {
  return fontsConfig.fonts.filter((f) => f.enabled);
}

// 이모지 fallback — 스택 맨 끝에 붙여 폰트에 없는 이모지가 두부(□)로 안 나오게 한다.
const EMOJI_FALLBACK = "'Noto Emoji'";

export function fontStack(fontId) {
  const font = fontsConfig.fonts.find((f) => f.id === fontId && f.enabled);
  // 서버리스 Chromium엔 시스템 한글 폰트가 없다 — 항상 임베드되는 Noto Sans KR을 우선.
  const stack = font ? font.fallback : "'Noto Sans KR', 'Malgun Gothic', sans-serif";
  return `${stack}, ${EMOJI_FALLBACK}`;
}

const familyOf = (f) => f.fallback.match(/'([^']+)'/)?.[1] || f.name;

/**
 * 실제 woff2 파일이 존재하는 폰트만 @font-face 생성 (없으면 fallback 스택으로 렌더).
 * template을 주면 사용 중인 폰트 + 그 fallback 스택에 등장하는 폰트만 임베드해
 * base64 인라인으로 커지는 HTML을 최소화한다 (기본 fallback인 Noto Sans KR은 항상 포함).
 */
export function buildFontFaces(template) {
  const fonts = enabledFonts();
  let selected = fonts;

  if (template) {
    const usedIds = new Set(['noto-sans-kr', template.body?.font]);
    for (const level of ['h1', 'h2', 'h3']) usedIds.add(template.headings?.[level]?.font);
    const picked = new Set();
    for (const f of fonts) {
      if (!usedIds.has(f.id)) continue;
      picked.add(f);
      // 파일이 없는 폰트(KoPub 등)는 fallback 스택의 임베드 가능한 폰트로 렌더된다
      for (const g of fonts) if (f.fallback.includes(`'${familyOf(g)}'`)) picked.add(g);
    }
    selected = [...picked];
  }

  const faces = [];
  // 이모지 폰트는 어떤 양식이든 항상 임베드 (아이콘·콜아웃 이모지 두부 방지)
  const emojiAbs = path.join(FONTS_DIR, 'NotoEmoji-Regular.woff2');
  if (fs.existsSync(emojiAbs)) {
    const data = fs.readFileSync(emojiAbs).toString('base64');
    faces.push(
      `@font-face { font-family: 'Noto Emoji'; font-weight: 400;` +
        ` src: url(data:font/woff2;base64,${data}) format('woff2'); font-display: block; }`
    );
  }
  for (const font of selected) {
    for (const [weight, file] of Object.entries(font.files || {})) {
      const abs = path.join(FONTS_DIR, file);
      if (!fs.existsSync(abs)) continue;
      const data = fs.readFileSync(abs).toString('base64');
      faces.push(
        `@font-face { font-family: '${familyOf(font)}'; font-weight: ${weight};` +
          ` src: url(data:font/woff2;base64,${data}) format('woff2'); font-display: block; }`
      );
    }
  }
  return faces.join('\n');
}

/**
 * 양식 → CSS 변수 (설계서 §4 — 스타일은 전부 CSS 변수로 주입,
 * HTML 재조립 없이 변수만 교체 가능해야 한다).
 */
export function templateToCssVars(t) {
  const vars = {
    '--paper-bg': t.page.background,
    '--font-body': fontStack(t.body.font),
    '--body-size': `${t.body.size}pt`,
    '--line-height': String(t.body.lineHeight),
    '--letter-spacing': `${t.body.letterSpacing}em`,
    '--text-align': t.body.align,
  };
  for (const level of ['h1', 'h2', 'h3']) {
    const h = t.headings[level];
    vars[`--${level}-font`] = h.font ? fontStack(h.font) : 'var(--font-body)';
    vars[`--${level}-size`] = `${h.size}pt`;
    vars[`--${level}-weight`] = String(h.weight);
    vars[`--${level}-space-before`] = `${h.spaceBefore}pt`;
    vars[`--${level}-space-after`] = `${h.spaceAfter}pt`;
  }
  return Object.entries(vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join('\n  ');
}

/**
 * 머리말/꼬리말 → Puppeteer headerTemplate/footerTemplate (오픈 이슈 O6 구현).
 * 자리표시자: {page} {total} {title} {date}
 * options.pageNumber=true인데 아무 필드에도 {page}가 없으면
 * hf.pageNumberFormat에 따라 꼬리말 가운데에 쪽번호를 자동 삽입한다.
 */
export function buildHeaderFooter(template, title = '') {
  const hf = template.hf || {};
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const sub = (text) =>
    esc(text)
      .replaceAll('{page}', '<span class="pageNumber"></span>')
      .replaceAll('{total}', '<span class="totalPages"></span>')
      .replaceAll('{title}', esc(title))
      .replaceAll('{date}', '<span class="date"></span>');

  const fields = {
    headerLeft: hf.headerLeft || '', headerCenter: hf.headerCenter || '', headerRight: hf.headerRight || '',
    footerLeft: hf.footerLeft || '', footerCenter: hf.footerCenter || '', footerRight: hf.footerRight || '',
  };

  const hasPageToken = Object.values(fields).some((v) => v.includes('{page}'));
  if (template.options?.pageNumber && !hasPageToken && !fields.footerCenter) {
    fields.footerCenter = {
      decimal: '{page}',
      dash: '- {page} -',
      fraction: '{page} / {total}',
    }[hf.pageNumberFormat || 'dash'];
  }

  const fontSize = hf.fontSize || 9;
  // Chromium 머리말/꼬리말은 스타일 상속이 없어 전부 인라인으로 지정해야 한다
  const bar = (left, center, right) =>
    `<div style="width:100%; font-size:${fontSize}pt; color:#444; padding:0 10mm;
        display:flex; align-items:center; font-family:'Malgun Gothic',sans-serif;">
       <span style="flex:1; text-align:left;">${sub(left)}</span>
       <span style="flex:1; text-align:center;">${sub(center)}</span>
       <span style="flex:1; text-align:right;">${sub(right)}</span>
     </div>`;

  const hasHeader = fields.headerLeft || fields.headerCenter || fields.headerRight;
  const hasFooter = fields.footerLeft || fields.footerCenter || fields.footerRight;

  return {
    displayHeaderFooter: !!(hasHeader || hasFooter),
    headerTemplate: hasHeader ? bar(fields.headerLeft, fields.headerCenter, fields.headerRight) : '<span></span>',
    footerTemplate: hasFooter ? bar(fields.footerLeft, fields.footerCenter, fields.footerRight) : '<span></span>',
  };
}

/** 용지 크기 → Puppeteer page.pdf() 옵션 (여백은 mm로 전달) */
export function pdfPageOptions(t) {
  const sizes = {
    A4: { width: '210mm', height: '297mm' },
    B5: { width: '176mm', height: '250mm' },
    Letter: { width: '8.5in', height: '11in' },
  };
  let { width, height } = sizes[t.page.size] || sizes.A4;
  if (t.page.orientation === 'landscape') [width, height] = [height, width];
  const m = t.page.margin;
  return {
    width,
    height,
    margin: { top: `${m.top}mm`, bottom: `${m.bottom}mm`, left: `${m.left}mm`, right: `${m.right}mm` },
  };
}
