import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { pdfPageOptions } from './cssVars.js';
import { getImageFile } from '../cache/imageCache.js';

/**
 * 서버리스(Vercel) PDF 렌더: puppeteer-core + @sparticuz/chromium.
 * 상주 브라우저(설계서 원안)는 서버리스에서 유지 불가 — 요청마다 실행 후 종료한다.
 * 동시성 상한(C7)은 Vercel 함수 동시성이 대신 담당한다.
 *
 * htmlBuilder가 만든 이미지 URL('http://nps.local/img/:id')은 요청 가로채기로
 * DB(BLOB)에서 바이트를 직접 응답한다 — 디스크·외부 HTTP 왕복 없음.
 */

// buildHtml에 넘길 baseUrl. setContent는 base URL이 없어 상대경로가 안 먹으므로 절대 origin이 필요하다.
export const RENDER_BASE_URL = 'http://nps.local';

async function launchBrowser() {
  // 로컬 개발: 시스템 Chrome 경로를 PUPPETEER_EXECUTABLE_PATH로 지정 가능.
  const localExec = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (localExec) {
    return puppeteer.launch({
      headless: true,
      executablePath: localExec,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    });
  }
  // 서버리스: @sparticuz/chromium 번들 바이너리 (headless shell — chromium.headless 권장값 사용).
  return puppeteer.launch({
    args: [...chromium.args, '--font-render-hinting=none'],
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

/** '/img/:id' 요청을 DB 캐시 바이트로 응답하도록 페이지에 가로채기 설정 */
async function interceptCachedImages(page) {
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    try {
      const m = new URL(req.url()).pathname.match(/^\/img\/(\d+)$/);
      if (m) {
        const img = await getImageFile(Number(m[1]));
        if (img) return req.respond({ status: 200, contentType: img.contentType, body: img.bytes });
        return req.respond({ status: 404, body: '' });
      }
      req.continue();
    } catch {
      req.continue().catch(() => {});
    }
  });
}

/**
 * HTML → PDF 버퍼. preview=true면 저해상도(스케일 축소)로 빠르게.
 */
export async function renderPdf({ html, template, preview = false }) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await interceptCachedImages(page);
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const pageOpts = pdfPageOptions(template);
    const showPageNumber = !!template.options?.pageNumber;
    // puppeteer 22+는 Uint8Array를 반환 — 매직바이트 검사·res.send가 기대하는 Buffer로 변환
    const pdf = await page.pdf({
      ...pageOpts,
      printBackground: true,
      preferCSSPageSize: false,
      scale: preview ? 0.9 : 1,
      displayHeaderFooter: showPageNumber,
      headerTemplate: '<span></span>',
      footerTemplate: showPageNumber
        ? `<div style="width:100%; text-align:center; font-size:8pt; color:#444;">
             <span class="pageNumber"></span> / <span class="totalPages"></span>
           </div>`
        : '<span></span>',
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}

// 서버리스에는 상주 브라우저가 없지만, 로컬 index.js의 종료 훅 호환용 no-op.
export async function closeBrowser() {}
