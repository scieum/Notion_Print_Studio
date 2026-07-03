import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '../..');
export const DATA_DIR = path.resolve(ROOT_DIR, process.env.DATA_DIR || './data');
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

for (const dir of [DATA_DIR, IMAGE_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}
