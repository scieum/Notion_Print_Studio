import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '../..');

// npm workspace 실행 시 cwd가 server/라서 루트 .env를 명시적으로 지정
dotenv.config({ path: path.join(ROOT_DIR, '.env') });
export const DATA_DIR = path.resolve(ROOT_DIR, process.env.DATA_DIR || './data');
export const IMAGE_DIR = path.join(DATA_DIR, 'images');
export const FONTS_DIR = path.join(ROOT_DIR, 'fonts');

export const config = {
  port: Number(process.env.PORT || 3001),
  // OAuth 완료 후 돌아갈 클라이언트 주소 (개발: Vite dev 서버 / 프로덕션: 같은 오리진)
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5174',
  notion: {
    clientId: process.env.NOTION_CLIENT_ID || '',
    clientSecret: process.env.NOTION_CLIENT_SECRET || '',
    redirectUri: process.env.NOTION_REDIRECT_URI || 'http://localhost:3001/auth/notion/callback',
    // 개발용 내부 인티그레이션 토큰 — 설정 시 OAuth 없이 자동 연결 (백엔드에만 존재, C2)
    internalToken: process.env.NOTION_INTERNAL_TOKEN || '',
  },
  renderConcurrency: Math.max(1, Math.min(2, Number(process.env.RENDER_CONCURRENCY || 2))), // C7: 상한 2
  blockCacheTtlMs: 10 * 60 * 1000, // 정규화 블록 캐시 TTL 10분
};

for (const dir of [DATA_DIR, IMAGE_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
