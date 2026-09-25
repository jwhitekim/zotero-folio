# Folio 문서 안내

SDD(Spec-Driven Development) 구조. 배치 규칙은
[docs-rules.md](docs-rules.md) 참고.

## 읽는 순서

1. [contract.md](contract.md) — 프로젝트의 변하지 않는 전제(FROZEN)
2. [proposal.md](proposal.md) — 현재까지 무엇을, 왜 만들었는지 + 변경이력
3. [design.md](design.md) — capability를 가로지르는 기술 결정
4. [tasks.md](tasks.md) — 전체 구현 체크리스트
5. [specs/](specs/) — capability별 요구사항(Requirement/Scenario)
   - [specs/papers/spec.md](specs/papers/spec.md) — 논문 목록/검색
   - [specs/memo/spec.md](specs/memo/spec.md) — 메모(논문별/독립)
   - [specs/collections/spec.md](specs/collections/spec.md) — 컬렉션 탐색
   - [specs/webpage-add/spec.md](specs/webpage-add/spec.md) — 웹페이지 추가

## 그 밖의 기록

SDD 도입(2026-09-25) 이전부터 쌓인 조사·결정 기록(변경 이력, 뷰어/터치
제스처/디자인 레퍼런스 조사, 외부 감사 결과 등)은
[notes/](notes/README.md)에 그대로 보존. 위 5개 문서에 다 담기엔 긴
배경 설명이나 특정 버그의 조사 과정을 옮겨두는 곳 — 새 기록도 계속
여기 누적 예정.
