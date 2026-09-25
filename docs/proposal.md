# Proposal

## 왜

Folio는 Zotero 라이브러리를 그냥 훑어보기엔 불편하고, "논문을 읽으며
바로 내 언어로 메모를 남기는" 흐름이 Zotero 자체 UI만으로는 매끄럽지
않아서 시작. AI 요약 대신 직접 쓰는 메모를 택한 이유는 — 요약은 읽고
나면 머리에 안 남는다는 판단(`docs/contract.md` 참고).

## 무엇을

[contract.md](contract.md)에 명시된 4개 capability(papers/memo/
collections/webpage-add)를 Zotero Web API 위에 얇게 얹는 구조. 저장소는
Supabase(멀티유저 전환 이후), 인증은 Zotero OAuth, 메모 원문은 캐시 없이
항상 Zotero에서 라이브 조회 — 자세한 기술 결정은 [design.md](design.md) 참고.

## 변경이력

| 날짜 | 변경 | 근거/사유 |
|------|------|-----------|
| 2026-09-25 | SDD 문서 구조 도입(`docs-init`) — 기존 `docs/`는 `docs/notes/`로 이동, `docs/` 루트를 contract/proposal/design/tasks/specs가 차지 | 문서를 요구사항 단위로 관리하기 위함. 기존 조사·결정 기록은 내용 보존, `docs/notes/README.md`에서 계속 확인 가능 |
| 2026-09-19 | 신규 기능 개발 중단, 버그 수정 위주로 전환 | 태블릿 터치 제스처 한 기능에서 실기기 피드백 대응이 여러 차례 반복되며 회귀 누적, 네이티브 핀치 기능 전체 되돌림 포함(`docs/notes/overview/scope-discipline-notes.md`) |
| 2026-09-19 | 필기(펜/형광펜/지우개) 도구 UI 숨김 | GoodNotes로 필기하고 완성된 PDF를 Zotero 첨부파일로 교체·동기화하는 방식으로 결정 — 직접 만든 필기 도구가 GoodNotes 필기감을 따라가기 어렵다는 판단 |
| (마이그레이션 시점) | 로컬 SQLite 단일유저 구조에서 Supabase(Postgres) + OAuth 멀티유저 구조로 전환 | `.claude/RULES.md` 아키텍처 절, `docs/notes/overview/stack-choice-and-scaling.md` 참고 |

이후 새 변경은 이 표에 계속 추가 예정.
