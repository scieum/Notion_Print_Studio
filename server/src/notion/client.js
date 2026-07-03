const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

export class NotionError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'NotionError';
    this.status = status;
    this.notion = true;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Notion API 호출. 429/5xx는 지수 백오프로 최대 3회 재시도 (설계서 §11).
 * 401은 재시도 없이 즉시 던진다 → 라우트 에러 핸들러가 재연결 유도 응답으로 변환.
 */
export async function notionRequest(token, path, { method = 'GET', body } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= 3; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
    const res = await fetch(`${NOTION_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return res.json();

    const text = await res.text().catch(() => '');
    lastError = new NotionError(res.status, `Notion ${res.status}: ${text.slice(0, 300)}`);
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after'));
      if (retryAfter > 0) await sleep(retryAfter * 1000);
      continue;
    }
    throw lastError; // 4xx (401 포함)는 재시도 무의미
  }
  throw lastError;
}

export function searchPages(token, query) {
  return notionRequest(token, '/search', {
    method: 'POST',
    body: {
      query: query || undefined,
      filter: { property: 'object', value: 'page' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 20,
    },
  });
}

export function retrievePage(token, pageId) {
  return notionRequest(token, `/pages/${pageId}`);
}

/** 페이지 객체에서 제목 추출 (title 타입 프로퍼티 탐색) */
export function extractPageTitle(page) {
  const props = page?.properties || {};
  for (const key of Object.keys(props)) {
    if (props[key].type === 'title') {
      return props[key].title.map((t) => t.plain_text).join('') || '제목 없음';
    }
  }
  return '제목 없음';
}
