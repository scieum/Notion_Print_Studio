import fs from 'node:fs';
import { createRequire } from 'node:module';
import { templateToCssVars, buildFontFaces } from './cssVars.js';

const require = createRequire(import.meta.url);

let katexCss = '';
try {
  // TODO: KaTeX 웹폰트가 상대 URL이라 setContent 환경에서 로드되지 않음 — 폰트 서빙 또는 인라인화 필요
  katexCss = fs.readFileSync(require.resolve('katex/dist/katex.min.css'), 'utf-8');
} catch {
  katexCss = '';
}

const NOTION_COLORS = {
  gray: '#787774', brown: '#976D57', orange: '#CC782F', yellow: '#C29343',
  green: '#548164', blue: '#477DA5', purple: '#A48BBE', pink: '#B35488', red: '#C4554D',
};
const NOTION_BG_COLORS = {
  gray_background: '#F1F1EF', brown_background: '#F3EEEE', orange_background: '#F8ECDF',
  yellow_background: '#FAF3DD', green_background: '#EEF3ED', blue_background: '#E9F3F7',
  purple_background: '#F6F3F8', pink_background: '#F9F2F5', red_background: '#FAECEC',
};

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- 제목 자동 번호 (설계서 §7.1 — v1은 표기 스타일 선택 수준) ------------------

const HANGUL = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];

function toRoman(n) {
  const table = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
  let out = '';
  for (const [v, sym] of table) while (n >= v) { out += sym; n -= v; }
  return out;
}

function formatNumber(style, n) {
  switch (style) {
    case 'roman': return `${toRoman(n)}.`;
    case 'decimal': return `${n}.`;
    case 'hangul': return `${HANGUL[(n - 1) % HANGUL.length]}.`;
    default: return '';
  }
}

// --- 인라인 스팬 --------------------------------------------------------------

function renderSpans(spansArr) {
  return (spansArr || [])
    .map((s) => {
      if (s.equationHtml) return `<span class="inline-eq">${s.equationHtml}</span>`;
      let html = esc(s.text).replace(/\n/g, '<br/>');
      if (s.code) html = `<code class="inline-code">${html}</code>`;
      if (s.bold) html = `<strong>${html}</strong>`;
      if (s.italic) html = `<em>${html}</em>`;
      if (s.underline) html = `<u>${html}</u>`;
      if (s.strikethrough) html = `<s>${html}</s>`;
      const styles = [];
      if (s.color && s.color !== 'default') {
        if (s.color.endsWith('_background')) styles.push(`background:${NOTION_BG_COLORS[s.color] || 'transparent'}`);
        else styles.push(`color:${NOTION_COLORS[s.color] || 'inherit'}`);
      }
      if (styles.length) html = `<span style="${styles.join(';')}">${html}</span>`;
      if (s.href) html = `<a href="${esc(s.href)}">${html}</a>`;
      return html;
    })
    .join('');
}

// --- 블록 렌더 ---------------------------------------------------------------

function renderBlocks(blocks, ctx) {
  const out = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    // 연속된 같은 스타일의 list_item을 하나의 목록으로 묶는다
    if (block.type === 'list_item') {
      const style = block.style;
      const items = [];
      while (i < blocks.length && blocks[i].type === 'list_item' && blocks[i].style === style) {
        items.push(blocks[i]);
        i++;
      }
      out.push(renderList(style, items, ctx));
      continue;
    }
    out.push(renderBlock(block, ctx));
    i++;
  }
  return out.join('\n');
}

function renderList(style, items, ctx) {
  const tag = style === 'numbered' ? 'ol' : 'ul';
  const cls = style === 'todo' ? ' class="todo-list"' : '';
  const lis = items
    .map((item) => {
      const checkbox =
        style === 'todo'
          ? `<span class="todo-box${item.checked ? ' checked' : ''}">${item.checked ? '✓' : ''}</span>`
          : '';
      const children = item.children?.length ? renderBlocks(item.children, ctx) : '';
      return `<li>${checkbox}${renderSpans(item.spans)}${children}</li>`;
    })
    .join('\n');
  return `<${tag}${cls}>${lis}</${tag}>`;
}

function renderBlock(block, ctx) {
  switch (block.type) {
    case 'paragraph': {
      const children = block.children?.length ? `<div class="indent">${renderBlocks(block.children, ctx)}</div>` : '';
      return `<p>${renderSpans(block.spans) || '&nbsp;'}</p>${children}`;
    }

    case 'heading': {
      const level = block.level;
      const cfg = ctx.template.headings[`h${level}`];
      let prefix = '';
      if (cfg.numbering !== 'none') {
        ctx.counters[level] += 1;
        for (let l = level + 1; l <= 3; l++) ctx.counters[l] = 0; // 하위 레벨 리셋
        if (cfg.numbering === 'nested') {
          // 1. / 1.1. / 1.1.1. — 상위 레벨 카운터를 이어 붙임
          const parts = [];
          for (let l = 1; l <= level; l++) if (ctx.counters[l] > 0) parts.push(ctx.counters[l]);
          prefix = `<span class="h-num">${parts.join('.')}.</span> `;
        } else {
          prefix = `<span class="h-num">${formatNumber(cfg.numbering, ctx.counters[level])}</span> `;
        }
      }
      const children = block.children?.length ? renderBlocks(block.children, ctx) : '';
      return `<h${level}>${prefix}${renderSpans(block.spans)}</h${level}>${children}`;
    }

    case 'quote': {
      const children = block.children?.length ? renderBlocks(block.children, ctx) : '';
      return `<blockquote>${renderSpans(block.spans)}${children}</blockquote>`;
    }

    case 'divider':
      return '<hr/>';

    case 'callout': {
      const bg = NOTION_BG_COLORS[block.color] || '#F1F1EF';
      const icon = block.icon ? `<span class="callout-icon">${esc(block.icon)}</span>` : '';
      const children = block.children?.length ? renderBlocks(block.children, ctx) : '';
      return `<div class="callout" style="background:${bg}">${icon}<div class="callout-body">${renderSpans(block.spans)}${children}</div></div>`;
    }

    case 'toggle': {
      const expand = ctx.template.options?.toggleExpand !== false; // 기본값: 펼침
      const title = `<div class="toggle-title">${renderSpans(block.spans)}</div>`;
      if (!expand) return `<div class="toggle">${title}</div>`;
      const children = block.children?.length ? `<div class="toggle-body">${renderBlocks(block.children, ctx)}</div>` : '';
      return `<div class="toggle">${title}${children}</div>`;
    }

    case 'table': {
      const rows = block.rows
        .map((cells, r) => {
          const cellsHtml = cells
            .map((cell, c) => {
              const isHeader = (block.hasColumnHeader && r === 0) || (block.hasRowHeader && c === 0);
              const tag = isHeader ? 'th' : 'td';
              return `<${tag}>${renderSpans(cell)}</${tag}>`;
            })
            .join('');
          return `<tr>${cellsHtml}</tr>`;
        })
        .join('\n');
      return `<table class="nb-table">${rows}</table>`;
    }

    case 'image': {
      const caption = block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : '';
      // data URI(서버리스 인라인)는 그대로, 캐시 경로(/img/:id)는 서버 주소를 붙인다
      const src = block.src.startsWith('data:') ? block.src : ctx.baseUrl + block.src;
      // break-inside: avoid — 페이지 경계에서 잘리지 않게 (CLAUDE.md 블록 처리 원칙)
      return `<figure class="nb-image"><img src="${esc(src)}" alt=""/>${caption}</figure>`;
    }

    case 'equation':
      return block.html
        ? `<div class="block-eq">${block.html}</div>`
        : `<pre class="eq-fallback">${esc(block.source)}</pre>`;

    case 'code': {
      const caption = block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : '';
      return `<figure class="nb-code"><div class="code-lang">${esc(block.language)}</div><pre><code>${esc(block.text)}</code></pre>${caption}</figure>`;
    }

    case 'bookmark':
      return `<div class="bookmark"><div class="bookmark-url">${esc(block.url || '')}</div>${
        block.caption ? `<div class="bookmark-caption">${esc(block.caption)}</div>` : ''
      }</div>`;

    case 'child_page':
      return `<div class="child-page-card">${esc(block.title)} <span class="muted">(하위 페이지 — 링크만 표기)</span></div>`;

    case 'columns': {
      // columnStack 설정에 따라 세로 스택(기본) 또는 가로 유지 (설계서 §6)
      const stack = ctx.template.options?.columnStack !== false;
      const cols = block.columns.map((col) => `<div class="col">${renderBlocks(col, ctx)}</div>`).join('');
      return `<div class="columns ${stack ? 'stacked' : 'side-by-side'}">${cols}</div>`;
    }

    case 'group':
      return renderBlocks(block.children || [], ctx);

    case 'placeholder':
      return `<div class="placeholder">[${esc(block.label)}]${block.detail ? ` ${esc(block.detail)}` : ''}</div>`;

    default:
      return `<div class="placeholder">[${esc(block.type)}]</div>`;
  }
}

// --- 문서 조립 (설계서 §4 ③ — 양식을 CSS 변수로 주입) ---------------------------

export function buildHtml({ title, blocks, template, baseUrl }) {
  const ctx = { template, counters: { 1: 0, 2: 0, 3: 0 }, baseUrl };
  const body = renderBlocks(blocks, ctx);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<style>
${buildFontFaces()}
${katexCss}
:root {
  ${templateToCssVars(template)}
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: var(--paper-bg); }
body {
  font-family: var(--font-body);
  font-size: var(--body-size);
  line-height: var(--line-height);
  letter-spacing: var(--letter-spacing);
  text-align: var(--text-align);
  color: #191919;
  word-break: keep-all;
  overflow-wrap: break-word;
}
p { margin: 0.35em 0; }
.indent { margin-left: 1.5em; }
h1 { font-family: var(--h1-font); font-size: var(--h1-size); font-weight: var(--h1-weight);
     margin: var(--h1-space-before) 0 var(--h1-space-after); line-height: 1.3; break-after: avoid; text-align: left; }
h2 { font-family: var(--h2-font); font-size: var(--h2-size); font-weight: var(--h2-weight);
     margin: var(--h2-space-before) 0 var(--h2-space-after); line-height: 1.3; break-after: avoid; text-align: left; }
h3 { font-family: var(--h3-font); font-size: var(--h3-size); font-weight: var(--h3-weight);
     margin: var(--h3-space-before) 0 var(--h3-space-after); line-height: 1.3; break-after: avoid; text-align: left; }
ul, ol { margin: 0.35em 0; padding-left: 1.6em; }
li { margin: 0.15em 0; }
.todo-list { list-style: none; padding-left: 0.4em; }
.todo-box { display: inline-block; width: 1em; height: 1em; border: 1px solid #666; border-radius: 2px;
            margin-right: 0.4em; text-align: center; font-size: 0.8em; line-height: 1em; vertical-align: 0.05em; }
.todo-box.checked { background: #333; color: #fff; border-color: #333; }
blockquote { border-left: 3px solid #333; padding-left: 0.9em; margin: 0.6em 0; }
hr { border: none; border-top: 1px solid rgba(0,0,0,0.25); margin: 1em 0; }
.callout { display: flex; gap: 0.6em; padding: 0.8em 1em; border-radius: 4px; margin: 0.6em 0; break-inside: avoid; }
.callout-icon { flex: none; }
.callout-body { flex: 1; min-width: 0; }
.toggle { margin: 0.4em 0; }
.toggle-title { font-weight: 600; }
.toggle-title::before { content: '▸ '; font-size: 0.85em; }
.toggle-body { margin-left: 1.3em; }
.nb-table { border-collapse: collapse; width: 100%; margin: 0.6em 0; break-inside: avoid; }
.nb-table th, .nb-table td { border: 1px solid #555; padding: 0.35em 0.6em; text-align: left; }
.nb-table th { background: #f0f0f0; font-weight: 700; }
.nb-image { margin: 0.8em 0; text-align: center; break-inside: avoid; }
.nb-image img { max-width: 100%; height: auto; }
.nb-image figcaption { font-size: 0.85em; color: #666; margin-top: 0.3em; }
.block-eq { margin: 0.8em 0; text-align: center; break-inside: avoid; }
.eq-fallback { font-family: monospace; background: #f4f4f4; padding: 0.5em; }
.inline-code, .nb-code code { font-family: 'D2Coding', 'Consolas', 'Courier New', monospace; }
.inline-code { background: #f0f0ee; border-radius: 3px; padding: 0.1em 0.3em; font-size: 0.9em; color: #c0392b; }
.nb-code { margin: 0.8em 0; break-inside: avoid; }
.nb-code .code-lang { font-size: 0.75em; color: #777; margin-bottom: 0.2em; }
.nb-code pre { background: #f6f6f4; border: 1px solid rgba(0,0,0,0.12); border-radius: 4px;
               padding: 0.8em 1em; overflow: hidden; white-space: pre-wrap; font-size: 0.9em; line-height: 1.5; }
.bookmark { border: 1px solid rgba(0,0,0,0.2); border-radius: 4px; padding: 0.6em 0.9em; margin: 0.6em 0; break-inside: avoid; }
.bookmark-url { font-size: 0.9em; color: #333; text-decoration: underline; word-break: break-all; }
.bookmark-caption { font-size: 0.85em; color: #666; margin-top: 0.2em; }
.child-page-card { border: 1px solid rgba(0,0,0,0.2); border-radius: 4px; padding: 0.5em 0.9em; margin: 0.5em 0; font-weight: 600; }
.muted { color: #888; font-weight: 400; font-size: 0.85em; }
.placeholder { border: 1px dashed rgba(0,0,0,0.3); border-radius: 4px; padding: 0.5em 0.9em;
               margin: 0.5em 0; color: #888; font-size: 0.9em; }
.columns.stacked .col { margin-bottom: 0.5em; }
.columns.side-by-side { display: flex; gap: 1.2em; }
.columns.side-by-side .col { flex: 1; min-width: 0; }
a { color: inherit; }
.doc-title { font-family: var(--h1-font); font-size: calc(var(--h1-size) * 1.25); font-weight: 700;
             margin-bottom: 0.8em; text-align: left; }
</style>
</head>
<body>
<div class="doc-title">${esc(title)}</div>
${body}
</body>
</html>`;
}
