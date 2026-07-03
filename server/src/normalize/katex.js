import katex from 'katex';

/** KaTeX 서버사이드 렌더 (확정 사양). 실패한 수식은 원문 코드로 폴백 (스킵+로그 원칙). */
export function renderKatex(expression, displayMode = false) {
  try {
    return {
      ok: true,
      html: katex.renderToString(expression, {
        displayMode,
        throwOnError: true,
        output: 'html',
      }),
    };
  } catch (err) {
    return { ok: false, html: null, error: err.message };
  }
}
