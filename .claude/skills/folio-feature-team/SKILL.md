---
name: folio-feature-team
description: Folio(이 저장소) 기능 추가나 버그 수정을 folio-builder(구현) → folio-verifier(실제 앱 구동 검증) 흐름으로 처리하는 오케스트레이터. "이 기능 추가해줘", "이 버그 고쳐줘", "~가 안 돼" 같은, 여러 파일에 걸치거나 실제 동작 확인이 필요한 요청에 사용. 후속 작업(검증 실패 후 "다시 고쳐줘", "이 부분만 다시", "재검증해줘")에도 반드시 이 스킬을 사용한다. 오탈자 수정이나 색상 값 하나 바꾸는 것처럼 한 줄짜리 사소한 변경에는 쓰지 않는다 — 그런 건 직접 처리한다.
---

# Folio Feature Team — 구현 + 실행 검증 오케스트레이터

## 실행 모드: 서브 에이전트

이 환경엔 에이전트 팀(TeamCreate) 기능이 없다. `Agent` 도구로 folio-builder와 folio-verifier를 순차 호출하고, 결과를 이 세션(오케스트레이터)이 직접 중계한다 — 두 에이전트는 서로 직접 통신하지 않는다.

## 언제 이 스킬을 쓰는가

- 여러 파일에 걸치는 기능 추가/버그 수정
- "실제로 되는지" 브라우저/서버 구동으로 확인이 필요한 변경 (UI 동작, API 응답 등)
- 검증 실패 후 재수정 요청

**쓰지 않는 경우:** 오탈자, 주석 수정, 색상 값 하나처럼 결과를 눈으로 바로 판단 가능한 한 줄짜리 변경 — 오버헤드가 이득보다 크다. 이런 요청은 오케스트레이터(이 세션)가 직접 처리한다.

## 에이전트 구성

| 역할 | 에이전트 타입 | 담당 | 스킬 |
|------|-------------|------|------|
| builder | `folio-builder` (커스텀) | 요청 분석/계획/구현(server+web), 자체 빌드 확인 | `plan` |
| verifier | `folio-verifier` (커스텀) | 실제 로컬 구동 + 브라우저로 동작 검증 | `folio-run-verify` |

두 `Agent` 호출 모두 `model: "opus"`를 명시한다.

## 워크플로우

### Phase 0: 컨텍스트 확인 (후속 작업 지원)

1. 요청이 "쓰지 않는 경우"에 해당하면 이 스킬을 쓰지 않고 직접 처리한다
2. 이전 검증 실패에 대한 후속 요청("다시 고쳐줘", "이 부분만 다시")이면, 이전 folio-builder 호출의 Agent ID/이름이 있으면 `SendMessage`로 같은 컨텍스트를 이어가고, 없으면 verifier의 실패 내용을 프롬프트에 포함해 새로 호출한다
3. 새 기능/버그 요청이면 Phase 1로 진행

### Phase 1: builder 호출

```
Agent(
  subagent_type: "folio-builder",
  model: "opus",
  description: "{짧은 설명}",
  prompt: "{사용자 요청 원문 + 관련 배경(어떤 화면/파일에서 발생했는지 등 이미 파악된 정보}"
)
```

builder의 응답에서 (a) 구현 요약 (b) folio-verifier가 실행할 구체적 검증 시나리오를 추출한다. (b)가 애매하면 builder에게 구체화를 재요청한다(같은 Agent를 SendMessage로 이어서).

### Phase 2: verifier 호출

```
Agent(
  subagent_type: "folio-verifier",
  model: "opus",
  description: "{짧은 설명}",
  prompt: "다음 변경을 실제로 구동해 검증해줘.\n\n구현 요약: {builder 응답 요약}\n검증 시나리오: {builder가 정리한 시나리오 그대로}"
)
```

### Phase 3: 재시도 루프

verifier가 실패를 보고하면:

1. 실패 내용(재현 조건 + 근거)을 그대로 folio-builder에게 전달 — Phase 1에서 쓴 builder Agent 인스턴스가 있으면 `SendMessage`로 이어서 컨텍스트를 유지한다 (매번 새로 호출하면 이전 구현 맥락을 잃는다)
2. builder의 재수정 응답을 받으면 Phase 2로 돌아가 다시 verifier 호출 (새 인스턴스로 호출해도 무방 — verifier는 매번 독립 판정이 원칙)
3. 최대 2~3회 반복. 그래도 실패하면 루프를 멈추고 사용자에게 다음을 보고: 시도한 접근들, 마지막 실패 내용, builder/verifier가 제기한 의문점(있다면)

### Phase 4: 정리 및 보고

1. 검증 통과 시 사용자에게 요약 보고: 무엇을 바꿨는지, 어떻게 검증했는지(verifier가 실제로 확인한 내용)
2. `commit-and-push` 스킬 사용 여부는 사용자에게 물어본다 — 이 오케스트레이터가 자동으로 커밋/푸시하지 않는다
3. 복잡한 변경이었다면 `_workspace/{YYYYMMDD}_builder_summary.md`, `_workspace/{YYYYMMDD}_verifier_report.md`에 각 에이전트 응답을 저장해 감사 추적을 남긴다 (사소한 변경엔 생략 가능)

## 데이터 흐름

```
[오케스트레이터]
    │
    ├─ Agent(folio-builder) ──→ 구현 + 검증 시나리오
    │
    ├─ Agent(folio-verifier, 시나리오 전달) ──→ 통과/실패 + 근거
    │
    ├─ 실패 시: SendMessage(builder, 실패 내용) ──→ 재수정 ──┐
    │                                                        │
    └──────────────────────── (Phase 2로 반복, 최대 2~3회) ──┘
                    │
              사용자에게 보고
```

## 에러 핸들링

| 상황 | 전략 |
|------|------|
| builder가 요청을 CLAUDE.md 스코프 밖이라고 판단 | 구현하지 않고 사용자에게 확인 요청 (에스컬레이션) |
| verifier가 환경 문제(포트 충돌 등)로 검증 자체를 못함 | `folio-run-verify` 스킬 절차 재확인 후 재시도, 그래도 막히면 사용자에게 환경 이슈로 보고 |
| 동일 시나리오 2~3회 연속 실패 | 루프 중단, 접근 자체 재검토가 필요함을 사용자에게 보고 |
| builder/verifier 응답이 모호함 | 재프롬프트로 구체화 요청 (SendMessage로 같은 인스턴스 이어서) |

## 테스트 시나리오

### 정상 흐름
1. 사용자: "논문 상세 화면에서 PDF 확대 버튼이 최대 배율에서도 안 꺼져요"
2. Phase 1: folio-builder 호출 → `PdfPane.svelte`의 `MAX_ZOOM` 비교 로직 수정 + 검증 시나리오("논문 열고 확대 버튼 5회 이상 클릭, 500% 도달 시 버튼 disabled 되는지 확인") 반환
3. Phase 2: folio-verifier 호출 → 로컬 구동 후 실제로 클릭 반복, disabled 확인 → 통과 보고
4. Phase 4: 사용자에게 요약 보고, 커밋 여부 질문

### 에러 흐름
1. Phase 2에서 verifier가 "500%에서도 버튼이 안 꺼짐, 콘솔에 NaN 에러" 보고
2. Phase 3: SendMessage로 builder에게 실패 내용 전달 → builder가 원인(비교 연산자 오타) 파악 후 재수정
3. Phase 2 재실행 → verifier 재검증 → 통과
4. 사용자에게 "1회 재수정 후 통과" 명시하며 보고
