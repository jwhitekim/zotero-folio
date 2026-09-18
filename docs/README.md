# docs/ 안내

Folio 개발 중 남긴 기록 모음입니다. 기능 구현 자체는 `.claude/CLAUDE.md`가
기준이고, 여기 있는 문서들은 그 배경 설명이나 특정 버그의 조사 과정처럼
CLAUDE.md에 다 담기엔 긴 내용을 옮겨둔 곳입니다.

## 전체 개요

| 문서 | 내용 |
| --- | --- |
| [overview/product-spec.md](overview/product-spec.md) | Folio 전체 제품 스펙 — 기능, 아키텍처, 데이터 모델, API, 화면 구성을 현재 코드베이스 기준으로 정리한 사후(as-built) 문서 |
| [changelog.md](changelog.md) | git 로그를 주제별로 재구성한 전체 개발 기록 |
| [overview/stack-choice-and-scaling.md](overview/stack-choice-and-scaling.md) | Node.js+Svelte 스택 채택 근거, 향후 대규모 사용자 대응 시 확장 로드맵 |
| [overview/scope-discipline-notes.md](overview/scope-discipline-notes.md) | 프로젝트 규모와 개인 검증 능력 사이 격차, 범위를 좁게 유지하는 원칙과 확인이 필요한 변경 신호 |
| [overview/release-feasibility.md](overview/release-feasibility.md) | 윈도우 데스크톱 앱화 가능성 탐색 — 패키징 방식 비교, 서버 리소스 관점, 배포 전 확인 사항 |

## PDF 뷰어 ([pdf/](pdf/))

| 문서 | 내용 |
| --- | --- |
| [pdf/pdf-zoom.md](pdf/pdf-zoom.md) | 확대/축소 설계 — 커서 앵커링, 중앙 정렬, 재렌더링 debounce 구현 방식과 참고 자료, 실패했던 접근들 |
| [pdf/pdf-text-selection-alignment.md](pdf/pdf-text-selection-alignment.md) | Windows 디스플레이 배율(125%/150%) 환경에서 텍스트 선택 하이라이트가 어긋나던 문제의 조사·해결 |
| [pdf/pdf-highlight-popup.md](pdf/pdf-highlight-popup.md) | 형광펜(하이라이트) 팝업 UI 개선 기록 — 애니메이션, 재드래그 삭제 판정, 낙관적 업데이트 |
| [pdf/pdf-highlight-popup-safari-callout.md](pdf/pdf-highlight-popup-safari-callout.md) | 하이라이트 팝업과 사파리 텍스트 선택 콜아웃 겹침 문제 해결 |
| [pdf/pdf-ink-annotation-research.md](pdf/pdf-ink-annotation-research.md) | Zotero ink(필기) annotation 데이터 형식 조사 |

## 태블릿·터치 ([touch/](touch/))

| 문서 | 내용 |
| --- | --- |
| [touch/tablet-touch-ux-ideas.md](touch/tablet-touch-ux-ideas.md) | 태블릿/모바일 터치 UX 논의(핀치 확대, 필기, 그 밖 디자인 방향) |
| [touch/pdf-touch-pinch-zoom.md](touch/pdf-touch-pinch-zoom.md) | 터치 핀치 확대/축소의 `touch-action` 충돌 원인 조사 |

## 디자인·애니메이션 ([design/](design/))

| 문서 | 내용 |
| --- | --- |
| [design/design-references.md](design/design-references.md) | 서재형 UI 개편 때 참고한 서비스·타이포그래피·색상 레퍼런스와 실제 반영 내용, 로그인·가이드 페이지 편집 디자인 재설계 근거 |
| [design/guide-scroll-reveal-research.md](design/guide-scroll-reveal-research.md) | `/guide` 페이지 단계별 등장(스크롤 리빌) 애니메이션 구현 시 참고한 레퍼런스와 최종 선택 근거 |
| [design/scroll-animation-advanced-patterns.md](design/scroll-animation-advanced-patterns.md) | 고도화된 스크롤/등장 애니메이션 레퍼런스 — 가이드 페이지 리빌 패턴 근거 확인 + 로그인 페이지 배치 개선용 추가 조사 |

## 외부 검증 ([repo-proof/](repo-proof/))

RepoProof(github.com/jwhitekim/repo-proof) 방법론의 검증 모드별 결과. 원본
리포트(영문)는 todo-guard 문체 규칙 검사 대상 아님(`.todoguardignore`).

| 문서 | 내용 |
| --- | --- |
| [repo-proof/audits/](repo-proof/audits/) | 감사(audit) 모드 리포트 원본 |

## 새 문서를 추가할 때

- 이 폴더에 있는 문서는(외부 감사 리포트 제외) `todo-guard` 스킬의 문서 규칙(개조식
  문체, 지시대명사 금지 등)을 적용받습니다. 쓰기 전에
  `~/.claude/skills/todo-guard/rules/doc-rules.md`를 먼저 읽으세요.
- 새 문서를 추가하면 위 표 중 맞는 카테고리에 한 줄 추가해주세요. 어느
  카테고리에도 안 맞으면 새 카테고리 절을 만드세요.
