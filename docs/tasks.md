# Tasks

capability별 구현 체크리스트. 세션 단위 작업 기록(무엇을 언제 왜
고쳤는지)은 [TODO.md](../TODO.md)(todo-guard 운영)에 남는다 — 이 문서는
그 결과가 "4개 capability를 빠짐없이 구현했는가"를 한눈에 보는 용도.

## papers — 논문 목록/제목 검색

- [x] Zotero 라이브러리 증분 동기화(`?since=` 기반)
- [x] 논문 목록 조회/제목 검색
- [x] 정렬(최근순/년도순/이름순), 목록/표지 보기 전환
- [ ] 검색 결과에서 메모 검색까지 확장할지 — `docs/notes/overview/scope-discipline-notes.md`에서 제기된 open question

## memo — 논문별/독립 메모

- [x] 논문별 메모(child note) 읽고 쓰기, 태그 식별(`zotero-insight:memo`)
- [x] 독립 메모(standalone note) 읽고 쓰기, 태그 식별(`zotero-insight:standalone-memo`)
- [x] 마크다운 편집, 자동저장(레이스 컨디션 수정 완료 — TODO.md 참고)
- [x] 저장 시 기존 note 존재 여부 확인 후 PATCH/POST 분기(중복 생성 방지)

## collections — 컬렉션 기준 탐색

- [x] Zotero 컬렉션 구조 조회
- [x] 컬렉션별 논문 필터링
- [x] 컬렉션 전환 레이스 컨디션 수정 완료(RepoProof RP-WEB-002)

## webpage-add — 웹페이지를 새 논문 아이템으로 추가

- [x] URL 입력 → Zotero `webpage` 아이템 생성
- [x] 페이지 `<title>` 자동 추출
- [x] SSRF 방지(내부망/사설 IP 차단, RepoProof RP-NODE-002)

## capability 공통

- [x] Zotero OAuth 로그인, 멀티유저(Supabase) 전환
- [x] PDF/HTML 원문 뷰어(확대/축소, 터치 제스처)
- [x] 필기 도구 구현 후 UI 숨김 처리(GoodNotes 대체 결정)
- [ ] 의미 기반 검색 — 보류(`contract.md`)
