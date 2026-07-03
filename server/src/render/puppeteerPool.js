import puppeteer from 'puppeteer';
import { config } from '../config.js';
import { RenderQueue } from './queue.js';
import { pdfPageOptions } from './cssVars.js';

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
export function renderPdf({ html, template, preview = false, footerTitle = '' }) {
  return queue.add(async () => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      const pageOpts = pdfPageOptions(template);
      const showPageNumber = !!template.options?.pageNumber;
      return await page.pdf({
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
