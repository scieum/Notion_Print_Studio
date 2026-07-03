import fs from 'node:fs';
import path from 'node:path';
import { FONTS_DIR } from '../config.js';

const fontsConfig = JSON.parse(
  fs.readFileSync(path.join(FONTS_DIR, 'fonts.config.json'), 'utf-8')
);

export function enabledFonts() {
  return fontsConfig.fonts.filter((f) => f.enabled);
}

export function fontStack(fontId) {
  const font = fontsConfig.fonts.find((f) => f.id === fontId && f.enabled);
  return font ? font.fallback : "'Malgun Gothic', 'Noto Sans KR', sans-serif";
}

/** 실제 woff2 파일이 존재하는 폰트만 @font-face 생성 (없으면 fallback 스택으로 렌더) */
export function buildFontFaces() {
  const faces = [];
  for (const font of enabledFonts()) {
    for (const [weight, file] of Object.entries(font.files || {})) {
      const abs = path.join(FONTS_DIR, file);
      if (!fs.existsSync(abs)) continue;
      const data = fs.readFileSync(abs).toString('base64');
      const family = font.fallback.match(/'([^']+)'/)?.[1] || font.name;
      faces.push(
        `@font-face { font-family: '${family}'; font-weight: ${weight};` +
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
