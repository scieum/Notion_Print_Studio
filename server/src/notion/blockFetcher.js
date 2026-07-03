import { notionRequest } from './client.js';

/**
 * 블록 트리 재귀 fetch (설계서 §4 ①).
 * - 커서 소진까지 페이지네이션 (page_size 100)
 * - has_children이면 재귀 (child_page / child_database는 내려가지 않음 — v1은 링크/스냅샷 처리)
 */
export async function fetchBlockTree(token, blockId) {
  const blocks = [];
  let cursor;
  do {
    const params = new URLSearchParams({ page_size: '100' });
    if (cursor) params.set('start_cursor', cursor);
    const res = await notionRequest(token, `/blocks/${blockId}/children?${params}`);
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  for (const block of blocks) {
    if (block.has_children && block.type !== 'child_page' && block.type !== 'child_database') {
      block.children = await fetchBlockTree(token, block.id);
    }
  }
  return blocks;
}
