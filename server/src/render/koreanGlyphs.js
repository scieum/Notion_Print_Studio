import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';
import { FONTS_DIR } from '../config.js';

/**
 * Puppeteer의 headerTemplate/footerTemplate은 본문과 별개 문서라 @font-face 임베드 폰트를
 * 못 쓴다 (한글이 두부로 나옴). 대신 opentype.js로 글자를 벡터 패스로 직접 그려서
 * <svg><path>로 심으면 시스템/임베드 폰트 없이도 한글이 그대로 보인다.
 */

let cachedFont = null;
function loadFont() {
  if (cachedFont) return cachedFont;
  const buf = fs.readFileSync(path.join(FONTS_DIR, 'NotoSansKR-Regular.otf'));
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  cachedFont = opentype.parse(arrayBuffer);
  return cachedFont;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 텍스트 한 줄 → 인라인 SVG (글자 자체를 path로 그려 폰트 종속성 제거) */
export function textToSvg(text, fontSizePx, color = '#444') {
  if (!text) return '';
  const font = loadFont();
  const glyphPath = font.getPath(text, 0, 0, fontSizePx);
  const bbox = glyphPath.getBoundingBox();
  if (!Number.isFinite(bbox.x1)) return '';
  const width = Math.max(bbox.x2, 0.01);
  const height = bbox.y2 - bbox.y1;
  const pathData = glyphPath.toPathData(2);
  return (
    `<svg width="${width.toFixed(2)}" height="${height.toFixed(2)}" ` +
    `viewBox="0 ${bbox.y1.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}" ` +
    `style="display:inline-block; vertical-align:middle" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="${esc(pathData)}" fill="${color}"/></svg>`
  );
}
