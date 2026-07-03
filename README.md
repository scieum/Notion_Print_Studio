# Notion Print Studio (초안)

노션 페이지를 연결하면 한글(HWP) 워드프로세서 수준의 인쇄 제어를 제공하고 고품질 PDF를 출력하는 독립 웹앱.
설계는 [notion-print-studio-설계서.md](notion-print-studio-설계서.md), 작업 가이드는 [CLAUDE.md](CLAUDE.md) 참조.

## 실행

```bash
npm install
copy .env.example .env   # NOTION_CLIENT_ID / SECRET 채우기
npm run dev              # server :3001 + client :5173
```

Notion 인티그레이션(public)을 만들고 Redirect URI에
`http://localhost:3001/auth/notion/callback`을 등록해야 OAuth가 동작한다.

## 현재 구현 범위 (수직 슬라이스 1~2 + 일부 3)

- Notion OAuth 연결, 페이지 검색/선택
- 블록 트리 재귀 fetch → 정규화 (10분 TTL 캐시)
- 텍스트/목록/표/콜아웃/토글/수식(KaTeX)/이미지(디스크 캐시)/코드/북마크
- CSS 변수 기반 스타일 엔진 + 설정 패널 + 1.2초 디바운스 미리보기
- 내장 프리셋 3종(공문서형/보고서형/학습지형) + 커스텀 양식 CRUD
- Puppeteer PDF 생성 (상주 브라우저 1개, 동시성 2, 인메모리 큐)

## 초안에서 미룬 것 (TODO)

- 미리보기가 페이지별 PNG가 아니라 저사양 PDF(iframe 표시)로 대체됨 — 설계서 §9의 PNG 목록 API로 교체 필요
- 폰트 woff2 서브셋 파일 미포함 — `fonts/fonts.config.json`에 파일을 넣으면 자동 임베드, 없으면 시스템 폰트 폴백
- 인라인 DB 스냅샷(최대 100행), KaTeX 폰트 서빙, 제목 자동 번호의 완전 커스텀
- Railway 배포 설정 (Dockerfile + 볼륨)
