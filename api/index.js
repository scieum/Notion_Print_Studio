// Vercel 서버리스 함수 엔트리 — 기존 Express 앱을 그대로 요청 핸들러로 노출한다.
// vercel.json의 rewrites가 /api/*, /auth/*, /img/* (및 미매칭 경로)를 이 함수로 보낸다.
import app from '../server/src/index.js';

export default app;
