# CLAUDE.md

이 파일은 Claude Code가 이 저장소에서 작업할 때 참조하는 가이드다.

## 프로젝트 개요

**Notion Print Studio** — 노션 페이지를 연결하면 한글(HWP) 워드프로세서 수준의 인쇄 제어(여백·자간·행간·폰트·배경색·제목 스타일)를 제공하고 고품질 PDF를 출력하는 독립 웹앱.

- 상세 설계: [notion-print-studio-설계서.md](notion-print-studio-설계서.md)
- 디자인 시스템: [DESIGN.md](DESIGN.md)
- 배포: Railway 단일 앱 (SQLite 볼륨 + Puppeteer 컨테이너)

## 불변 제약 (절대 위반 금지)

1. **런타임 LLM 없음** — 모든 처리는 결정론적. LLM 자기 검증 단계도 없다.
2. **Notion 토큰·API 키는 백엔드에만** — 클라이언트 노출 금지. 세션은 httpOnly 쿠키.
3. **Notion 읽기 전용** — 어떤 경우에도 Notion에 쓰지 않는다.
4. **노션 이미지의 만료 서명 URL** — 서버사이드 SQLite 디스크 캐시로 해결.
5. **페이지 ID 등 민감 식별자는 URL 쿼리 금지** — POST body로만 전달.
6. **라이선스 미확정 폰트는 배포 제외** — `fonts.config.json`의 `enabled: false` 플래그로 관리 (함초롬돋움 등).
7. **Puppeteer 동시성 상한 2** — 초과분은 인메모리 큐 대기. 브라우저는 1개 상주.

## 기술 스택 (확정)

| 영역 | 선택 |
|---|---|
| 프론트 | React + Vite + Tailwind SPA |
| 백엔드 | Node.js + Express |
| DB | SQLite (Railway 볼륨) |
| PDF/미리보기 | Puppeteer (Express 내장, 상주 브라우저 + 큐) |
| 수식 | KaTeX 서버사이드 렌더 |
| 스키마 검증 | zod (`/shared` 패키지) |
| 인증 | Notion OAuth 2.0 (public integration) |

## 폴더 구조 (npm workspaces: client / server / shared)

```
/client/src
  /pages        # Connect, PageSelect, Editor(미리보기+설정 패널)
  /components   # SettingsPanel, TemplateManager, PreviewPager, FontPicker
  /lib          # api client, debounce hook
/server/src
  /notion       # oauth.js, client.js, blockFetcher.js
  /normalize    # normalizer.js, katex.js
  /render       # htmlBuilder.js, cssVars.js, puppeteerPool.js, queue.js
  /cache        # imageCache.js, blockCache.js
  /db           # schema.sql, dao.js
  /routes
/shared         # 양식 스키마 타입/검증(zod), 프리셋 JSON
/fonts          # woff2 서브셋 + fonts.config.json
/docs           # 설계서, 오픈 이슈 트래킹
```

## 핵심 렌더 파이프라인

```
페이지 선택 → ① 블록 트리 fetch (재귀, 커서 처리)
           → ② 정규화 (이미지 URL → 캐시 URL, 수식 → KaTeX HTML)
           → ③ HTML 조립 (양식을 CSS 변수로 주입)
           → ④ Puppeteer 렌더 (미리보기: 페이지별 PNG / 최종: PDF)
```

- ①~② 결과는 페이지별 캐시 (정규화 블록 JSON, TTL 10분). 설정만 바꾸면 ③부터 재실행 — 렌더당 2~4초 목표.
- 스타일은 **전부 CSS 변수**로 주입 (`--margin-top`, `--letter-spacing`, `--line-height`, `--font-body`, `--paper-bg`, `--h1-size` 등). HTML 재조립 없이 변수만 교체 가능해야 한다.
- 미리보기는 설정 변경 후 1~2초 디바운스로 자동 재렌더.

## API 규약

- 페이지 검색/fetch/렌더는 모두 **POST** (pageId 등은 body에).
- 엔드포인트 목록은 설계서 §9 참조. 새 엔드포인트 추가 시 같은 원칙 적용.
- Notion 429 → 지수 백오프 재시도 최대 3회. 토큰 만료/권한 회수(401) → 프론트에 재연결 유도 응답.

## 블록 처리 원칙

- 지원 블록 매트릭스는 설계서 §6이 기준. **미지원 블록은 에러가 아니라 자리표시자로 변환**하고 `render_jobs.error`에 로그 (스킵+로그 원칙).
- 개별 블록 실패가 전체 렌더를 중단시키면 안 된다.
- 이미지는 `break-inside: avoid`로 페이지 경계에서 잘리지 않게.
- 인라인 DB는 기본 뷰를 표로 스냅샷, 최대 100행 ("…외 N행" 표기).
- 토글은 문서 설정에 따라 펼침(기본)/접힘.

## 양식(템플릿) 시스템

- 스타일 스키마는 설계서 §7.1의 JSON 구조를 따르고 zod로 검증 (`/shared`).
- 내장 프리셋 3종: **공문서형 / 보고서형 / 학습지형**. 사용자는 프리셋에서 파생 저장.
- 스키마 검증 실패 시 기본 프리셋으로 폴백 + 사용자 알림.
- 폰트는 전부 서버 self-host woff2 서브셋 (KS X 1001 + 확장 한자). Puppeteer 컨테이너에도 동일 폰트 설치.

## 빌드 순서 (수직 슬라이스)

1. **파이프라인 골격**: OAuth → fetch → 정규화(텍스트만) → 고정 스타일 HTML → PDF 1회. E2E 관통 확인.
2. **스타일 엔진**: CSS 변수 체계 + 설정 패널 + 디바운스 미리보기 + 폰트 self-host.
3. **블록 커버리지**: 이미지 캐시, 표, 콜아웃, 토글, KaTeX, 인라인 DB. 블록별 스냅샷 테스트.
4. **양식 시스템**: 프리셋 3종, 커스텀 CRUD, doc_settings, 제목 자동 번호.
5. **운영 마감**: 큐 부하 테스트, render_jobs 관측, Railway 배포, 라이선스 플래그 점검.

각 단계의 성공 기준·검증 방법·실패 처리 정책은 설계서 §11 검증 테이블을 따른다.

## UI 디자인 규칙 (DESIGN.md 요약)

앱 UI(설정 패널, 페이지 선택 등)는 Notion 스타일 디자인 시스템을 따른다. 상세는 [DESIGN.md](DESIGN.md) 참조.

**색상**
- 텍스트: `rgba(0,0,0,0.95)` (순수 `#000000` 금지 — 차갑게 읽힘)
- 웜 뉴트럴 스케일만 사용: `#f6f5f4`(배경 교대), `#31302e`, `#615d59`(보조 텍스트), `#a39e98`(플레이스홀더). 차가운 회색(`#9ca3af`, `#6b7280`) 금지.
- 액센트는 Notion Blue 하나만 — CTA·링크·인터랙션에만 사용. 장식적 남용 금지.
- 모든 색은 CSS 커스텀 프로퍼티로 — 컴포넌트에 hex 하드코딩 금지. 다크 모드는 `.dark` 클래스 스코프.

**보더/그림자**
- 구분선은 `1px solid rgba(0,0,0,0.1)` "속삭임 보더"가 기본. 무거운 보더 금지.
- 그림자는 다층 스택, 레이어당 opacity 0.05 이하. 단일 진한 드롭섀도 금지.

**타이포그래피**
- 4단계 웨이트: 400(본문) / 500(UI) / 600(강조) / 700(제목).
- 디스플레이 크기에서 네거티브 자간, 본문 16px는 normal.

**컴포넌트**
- 버튼·인풋 radius 4px, 카드 12px, 배지는 pill(9999px).
- 인풋은 밑줄 스타일 (bottom border만).
- 아이콘은 Lucide React 하나로 통일, `currentColor` 상속, inline SVG.
- **UI에 이모지 사용 금지** — 상태 표시는 색 점 또는 아이콘 컴포넌트로.
- 레이아웃은 8px 기본 단위, 컴팩트·밀도 우선.
- 모션: spring/bounce/overshoot 금지. `prefers-reduced-motion` 지원.

**주의**: DESIGN.md의 UI 스타일은 **앱 화면(chrome)에만 적용**된다. 인쇄물(PDF) 스타일은 사용자가 선택한 양식(템플릿)이 결정하며 별개 체계다.

## 오픈 이슈 (작업 전 확인)

- O1/O2: 함초롬돋움·프리젠테이션체 라이선스 미확정 — 슬라이스 2 전 확인, 그전까지 플래그 OFF.
- O3: 대형 페이지(블록 500+) fetch 시간 — 슬라이스 1 후 진행률 UI 필요 여부 판단.
- O4: Railway에서 Puppeteer 동시성 2의 메모리 안전성 실측 — 슬라이스 5.
- O5/O6: 하위 페이지 재귀 병합, 머리말/꼬리말 커스텀 — v1 범위 아님.
