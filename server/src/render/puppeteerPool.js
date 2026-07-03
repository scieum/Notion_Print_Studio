import puppeteer from 'puppeteer';
import { config } from '../config.js';
import { RenderQueue } from './queue.js';
import { pdfPageOptions, buildHeaderFooter } from './cssVars.js';

/**
 * 상주 브라우저 1개 + 렌더 큐 (확정 사양: Express 내장, 동시성 1~2 + 인메모리 큐).
 */
let browserPromise = null;
const queue = new RenderQueue(config.renderConcurrency);

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    });
    const browser = await browserPromise;
    browser.on('disconnected', () => {
      browserPromise = null; // 크래시 시 다음 요청에서 재기동
    });
  }
  return browserPromise;
}

/**
 * HTML → PDF 버퍼. preview=true면 저해상도(스케일 축소)로 빠르게.
 * TODO(설계서 §9): preview는 페이지별 PNG 목록으로 교체 예정 — 초안은 PDF를 iframe으로 표시.
 */
export function renderPdf({ html, template, preview = false, title = '' }) {
  return queue.add(async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      const pageOpts = pdfPageOptions(template);
      const hf = buildHeaderFooter(template, title); // 머리말/꼬리말/쪽번호 (O6)
      // Puppeteer 22+는 Uint8Array를 반환 — 매직바이트 검증/전송을 위해 Buffer로 변환
      return Buffer.from(await page.pdf({
        ...pageOpts,
        printBackground: true,
        preferCSSPageSize: false,
        scale: preview ? 0.9 : 1,
        displayHeaderFooter: hf.displayHeaderFooter,
        headerTemplate: hf.headerTemplate,
        footerTemplate: hf.footerTemplate,
      }));
    } finally {
      await page.close().catch(() => {});
    }
  });
}

export async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    await browser?.close().catch(() => {});
    browserPromise = null;
  }
}
