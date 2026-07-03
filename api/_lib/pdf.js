import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { pdfPageOptions, buildHeaderFooter } from '../../server/src/render/cssVars.js';
import { buildHtml } from '../../server/src/render/htmlBuilder.js';
import { validateTemplate, DEFAULT_TEMPLATE } from '../../shared/index.js';
import { getNormalizedPage } from './getPage.js';

/**
 * 서버리스 PDF 렌더 (@sparticuz/chromium).
 * 함수 인스턴스가 살아 있는 동안 브라우저를 재사용한다 — 상주 브라우저(C7)의 서버리스 변형.
 * 동시성 상한은 함수 인스턴스당 1건씩 처리되는 플랫폼 특성으로 자연 충족.
 */
let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const browser = await browserPromise;
    browser.on('disconnected', () => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

export function resolveTemplate(input, res) {
  const result = validateTemplate(input ?? DEFAULT_TEMPLATE);
  if (result.ok) return result.template;
  res.setHeader('X-Template-Fallback', '1');
  return validateTemplate(DEFAULT_TEMPLATE).template;
}

/** 페이지 fetch → HTML 조립 → PDF Buffer */
export async function renderPagePdf({ token, pageId, template, preview }) {
  const { title, blocks } = await getNormalizedPage(token, pageId);
  const html = buildHtml({ title, blocks, template, baseUrl: '' }); // 이미지는 data URI라 baseUrl 불필요

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const hf = buildHeaderFooter(template, title);
    const pdf = Buffer.from(
      await page.pdf({
        ...pdfPageOptions(template),
        printBackground: true,
        preferCSSPageSize: false,
        scale: preview ? 0.9 : 1,
        displayHeaderFooter: hf.displayHeaderFooter,
        headerTemplate: hf.headerTemplate,
        footerTemplate: hf.footerTemplate,
      })
    );
    if (pdf.length < 5 || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new Error('invalid PDF output');
    }
    return { pdf, title };
  } finally {
    await page.close().catch(() => {});
  }
}
