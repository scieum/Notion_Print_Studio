import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '../..');
// 서버리스(Vercel)는 /tmp 외 파일시스템이 읽기전용이라 로컬 SQLite 폴백 경로를 /tmp로 둔다.
// 프로덕션에서는 Turso를 쓰므로 이 경로는 실제로 사용되지 않는다.
const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
export const DATA_DIR = IS_SERVERLESS
  ? '/tmp/nps-data'
  : path.resolve(ROOT_DIR, process.env.DATA_DIR || './data');
export const IMAGE_DIR = path.join(DATA_DIR, 'images');
export const FONTS_DIR = path.join(ROOT_DIR, 'fonts');

export const config = {
  port: Number(process.env.PORT || 3001),
  notion: {
    clientId: process.env.NOTION_CLIENT_ID || '',
    clientSecret: process.env.NOTION_CLIENT_SECRET || '',
    redirectUri: process.env.NOTION_REDIRECT_URI || 'http://localhost:3001/auth/notion/callback',
  },
  renderConcurrency: Math.max(1, Math.min(2, Number(process.env.RENDER_CONCURRENCY || 2))), // C7: 상한 2
  blockCacheTtlMs: 10 * 60 * 1000, // 정규화 블록 캐시 TTL 10분
};

// 로컬 SQLite 폴백을 쓸 때만 디렉터리 생성 (Turso 사용 시엔 불필요). 읽기전용 FS에서도 죽지 않게 guard.
if (!process.env.TURSO_DATABASE_URL) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.warn('[config] DATA_DIR mkdir 실패 (무시):', err.message);
  }
}
