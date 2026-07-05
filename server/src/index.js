import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT_DIR } from './config.js';
import { ensureReady } from './db/dao.js';
import { errorHandler } from './routes/middleware.js';
import authRoutes from './routes/auth.js';
import pageRoutes from './routes/pages.js';
import renderRoutes from './routes/render.js';
import templateRoutes from './routes/templates.js';
import historyRoutes from './routes/history.js';
import miscRoutes from './routes/misc.js';
import { closeBrowser } from './render/puppeteerPool.js';

const app = express();
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// 스키마 생성 + 프리셋 시드를 모든 요청 전에 보장 (서버리스: 인스턴스당 1회 memoized).
app.use(async (req, res, next) => {
  try {
    await ensureReady();
    next();
  } catch (err) {
    next(err);
  }
});

app.use(authRoutes);
app.use(pageRoutes);
app.use(renderRoutes);
app.use(templateRoutes);
app.use(historyRoutes);
app.use(miscRoutes);

// 프로덕션(Railway 등 단일 앱): 빌드된 클라이언트 서빙.
// Vercel에서는 정적 파일을 CDN이 직접 서빙하므로 이 블록은 동작하지 않는다.
const clientDist = path.join(ROOT_DIR, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/img')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

// 로컬/컨테이너 실행 시에만 listen. 서버리스(Vercel)에서는 app을 export만 하고 핸들러로 감싼다.
const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
if (!IS_SERVERLESS) {
  const server = app.listen(config.port, () => {
    console.log(`[server] http://localhost:${config.port}`);
    if (!config.notion.clientId) {
      console.warn('[server] NOTION_CLIENT_ID가 비어 있음 — .env를 설정해야 OAuth가 동작한다');
    }
  });

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      await closeBrowser();
      server.close(() => process.exit(0));
    });
  }
}

export default app;
