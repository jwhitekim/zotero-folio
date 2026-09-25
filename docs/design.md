# Design

capability를 가로지르는 기술 결정만 기록. capability 하나에만
해당하는 세부 구현은 각 `specs/<capability>/spec.md`나
`docs/notes/`에서 관리.

## 아키텍처 개요

```
[Zotero Web API]
      │ (읽기: 변경된 아이템/컬렉션 조회, PDF 다운로드, note 조회)
      │ (쓰기: 메모 note 생성/수정만 — 원본 서지정보는 절대 안 건드림)
      ▼
[server/] — Node.js + Express + Supabase(Postgres) + express-session
      ▲
      │ fetch('/api/...')
[web/] — Svelte + Vite
```

파일별 역할(zotero.js/supabase.js/context.js/db.js/server.js) 세부는
[.claude/RULES.md](../.claude/RULES.md) 아키텍처 절에서 관리 — 여기서
중복 기술 안 함.

## capability 간 공유 결정

- **메모 원문 미캐시**: memo capability뿐 아니라 papers 캐시(`folio_papers`)와
  구분되는 원칙 — 메모는 항상 Zotero에서 라이브 조회. source of truth는
  항상 Zotero.
- **증분 동기화**: papers capability의 목록 갱신은 `library version`
  기반 `?since=` 조회만 사용. 전체 재조회 금지.
- **메모 note 식별 태그**: memo capability(논문별/독립 메모) 공통으로
  `zotero-insight:memo`/`zotero-insight:standalone-memo` 태그 사용 —
  프로젝트 초기 이름(Zotero Insight)의 흔적이지만, 이미 사용자
  라이브러리에 이 태그로 저장된 메모 존재. 표시 이름이 Folio로
  바뀌어도 태그 문자열은 유지.
- **원문 뷰어 패턴**: PdfViewer.svelte/HtmlViewer.svelte 기준 — 뷰어
  하나당 컴포넌트 하나, 확대(`zoom`) 상태는 부모(PdfPane.svelte)가
  단일 소스로 보유. papers/webpage-add 양쪽 원문 표시에 공통 적용.
- **뷰포트/터치 제스처**: `touch-action: none` + 커스텀 포인터 이벤트로
  팬/핀치 직접 구현(`docs/notes/touch/pdf-touch-pinch-zoom.md`) — 원인과
  대안 검토 과정은 `docs/notes/touch/`에 기록.

## 검토했으나 채택하지 않은 방향

- AI 생성 요약/태그 — `contract.md`에서 폐기 확정.
- 커스텀 필기(펜/형광펜) 고도화 — GoodNotes로 대체 결정, 코드는 유지한
  채 UI에서만 숨김(`PdfPane.svelte`의 `SHOW_DRAWING_TOOLS`).
- `visualViewport` 기반 전면 네이티브 핀치 — 분할뷰(원문+메모 패널)
  레이아웃이 함께 확대되며 깨지는 문제, `docs/notes/touch/mobile-scroll-zoom-reference.md`
  참고.
