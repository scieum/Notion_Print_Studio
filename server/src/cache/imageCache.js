import crypto from 'node:crypto';
import { findCachedImage, insertCachedImage, getCachedImageById } from '../db/dao.js';

/**
 * 노션 이미지의 만료 서명 URL 문제를 서버사이드 캐시로 해결 (불변 제약 C4).
 * 서버리스(Vercel)에서는 디스크에 못 쓰므로 바이트를 DB(BLOB)에 저장한다.
 * source_hash는 쿼리스트링(서명)을 제외한 URL로 계산 — 서명이 갈려도 같은 원본이면 재사용.
 */

function sourceHashOf(url) {
  const stable = url.split('?')[0];
  return crypto.createHash('sha256').update(stable).digest('hex');
}

/** 성공 시 앱 내부 URL('/img/:id'), 실패 시 null (호출부가 자리표시자 처리) */
export async function cacheImage(blockId, url) {
  const hash = sourceHashOf(url);
  const existing = await findCachedImage(blockId, hash);
  if (existing) return `/img/${Number(existing.id)}`;

  // fetch 실패 재시도 2회 (설계서 §11 단계 5)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
      const bytes = Buffer.from(await res.arrayBuffer());
      const id = await insertCachedImage({ blockId, sourceHash: hash, bytes, contentType });
      return `/img/${id}`;
    } catch {
      if (attempt === 2) return null;
    }
  }
  return null;
}

/** 캐시된 이미지의 바이트 + content-type. 없으면 null. */
export async function getImageFile(id) {
  const row = await getCachedImageById(id);
  if (!row) return null;
  return {
    bytes: Buffer.from(row.bytes),
    contentType: row.content_type || 'application/octet-stream',
  };
}
