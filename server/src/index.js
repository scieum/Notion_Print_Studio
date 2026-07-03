import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT_DIR } from './config.js';
import { seedPresets } from './db/dao.js';
import { errorHandler } from './routes/middleware.js';
import authRoutes from './routes/auth.js';
import pageRoutes from './routes/pages.js';
import renderRoutes from './routes/render.js';
import templateRoutes from './routes/templates.js';
import miscRoutes from './routes/misc.js';
import { closeBrowser } from './render/puppeteerPool.js';

seedPresets();

const app = express();
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

app.use(authRoutes);
app.use(pageRoutes);
app.use(renderRoutes);
app.use(templateRoutes);
app.use(miscRoutes);

// 프로덕션: 빌드된 클라이언트 서빙 (Railway 단일 앱 배포)
const clientDist = path.join(ROOT_DIR, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path.startsWith('/img')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

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
