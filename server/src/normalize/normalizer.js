import { renderKatex } from './katex.js';

/**
 * Notion 블록 → 정규화 블록 (설계서 §4 ②, §6 블록 매트릭스).
 * 원칙: 개별 블록 실패는 자리표시자 + 로그로 처리하고 전체 렌더를 중단하지 않는다.
 *
 * ctx = {
 *   cacheImage(blockId, url): Promise<string|null>  // 캐시 경유 이미지 URL
 *   logError(message): void                          // render_jobs.error 로그
 * }
 */
export async function normalizeBlocks(rawBlocks, ctx) {
  const out = [];
  for (const raw of rawBlocks || []) {
    try {
      const block = await normalizeBlock(raw, ctx);
      if (block) out.push(block);
    } catch (err) {
      ctx.logError(`block ${raw.id} (${raw.type}) 정규화 실패: ${err.message}`);
      out.push({ id: raw.id, type: 'placeholder', label: raw.type, detail: '변환 실패' });
    }
  }
  return out;
}

async function normalizeBlock(raw, ctx) {
  const type = raw.type;
  const data = raw[type] || {};
  const children = raw.children ? await normalizeBlocks(raw.children, ctx) : [];

  switch (type) {
    case 'paragraph':
      return { id: raw.id, type: 'paragraph', spans: spans(data.rich_text), children };

    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
      return {
        id: raw.id,
        type: 'heading',
        level: Number(type.slice(-1)),
        spans: spans(data.rich_text),
        // is_toggleable heading은 v1에서 일반 heading으로 취급, children 이어 붙임
        children,
      };

    case 'bulleted_list_item':
      return { id: raw.id, type: 'list_item', style: 'bulleted', spans: spans(data.rich_text), children };
    case 'numbered_list_item':
      return { id: raw.id, type: 'list_item', style: 'numbered', spans: spans(data.rich_text), children };
    case 'to_do':
      return {
        id: raw.id, type: 'list_item', style: 'todo', checked: !!data.checked,
        spans: spans(data.rich_text), children,
      };

    case 'quote':
      return { id: raw.id, type: 'quote', spans: spans(data.rich_text), children };

    case 'divider':
      return { id: raw.id, type: 'divider' };

    case 'callout':
      return {
        id: raw.id, type: 'callout',
        icon: data.icon?.type === 'emoji' ? data.icon.emoji : null,
        color: data.color || 'default',
        spans: spans(data.rich_text), children,
      };

    case 'toggle':
      return { id: raw.id, type: 'toggle', spans: spans(data.rich_text), children };

    case 'table': {
      const rows = (raw.children || [])
        .filter((c) => c.type === 'table_row')
        .map((c) => (c.table_row?.cells || []).map((cell) => spans(cell)));
      return {
        id: raw.id, type: 'table',
        hasColumnHeader: !!data.has_column_header,
        hasRowHeader: !!data.has_row_header,
        rows,
      };
    }

    case 'image': {
      const url = data.file?.url || data.external?.url;
      const src = url ? await ctx.cacheImage(raw.id, url) : null;
      if (!src) {
        ctx.logError(`image ${raw.id} 캐시 실패`);
        return { id: raw.id, type: 'placeholder', label: 'image', detail: '이미지를 불러오지 못함' };
      }
      return { id: raw.id, type: 'image', src, caption: plain(data.caption) };
    }

    case 'equation': {
      const rendered = renderKatex(data.expression, true);
      if (!rendered.ok) ctx.logError(`equation ${raw.id} KaTeX 실패: ${rendered.error}`);
      return { id: raw.id, type: 'equation', html: rendered.html, source: data.expression };
    }

    case 'code':
      return {
        id: raw.id, type: 'code',
        language: data.language || 'plain text',
        text: plain(data.rich_text),
        caption: plain(data.caption),
      };

    case 'bookmark':
    case 'embed':
    case 'link_preview':
      return { id: raw.id, type: 'bookmark', url: data.url, caption: plain(data.caption) };

    case 'child_page':
      return { id: raw.id, type: 'child_page', title: data.title || '하위 페이지' };
    case 'link_to_page':
      return { id: raw.id, type: 'child_page', title: '페이지 링크' };

    case 'child_database':
      // TODO(슬라이스 3): 기본 뷰 스냅샷 표, 최대 100행 (설계서 §6)
      return { id: raw.id, type: 'placeholder', label: 'child_database', detail: data.title || '인라인 데이터베이스' };

    case 'synced_block':
      // 원본 내용을 그대로 렌더 (설계서 §6). 참조 블록의 children은 fetch 시 이미 포함됨.
      return { id: raw.id, type: 'group', children };

    case 'column_list':
      return { id: raw.id, type: 'columns', columns: children.filter((c) => c.type === 'column').map((c) => c.children) };
    case 'column':
      return { id: raw.id, type: 'column', children };

    case 'video':
    case 'audio':
    case 'file':
    case 'pdf': {
      const name = data.name || data.file?.url?.split('/').pop()?.split('?')[0] || type;
      return { id: raw.id, type: 'placeholder', label: type, detail: `${name} — 인쇄물에 포함되지 않는 미디어` };
    }

    case 'table_of_contents':
    case 'breadcrumb':
      return null; // 인쇄물에서 무의미 — 조용히 제외

    default:
      ctx.logError(`미지원 블록 ${raw.id} (${type}) → 자리표시자`);
      return { id: raw.id, type: 'placeholder', label: type };
  }
}

/** Notion rich_text → 정규화 스팬 (인라인 서식 전체 지원, 설계서 §6) */
function spans(richText) {
  return (richText || []).map((rt) => {
    const base = {
      text: rt.plain_text || '',
      bold: !!rt.annotations?.bold,
      italic: !!rt.annotations?.italic,
      underline: !!rt.annotations?.underline,
      strikethrough: !!rt.annotations?.strikethrough,
      code: !!rt.annotations?.code,
      color: rt.annotations?.color || 'default',
      href: rt.href || null,
    };
    if (rt.type === 'equation') {
      const rendered = renderKatex(rt.equation?.expression || '', false);
      return { ...base, equationHtml: rendered.ok ? rendered.html : null, text: rt.equation?.expression || '' };
    }
    return base;
  });
}

function plain(richText) {
  return (richText || []).map((rt) => rt.plain_text || '').join('');
}
