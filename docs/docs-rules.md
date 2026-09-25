# 문서 배치 규칙 (docs-init/docs-compliance)

`docs/` 아래 SDD(Spec-Driven Development) 문서 배치·작성 규칙.
`docs-init` 스킬(`~/.claude/skills/docs-init/SKILL.md`)이 만든 구조
유지가 목적 — OpenSpec류 도구의 Requirement/Scenario 형식은 참고하되,
`openspec/`나 `changes/<change-id>/` 같은 델타 폴더 구조는 안 쓰고
`docs/` 하나 아래에 평탄화.

## 구조

```
docs/
├── README.md          # docs/ 진입점, 읽는 순서 안내
├── contract.md         # 상위 계약, FROZEN — 이후 절대 재해석하지 않고 인용만 함
├── proposal.md          # 왜/무엇을 바꾸는지 + 변경이력 표
├── design.md            # capability를 가로지르는 기술 결정 (프로젝트에 1개만)
├── tasks.md              # 전체 구현 체크리스트 (프로젝트에 1개만)
├── docs-rules.md         # 이 파일
├── notes/                # SDD 도입 전부터 쌓인 조사·결정 기록(레거시), 안내는 notes/README.md
└── specs/
    └── <capability>/
        └── spec.md        # capability별 요구사항만
```

## 절대 하지 말 것

- capability마다 `design.md`/`tasks.md` 별도 생성 금지 — 두 파일은
  프로젝트 전체에 각각 딱 1개(`docs/design.md`, `docs/tasks.md`)만
  존재. capability별로 나누고 싶어도 그 안의 섹션 구분으로 대체.
- `openspec/`, `changes/<id>/` 같은 OpenSpec 전용 이름/구조 사용 금지.
- 버전 번호를 파일명에 넣지 않음(`contract-v0.1.md` 금지) — 버전은
  파일 내부 제목과 `proposal.md`의 변경이력 표로만 관리.
- `contract.md`는 세팅 후 FROZEN — 최초 1회만 작성하고 이후 재해석
  금지. 계약 자체를 바꿔야 하면 `proposal.md`에 사실과 근거를 먼저 기록.

## Requirement/Scenario 작성 형식

`specs/<capability>/spec.md`의 요구사항은 `docs-compliance` 스킬이
강제하는 형식(`### Requirement: <이름>` + SHALL 문장, `GIVEN/WHEN/THEN`
시나리오) 준수 — 골격은 `docs-init`이 생성, 실제 요구사항 작성·검증은
`docs-compliance` 담당.

## 레거시 문서(`docs/notes/`)와의 관계

SDD 도입 전에는 `docs/` 루트가 지금 `docs/notes/`에 있는 조사·결정
기록(변경 이력, PDF 뷰어/터치 제스처/디자인 레퍼런스 조사, 외부 감사
결과 등)의 자리. SDD 구조 도입(2026-09-25) 이후 `docs/` 루트는 SDD
문서가 차지하고, 기존 기록은 전부 `docs/notes/`로 이동 — 내용은 그대로,
위치만 변경. 새 조사·결정 기록도 계속 `docs/notes/`에 누적(SDD 문서가
대체하지 않는 영역).
