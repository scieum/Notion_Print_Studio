import { retrievePage, extractPageTitle } from '../../server/src/notion/client.js';
import { fetchBlockTree } from '../../server/src/notion/blockFetcher.js';
import { normalizeBlocks } from '../../server/src/normalize/normalizer.js';

const MAX_INLINE_IMAGE = 5 * 1024 * 1024; // 5MB — 서버리스 응답/메모리 보호

/**
 * 서버리스용 이미지 처리: 디스크 캐시 대신 data URI로 인라인 (C4의 서버리스 변형).
 * 만료 서명 URL 문제는 렌더 시점에 즉시 fetch하는 것으로 회피한다.
 */
async function inlineImage(blockId, url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type')?.split(';')[0] || 'image/png';
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_INLINE_IMAGE) return null;
      return `data:${type};base64,${buf.toString('base64')}`;
    } catch {
      /* 재시도 */
    }
  }
  return null;
}

/** 블록 트리 fetch + 정규화 (서버리스 — 캐시 없음, 매 호출 fetch) */
export async function getNormalizedPage(token, pageId) {
  const [page, rawBlocks] = await Promise.all([
    retrievePage(token, pageId),
    fetchBlockTree(token, pageId),
  ]);
  const blocks = await normalizeBlocks(rawBlocks, {
    cacheImage: inlineImage,
    logError: (msg) => console.warn('[normalize]', msg),
  });
  return { title: extractPageTitle(page), blocks };
}
