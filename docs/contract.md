# Contract (FROZEN)

작성일 2026-09-25. 이후 재해석 없이 인용만 함 — 계약 자체를 바꿔야
하는 경우 [proposal.md](proposal.md)에 사실과 근거를 먼저 기록.

## 정체성

Folio는 Zotero를 대체하는 도구가 아니라 보강하는 도구. 개인 논문
아카이브 + 메모 도구 — Zotero 위에서 논문을 둘러보고 직접 메모를 쓰는
공간.

## 4개 capability, 그 이상 없음

1. **papers** — 논문 목록/제목 검색
2. **memo** — 논문별 메모(child note) / 독립 메모(standalone note) 읽고 쓰기
3. **collections** — 컬렉션 기준 탐색
4. **webpage-add** — 웹페이지 URL을 새 논문 아이템으로 추가

## 절대 규칙

- Zotero 아이템의 title/author/PDF 등 기존 아이템의 원본 서지정보
  필드는 절대 수정·덮어쓰기 금지. 새 아이템을 만드는 것(webpage-add)과
  기존 아이템을 고치는 것은 별개 — Folio가 만든 아이템도 생성 이후엔
  손대지 않고 Zotero(또는 Connector) 관리 영역으로 둠.
- 이 도구가 직접 만든 메모 note(태그로 식별)는 예외 — 생성/수정 둘 다
  허용. 저장할 때마다 새 note가 쌓이면 안 되기 때문.
- AI 생성 요약/태그 없음. 메모는 전적으로 사용자 직접 작성.
- 저장, 메타데이터 추출, PDF 파일 관리, 다기기 동기화는 Zotero가 이미
  담당하므로 재구현 대상 아님. 절대 규칙은 아니고 기본값 — Zotero
  UI로 불편하거나 Folio 워크플로에 자연스럽게 필요한 경우 예외
  가능. 애매하면 [proposal.md](proposal.md)에 먼저 기록하고 확인 필요.
- 의미 기반 검색(임베딩) 보류 — 지금은 제목 검색만.
- 웹 UI는 4개 capability(+검색 아이콘) 이상으로 화면·탭 확장 금지.

## 근거 문서

- [.claude/RULES.md](../.claude/RULES.md) — 이 계약의 원본, 구현 세부
  규칙(코딩 컨벤션, 아키텍처, 하지 말아야 할 것)은 계속 그쪽에서 관리.
