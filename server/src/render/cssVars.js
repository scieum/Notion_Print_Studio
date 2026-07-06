import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { FONTS_DIR } from '../config.js';
import { textToSvg } from './koreanGlyphs.js';

// require로 읽어야 Vercel 번들러(nft)가 JSON을 함수 번들에 포함시킨다
const require = createRequire(import.meta.url);
const fontsConfig = require('../../../fonts/fonts.config.json');

export function enabledFonts() {
  return fontsConfig.fonts.filter((f) => f.enabled);
}

/**
 * 실제 woff2 파일이 존재하는 폰트만 (FontPicker 노출용). 파일 없는 폰트를 목록에 두면
 * 골라도 fallback으로만 렌더돼 "적용 안 됨"처럼 보이므로 여기서 걸러낸다.
 */
export function availableFonts() {
  return enabledFonts().filter((f) => {
    const files = Object.values(f.files || {});
    return files.length > 0 && files.every((fn) => fs.existsSync(path.join(FONTS_DIR, fn)));
  });
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

const hasPageToken = (v) => v.includes('{page}') || v.includes('{total}');

/**
 * 커스텀 텍스트(제목/날짜 토큰 치환 후) → 세그먼트 배열. {page}/{total}은 Chromium이 렌더 시점에
 * 실제 페이지 수를 채워 넣는 라이브 토큰이라 정적 SVG로 구울 수 없어, 텍스트를 그 토큰 기준으로
 * 잘라 한글 부분만 opentype.js SVG로, 숫자 토큰은 Chromium 네이티브 span으로 남긴다.
 */
function renderField(text, fontSizePx, color) {
  if (!text) return '';
  return text
    .split(/(\{page\}|\{total\})/g)
    .filter((s) => s !== '')
    .map((part) => {
      if (part === '{page}') {
        return `<span class="pageNumber" style="font-size:${fontSizePx}px; font-family:Arial,sans-serif; color:${color}; vertical-align:middle;"></span>`;
      }
      if (part === '{total}') {
        return `<span class="totalPages" style="font-size:${fontSizePx}px; font-family:Arial,sans-serif; color:${color}; vertical-align:middle;"></span>`;
      }
      return textToSvg(part, fontSizePx, color);
    })
    .join('');
}

/**
 * 머리말/꼬리말 → Puppeteer headerTemplate/footerTemplate.
 * Chromium 머리말/꼬리말 템플릿은 본문과 별개 문서라 임베드 폰트(@font-face)를 못 써
 * 한글이 두부로 나온다 — 그래서 텍스트를 opentype.js로 벡터 패스(SVG)로 직접 그려 심는다.
 * (본문 안에 position:fixed 러닝 배너를 넣는 이전 방식은 Chromium 인쇄 시 페이지마다
 * 정확히 반복되지 않고 위치가 어긋나 폐기했다.)
 */
export function buildHeaderFooter(template, title = '', dateStr = '') {
  const hf = template.hf || {};
  const sub = (text) => (text || '').replaceAll('{title}', title).replaceAll('{date}', dateStr);
  const fields = {
    headerLeft: sub(hf.headerLeft), headerCenter: sub(hf.headerCenter), headerRight: sub(hf.headerRight),
    footerLeft: sub(hf.footerLeft), footerCenter: sub(hf.footerCenter), footerRight: sub(hf.footerRight),
  };

  const userHasPageToken = Object.values(fields).some(hasPageToken);
  if (template.options?.pageNumber && !userHasPageToken) {
    const pn = '{page}';
    const tot = '{total}';
    fields.footerCenter = { decimal: pn, dash: `- ${pn} -`, fraction: `${pn} / ${tot}` }[hf.pageNumberFormat || 'dash'];
  }

  const hasHeader = fields.headerLeft || fields.headerCenter || fields.headerRight;
  const hasFooter = fields.footerLeft || fields.footerCenter || fields.footerRight;
  if (!hasHeader && !hasFooter) {
    return { displayHeaderFooter: false, headerTemplate: '<span></span>', footerTemplate: '<span></span>' };
  }

  const fontSize = hf.fontSize || 9;
  const fontSizePx = fontSize * (96 / 72);
  const m = template.page?.margin || { left: 20, right: 20 };
  const pxPerMm = 96 / 25.4;
  const padLeft = (m.left || 0) * pxPerMm;
  const padRight = (m.right || 0) * pxPerMm;

  const bar = (l, c, r) => `<div style="width:100%; box-sizing:border-box; padding:0 ${padRight}px 0 ${padLeft}px;
    display:flex; align-items:center; font-size:0;">
    <span style="flex:1; text-align:left; white-space:nowrap;">${renderField(l, fontSizePx, '#444')}</span>
    <span style="flex:1; text-align:center; white-space:nowrap;">${renderField(c, fontSizePx, '#444')}</span>
    <span style="flex:1; text-align:right; white-space:nowrap;">${renderField(r, fontSizePx, '#444')}</span>
  </div>`;

  return {
    displayHeaderFooter: true,
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
