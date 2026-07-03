import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { IMAGE_DIR } from '../config.js';
import { findCachedImage, insertCachedImage, getCachedImageById } from '../db/dao.js';

/**
 * 노션 이미지의 만료 서명 URL 문제를 서버사이드 디스크 캐시로 해결 (불변 제약 C4).
 * source_hash는 쿼리스트링(서명)을 제외한 URL로 계산 — 서명이 갈려도 같은 원본이면 재사용.
 */

function sourceHashOf(url) {
  const stable = url.split('?')[0];
  return crypto.createHash('sha256').update(stable).digest('hex');
}

const EXT_BY_TYPE = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

/** 성공 시 앱 내부 URL('/img/:id'), 실패 시 null (호출부가 자리표시자 처리) */
export async function cacheImage(blockId, url) {
  const hash = sourceHashOf(url);
  const existing = findCachedImage(blockId, hash);
  if (existing && fs.existsSync(existing.file_path)) return `/img/${existing.id}`;

  // fetch 실패 재시도 2회 (설계서 §11 단계 5)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
      const ext = EXT_BY_TYPE[contentType] || '.bin';
      const filePath = path.join(IMAGE_DIR, `${hash.slice(0, 16)}-${crypto.randomUUID().slice(0, 8)}${ext}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(filePath, buf);
      const id = insertCachedImage({ blockId, sourceHash: hash, filePath, contentType });
      return `/img/${id}`;
    } catch {
      if (attempt === 2) return null;
    }
  }
  return null;
}

export function getImageFile(id) {
  const row = getCachedImageById(id);
  if (!row || !fs.existsSync(row.file_path)) return null;
  return row;
}
