# docs/ 안내

Folio 개발 중 남긴 기록 모음입니다. 기능 구현 자체는 `.claude/CLAUDE.md`가
기준이고, 여기 있는 문서들은 그 배경 설명이나 특정 버그의 조사 과정처럼
CLAUDE.md에 다 담기엔 긴 내용을 옮겨둔 곳입니다.

## 문서 목록

| 문서 | 내용 |
| --- | --- |
| [product-spec.md](product-spec.md) | Folio 전체 제품 스펙 — 기능, 아키텍처, 데이터 모델, API, 화면 구성을 현재 코드베이스 기준으로 정리한 사후(as-built) 문서 |
| [pdf-zoom.md](pdf-zoom.md) | PDF 뷰어 확대/축소 설계 — 커서 앵커링, 중앙 정렬, 재렌더링 debounce를 구현한 방식과 참고 자료, 실패했던 접근들 |
| [pdf-text-selection-alignment.md](pdf-text-selection-alignment.md) | Windows 디스플레이 배율(125%/150%) 환경에서 PDF 텍스트 선택 하이라이트가 어긋나던 문제의 조사 과정과 해결 방식 |
| [pdf-highlight-popup.md](pdf-highlight-popup.md) | PDF 형광펜(하이라이트) 팝업 UI 개선 기록 — 애니메이션, 재드래그 삭제 판정, 낙관적 업데이트 등 |
| [design-references.md](design-references.md) | 서재형 UI 개편 때 참고한 서비스·타이포그래피·색상 레퍼런스와 실제 반영 내용 |
| [changelog.md](changelog.md) | git 로그를 주제별로 재구성한 전체 개발 기록 |
| [tablet-touch-ux-ideas.md](tablet-touch-ux-ideas.md) | 태블릿/모바일 터치 UX 논의(핀치 확대, 필기, 그 밖 디자인 방향) |
| [pdf-ink-annotation-research.md](pdf-ink-annotation-research.md) | Zotero ink(필기) annotation 데이터 형식 조사 |

## 새 문서를 추가할 때

- 이 폴더에 있는 문서는 `todo-guard` 스킬의 문서 규칙(개조식 문체,
  지시대명사 금지 등)을 적용받습니다. 쓰기 전에
  `~/.claude/skills/todo-guard/rules/doc-rules.md`를 먼저 읽으세요.
- 새 문서를 추가하면 이 표에도 한 줄 추가해주세요.
