# Notion Print Studio — 통합 설계서

> Claude Code 구현 시 참조하는 계획서. 상세 코드/파일 내용은 구현 단계에서 작성한다.
> 이 프로젝트는 **런타임 LLM이 없는 결정론적 웹앱**이므로 에이전트/스킬 구조 대신 웹앱 설계 구조를 따른다.

---

## 1. 작업 컨텍스트

### 1.1 배경과 목적

노션은 문서 도구로서 훌륭하지만 **인쇄 품질이 열악**하다(여백·자간·행간 제어 불가, 폰트 선택 불가, 페이지 분할 제어 불가). 이 시스템은 노션 페이지를 연결하면 **한글(HWP) 워드프로세서 수준의 인쇄 제어**를 제공하는 독립 웹앱이다.

- 여백(상하좌우), 자간, 행간, 용지 배경색 조정
- 다양한 한글 폰트 선택
- 대제목·중제목·소제목·본문에 스타일을 매핑하는 **양식(템플릿) 시스템**
- 최종 산출물: 고품질 PDF (다운로드 및 브라우저 인쇄)

### 1.2 입력 / 출력

| 구분 | 내용 |
|---|---|
| 입력 | Notion OAuth로 연결한 워크스페이스의 페이지 (페이지 선택 UI 제공) |
| 입력(설정) | 양식 선택 또는 커스텀 스타일 (여백/자간/행간/폰트/배경색/제목 스타일) |
| 출력 | A4(기본)/B5/Letter PDF 파일, 저해상도 미리보기 이미지 |

### 1.3 범위

- **포함**: Notion OAuth, 최대 블록 범위 렌더링(§6), 서버사이드 PDF 생성, 디바운스 미리보기, 양식 프리셋 + 사용자 커스텀 양식 서버 저장, 문서별 인쇄 설정 저장
- **제외 (v1)**: 협업/공유 기능, 페이지 편집(읽기 전용 렌더), 하위 페이지 재귀 병합 인쇄(→ 오픈 이슈), 워터마크/머리말·꼬리말 커스텀(→ v2 후보)

### 1.4 용어

| 용어 | 정의 |
|---|---|
| 양식(Template) | 제목 레벨별 스타일 + 문서 전역 설정(여백·자간·행간·폰트·배경색)의 저장 가능한 세트 |
| 프리셋 | 시스템 내장 양식 (공문서형, 보고서형, 학습지형 등) |
| 렌더 잡 | 페이지 1개 + 설정 1세트 → PDF/미리보기 1회 생성 단위 |
| 정규화 블록 | Notion API 블록을 렌더러 입력용으로 변환한 내부 표현 |

---

## 2. 불변 제약

| # | 제약 | 근거 |
|---|---|---|
| C1 | 배포 앱에 런타임 LLM 없음 — 모든 처리는 결정론적 | 프로젝트 공통 원칙 |
| C2 | Notion 토큰·API 키는 백엔드에만 존재, 클라이언트 노출 금지 | 보안 원칙 |
| C3 | Notion 쓰기 없음 — 이 앱은 **읽기 전용** (append-only 원칙보다 강함) | 인쇄 도구 특성 |
| C4 | 노션 이미지의 만료 서명 URL은 서버사이드 SQLite 디스크 캐시로 해결 | 기존 확립 패턴 |
| C5 | 페이지 ID 등 민감 식별자는 URL 쿼리 노출 금지, POST body로 전달 | 개인정보 원칙 |
| C6 | 라이선스 미확정 폰트는 배포 빌드에서 제외 (플래그로 관리) | 법적 리스크 |
| C7 | Puppeteer 렌더 동시성 상한 준수 (기본 2), 초과분은 인메모리 큐 대기 | 서버 안정성 |

---

## 3. 확정 사양 (의사결정 기록)

| 항목 | 결정 |
|---|---|
| 페이지 연결 | Notion OAuth (비공개 페이지 접근, 페이지 선택 UI) |
| 페이지네이션/출력 | 서버사이드 PDF (Puppeteer) 중심 |
| 미리보기 | 설정 변경 후 1~2초 디바운스 → 서버 저해상도 미리보기 자동 재렌더 |
| 블록 범위 | 최대 (텍스트+미디어+콜아웃·토글·수식·북마크·인라인 DB) |
| 토글 인쇄 | 문서 단위 설정 (기본값: 펼침) |
| 인라인 DB | 기본 뷰를 표로 스냅샷, 최대 100행 |
| 양식 저장 | 내장 프리셋 + 사용자 커스텀(서버 저장, 계정 귀속) |
| 배포 형태 | 독립 웹앱 (Railway) |
| DB | SQLite (Railway 볼륨) |
| Puppeteer 배치 | Express 내장, 브라우저 1개 상주, 동시성 1~2 + 인메모리 큐 |
| 수식 | KaTeX 서버사이드 렌더 |

---

## 4. 시스템 아키텍처

```
[React + Vite + Tailwind SPA]
   │  (OAuth 리다이렉트 / REST API, 페이지ID는 POST body)
   ▼
[Node.js + Express]
   ├── Notion API 클라이언트 (블록 트리 fetch, 페이지네이션 커서 처리)
   ├── 블록 정규화기 (Notion 블록 → 정규화 블록 JSON)
   ├── HTML 렌더러 (정규화 블록 + 양식 → 인쇄용 HTML/CSS)
   ├── Puppeteer 렌더 서비스 (상주 브라우저, 큐, PDF/미리보기 이미지)
   ├── 이미지 캐시 서비스 (SQLite 메타 + 디스크 파일)
   └── SQLite (users / tokens / templates / settings / image_cache)
```

**렌더 파이프라인 (핵심 데이터 흐름)**

```
페이지 선택 → ① 블록 트리 fetch (재귀, has_children 처리)
           → ② 정규화 (이미지 URL → 캐시 URL 치환, 수식 → KaTeX HTML)
           → ③ HTML 조립 (양식의 CSS 변수 주입: 여백/자간/행간/폰트/배경색)
           → ④ Puppeteer 렌더
                ├─ 미리보기 요청: 전체 페이지 스크린샷(저해상도, 페이지별 PNG)
                └─ 최종 요청: page.pdf() → PDF 파일
```

- ①~② 결과는 페이지별로 캐시(정규화 블록 JSON, TTL 10분). 설정만 바꾸는 미리보기 재렌더 시 Notion API 재호출 없이 ③부터 재실행 → 렌더당 2~4초 목표.
- 스타일은 전부 **CSS 변수**로 주입 (`--margin-top`, `--letter-spacing`, `--line-height`, `--font-body`, `--paper-bg`, `--h1-size` 등) → HTML 재조립 없이 변수만 교체 가능.

---

## 5. Notion OAuth

- 표준 OAuth 2.0 (public integration). 콜백에서 access_token 수령 → SQLite 저장(사용자 귀속), 세션은 httpOnly 쿠키.
- 페이지 선택 UI: Notion `search` API로 접근 가능한 페이지 목록 표시 + 검색.
- 토큰 만료/권한 회수 시: 401 감지 → 프론트에 재연결 유도 응답.

---

## 6. 지원 블록 매트릭스

| 블록 | v1 처리 |
|---|---|
| paragraph, heading_1~3 | 완전 지원. heading은 양식의 대/중/소제목 스타일에 매핑 |
| bulleted/numbered_list, to_do | 완전 지원 (중첩 포함, numbered는 노션과 동일한 번호 체계) |
| quote, divider, callout | 완전 지원 (callout 아이콘·배경 포함) |
| toggle | 문서 설정에 따라 펼침(기본)/접힘(제목만) |
| table | 완전 지원 (헤더 행/열 스타일) |
| image | 캐시 경유 렌더. 캡션 포함. 페이지 경계에서 잘리지 않도록 `break-inside: avoid` |
| equation (블록/인라인) | KaTeX 서버사이드 → 정적 HTML+CSS |
| bookmark, embed | 카드형 렌더 (제목·URL·설명, OG 메타는 fetch 실패 시 URL만) |
| child_database (인라인 DB) | 기본 뷰 스냅샷 표, 최대 100행, 초과 시 "…외 N행" 표기 |
| code | 지원 (고정폭 폰트, 언어 라벨, 하이라이트는 v1 흑백 무강조도 허용) |
| child_page, link_to_page | v1: 링크 카드로 표기 (재귀 병합은 오픈 이슈 O5) |
| video, audio, file | 자리표시자 카드 (파일명 + 안내 문구) |
| synced_block, column_list | synced: 원본 내용 렌더 / column: 인쇄 폭에 맞춰 세로 스택 (기본) 또는 유지 — 문서 설정 |

**리치텍스트 인라인 서식**: bold, italic, underline, strikethrough, code, color/배경색, 링크(각주 스타일 옵션 v2) 모두 지원.

---

## 7. 양식(템플릿) 시스템

### 7.1 스타일 스키마 (JSON)

```jsonc
{
  "name": "공문서형",
  "page": { "size": "A4", "orientation": "portrait",
            "margin": { "top": 20, "bottom": 15, "left": 20, "right": 20 },  // mm
            "background": "#ffffff" },
  "body": { "font": "kopub-batang", "size": 11,        // pt
            "lineHeight": 1.6, "letterSpacing": 0,      // em 단위 소수
            "align": "justify" },
  "headings": {
    "h1": { "font": "kopub-dotum", "size": 18, "weight": 700, "spaceBefore": 12, "spaceAfter": 6, "numbering": "Ⅰ." },
    "h2": { "size": 14, "weight": 700, "numbering": "1." },
    "h3": { "size": 12, "weight": 600, "numbering": "가." }
  },
  "options": { "toggleExpand": true, "columnStack": true, "pageNumber": true }
}
```

- `numbering`은 v1에서 **표기 스타일 선택** 수준(자동 번호 부여: Ⅰ/1/가, 1.1.1, 없음 중 선택). 완전 커스텀 번호 체계는 v2.
- 내장 프리셋 3종으로 시작: **공문서형 / 보고서형 / 학습지형**. 사용자는 프리셋에서 파생 저장 가능.

### 7.2 폰트 세트

| 용도 | 폰트 | self-host | 비고 |
|---|---|---|---|
| 본문 명조 | KoPubWorld 바탕 | woff2 서브셋 | 임베딩 허용 |
| 본문 명조 | 나눔명조 | woff2 | OFL |
| 본문 명조 | Noto Serif KR | woff2 | OFL |
| 본문 고딕 | KoPubWorld 돋움 | woff2 | 임베딩 허용 |
| 본문 고딕 | Pretendard | woff2 | OFL, 사이음 표준 |
| 본문 고딕 | 나눔고딕 | woff2 | OFL |
| 본문 고딕 | Paperlogy(페이퍼로지) | woff2 | 무료, 9웨이트 |
| 제목/발표 | 프리젠테이션체 | woff2 | 무료 배포 확인 필요 → O2 |
| 본문 고딕 | 함초롬돋움 | **플래그 OFF 기본** | 웹 배포/PDF 임베딩 라이선스 미확정 → O1, C6 |

- 모든 폰트는 서버 self-host, KS X 1001 + 자주 쓰는 확장 한자 범위로 서브셋.
- Puppeteer 컨테이너에도 동일 폰트 설치 (PDF 임베딩 일관성).
- 라이선스 미확정 폰트는 `fonts.config.json`의 `enabled: false`로 빌드에서 제외.

---

## 8. DB 스키마 (SQLite)

```sql
users          (id, notion_user_id UNIQUE, name, avatar_url, created_at)
notion_tokens  (user_id PK/FK, access_token, workspace_id, workspace_name, updated_at)
templates      (id, user_id NULL이면 시스템 프리셋, name, style_json, created_at, updated_at)
doc_settings   (id, user_id, notion_page_id, template_id, override_json, updated_at,
                UNIQUE(user_id, notion_page_id))          -- 문서별 마지막 인쇄 설정
image_cache    (id, notion_block_id, source_hash, file_path, content_type,
                width, height, fetched_at)
render_jobs    (id, user_id, notion_page_id, kind 'preview'|'pdf', status,
                started_at, finished_at, error TEXT)       -- 관측/디버깅용 로그
```

---

## 9. API 엔드포인트

| Method | Path | 역할 |
|---|---|---|
| GET | /auth/notion, /auth/notion/callback | OAuth 시작/콜백 |
| GET | /api/me | 세션 사용자 + 워크스페이스 정보 |
| POST | /api/pages/search | 페이지 검색 (query in body) |
| POST | /api/pages/fetch | 블록 트리 fetch+정규화 (pageId in body, 캐시 적용) |
| POST | /api/render/preview | 정규화 캐시 + 설정 → 페이지별 PNG 목록 |
| POST | /api/render/pdf | 최종 PDF 생성 → 파일 스트림 |
| GET | /api/templates | 프리셋 + 내 양식 목록 |
| POST/PUT/DELETE | /api/templates(/:id) | 커스텀 양식 CRUD |
| GET | /img/:cacheId | 캐시된 이미지 서빙 |

---

## 10. 폴더 구조

```
/notion-print-studio
  ├── /client                      # React + Vite + Tailwind
  │   └── /src
  │       ├── /pages               # Connect, PageSelect, Editor(미리보기+설정 패널)
  │       ├── /components          # SettingsPanel, TemplateManager, PreviewPager, FontPicker
  │       └── /lib                 # api client, debounce hook
  ├── /server                      # Node + Express
  │   └── /src
  │       ├── /notion              # oauth.js, client.js, blockFetcher.js
  │       ├── /normalize           # normalizer.js, katex.js
  │       ├── /render              # htmlBuilder.js, cssVars.js, puppeteerPool.js, queue.js
  │       ├── /cache               # imageCache.js, blockCache.js
  │       ├── /db                  # schema.sql, dao.js
  │       └── /routes
  ├── /shared                      # 양식 스키마 타입/검증(zod), 프리셋 JSON
  ├── /fonts                       # woff2 서브셋 + fonts.config.json (enabled 플래그)
  └── /docs                        # 본 설계서, 오픈 이슈 트래킹
```

단일 앱이므로 npm workspaces는 client/server/shared 3패키지 구성.

---

## 11. 워크플로우 단계별 검증 테이블

| 단계 | 성공 기준 | 검증 방법 | 실패 시 처리 |
|---|---|---|---|
| 1. OAuth 연결 | 토큰 저장 + /api/me 정상 응답 | 스키마 검증 (토큰 행 존재, workspace_id 비어있지 않음) | 에러 화면 + 재시도 버튼 (자동 재시도 없음) |
| 2. 페이지 검색 | 결과 목록 반환 (0건 허용) | 규칙 기반 (응답 형식) | Notion 429 → 지수 백오프 자동 재시도 최대 3회 |
| 3. 블록 트리 fetch | 모든 has_children 재귀 완료, 커서 소진 | 규칙 기반 (미해결 커서 0개) | 429/5xx → 백오프 재시도 3회, 초과 시 부분 결과 + 사용자 알림 |
| 4. 정규화 | 모든 블록이 정규화 스키마 통과, 미지원 블록은 자리표시자로 변환 | 스키마 검증 (zod) | 개별 블록 실패 → 자리표시자 + render_jobs.error 로그 (스킵+로그) |
| 5. 이미지 캐시 | 이미지 요청 시 로컬 파일 존재 | 규칙 기반 (파일 존재 + content_type) | fetch 실패 재시도 2회 → 깨진 이미지 자리표시자 (스킵+로그) |
| 6. HTML 조립 | 양식 JSON이 스키마 통과, CSS 변수 전량 주입 | 스키마 검증 (zod) + 스냅샷 테스트 | 스키마 실패 → 기본 프리셋으로 폴백 + 사용자 알림 |
| 7. 미리보기 렌더 | 요청 후 4초 내 PNG 목록 반환 | 규칙 기반 (페이지 수 ≥ 1, 타임아웃) | 타임아웃 → 큐 재시도 1회 → "미리보기 갱신" 수동 버튼 노출 (에스컬레이션) |
| 8. PDF 생성 | 유효한 PDF 바이트, 페이지 수 = 미리보기 페이지 수 | 규칙 기반 (PDF 헤더 매직바이트, 페이지 수 일치) | 재시도 1회 → 실패 시 에러 + render_jobs 로그 |
| 9. 양식 저장 | style_json 스키마 통과 후 저장 | 스키마 검증 | 검증 실패 → 필드별 에러 반환 (자동 재시도 없음) |

LLM 자기 검증 단계 없음 (C1). 최종 인쇄물 품질 판단은 사용자 미리보기 = 사람 검토에 해당.

---

## 12. 수직 슬라이스 빌드 순서

1. **슬라이스 1 — 파이프라인 골격**: OAuth → 페이지 fetch → 정규화(텍스트 블록만) → 고정 스타일 HTML → Puppeteer PDF 1회 생성. E2E로 "노션 페이지 → PDF"가 뚫리는지 확인.
2. **슬라이스 2 — 스타일 엔진**: CSS 변수 체계 + 설정 패널(여백/자간/행간/폰트/배경색) + 디바운스 미리보기. 이 시점에 폰트 self-host 완료.
3. **슬라이스 3 — 블록 커버리지 확장**: 이미지 캐시, 표, 콜아웃, 토글, 수식(KaTeX), 인라인 DB 스냅샷. 블록별 스냅샷 테스트 추가.
4. **슬라이스 4 — 양식 시스템**: 프리셋 3종, 커스텀 양식 CRUD, 문서별 설정 저장(doc_settings), 제목 자동 번호.
5. **슬라이스 5 — 운영 마감**: 렌더 큐 부하 테스트, render_jobs 관측, Railway 배포(볼륨 + Puppeteer 컨테이너 폰트 설치), 라이선스 플래그 최종 점검.

---

## 13. 오픈 이슈

| # | 이슈 | 결정 시점 |
|---|---|---|
| O1 | 함초롬돋움 웹 배포·PDF 임베딩 라이선스 확인 (한컴 라이선스 원문 검토) — 확인 전까지 플래그 OFF | 슬라이스 2 전 |
| O2 | 프리젠테이션체 배포 라이선스·정확한 폰트명 확인 | 슬라이스 2 전 |
| O3 | Notion API rate limit(평균 3 req/s) 하에서 대형 페이지(블록 500+) fetch 시간 — 진행률 UI 필요 여부 | 슬라이스 1 결과 보고 |
| O4 | Railway 컨테이너에서 Puppeteer 크로미움 메모리 상한 — 동시성 2가 안전한지 실측 | 슬라이스 5 |
| O5 | 하위 페이지 재귀 병합 인쇄 (child_page 펼쳐 넣기) — v2 후보, 순환 참조 방지 설계 필요 | v1 이후 |
| O6 | 머리말/꼬리말·쪽번호 커스텀 포맷 ("- 1 -" 스타일 등) — v1은 단순 쪽번호 on/off | v1 이후 |
