# 형광펜 팝업 UI 개선 (2026-09-09)

`web/src/components/PdfViewer.svelte`의 형광펜(하이라이트) 팝업 2종
(색상 선택 팔레트 / 삭제 확인)을 다듬은 세션 기록. 마크업+스타일은 전부
PdfViewer.svelte 파일 하나 안에 존재(CLAUDE.md "뷰어 하나당 컴포넌트
하나" 규칙 적용).

## 배경

기존엔 팝업이 최소한의 카드 + 트랜지션 없는 즉시 등장/소멸이었다. 이번
세션에서 (1) 비주얼 디테일, (2) 등장/퇴장 애니메이션, (3) 삭제 팝업의
위험 강조, (4) 재드래그 삭제 판정 버그, (5) 칠하기 체감 딜레이,
(6) 빠르게 칠하기(마지막 색 즉시 적용) 순서로 진행.

## 1. 팝업 마크업을 하나로 합침 — 애니메이션의 전제 조건

색상 팔레트(`colorPopup`)와 삭제 확인(`deletePopup`)은 원래 각각
`{#if}` 블록으로 따로 `.highlight-popup`을 렌더링. 따로 렌더하는
구조에 퇴장 애니메이션을 붙이면 **닫히는 중인 옛 팝업이
DOM(Document Object Model)에 잠깐 남아**
`suppressLinksUnderPopup()`의 `querySelector('.highlight-popup')`가
엉뚱한(사라지는 중인) 팝업을 잡을 가능성 존재 — 색상 팝업을 닫고 곧바로
삭제 팝업을 여는 경로(재드래그)에서 실제로 겹치는 사례 확인.

그래서 팝업 요소를 항상 하나만 렌더링하고 내용만 교체. 두 팝업은
애초에 동시에 뜨지 않으므로(어느 쪽을 열든 여는 시점 직전
`closePopups()`가 둘 다 닫음) 동작은 동일.

```js
let activePopup = $derived(colorPopup ?? deletePopup);
```

`.highlight-popup`은 위치만 잡는 빈 래퍼(패딩/보더/애니메이션 없음)로
남기고, 카드 모양과 모션은 안쪽 `.popup-card`가 담당. `transform`은
레이아웃 박스를 바꾸지 않으므로 **애니메이션 중에도 래퍼의
`getBoundingClientRect()`는 항상 최종 크기/위치 유지** — 링크 무력화
판정 정상 동작.

### 후속 버그: 삭제 후 팝업 잔류

위 구조에서도 마크업이 `colorPopup`/`deletePopup`을 **직접**
(`activePopup.x`, `!!deletePopup` 등) 참조하는 상태였는데,
`removeHighlight()`가 API 호출 **전에** `closePopups()`로 해당 값을
즉시 null로 전환. 퇴장 트랜지션 동안 팝업 요소는 ~110ms간 DOM에 남아
있고, 남아있는 구간에 재평가가 걸리면 null을 참조해 블록 제거가 끝나지 않는
경우 발생(하이라이트는 이미 지워진 상태라 "지워졌는데 팝업만 남는"
증상으로 확인).

**해결**: 마크업이 읽는 값을 스냅샷(`popupView = { kind, x, y, above }`)
으로 분리. 팝업을 여는 경로는 `openColorPopup()` / `openDeletePopup()`
두 헬퍼로 통합하고, 닫을 때는 스냅샷을 유지 — 퇴장하는 팝업이 마지막
모습을 유지한 채로 사라지도록 처리.

## 2. 등장/퇴장 애니메이션

`.popup-card`에 커스텀 Svelte 트랜지션 `popupIn`/`popupOut`
(`popupMotion()`) 적용: opacity + `scale(0.94~1)` + 선택 영역 쪽에서
6px 밀려 나오는 `translateY`, `cubicOut`, 등장 170ms/퇴장 110ms.
`transform-origin`은 `above` 여부에 따라 `50% 100%`(위에 뜰 때) /
`50% 0%`(아래에 뜰 때)로 지정해 선택 영역에서 자라나오는 느낌 구현.

퇴장 키프레임엔 `pointer-events: none`을 넣어 사라지는 중인 팝업이
클릭을 가로채지 않도록 처리(래퍼의 `pointer-events: none` + Svelte가
outro 요소에 거는 `inert`와 함께 3중 안전장치).

`prefers-reduced-motion: reduce`면 duration 0, hover 모션도 CSS로
제거.

## 3. 삭제 팝업 위험 강조

카드 전체를 위험색으로 물들임: 배경 `color-mix(danger-soft 62%,
surface)`, 보더 `color-mix(danger 34%, border)`(꼬리도 함께). 버튼은
회색 텍스트에서 휴지통 아이콘(인라인 SVG(Scalable Vector Graphics)) +
`var(--danger)` 텍스트로 교체, hover 시 danger 틴트 배경 적용.

## 4. 재드래그해도 삭제 팝업이 안 뜨던 버그

기존 판정(`findReselectedHighlights` in `PdfViewer.svelte`)은 **면적
비율**(겹친 넓이 / 새 선택 넓이 ≥ 0.9)로 "재선택 = 지우기" 판단.
면적에는 세로 높이가 그대로 곱해지는데, 새로 드래그한 선택의 rect는
pdf.js 텍스트 레이어 span의 **줄 상자 전체 높이**(행간 포함)인 반면
저장된 하이라이트 rect는 글자 높이에 가깝게 저장된 경우 다수(특히
Zotero 데스크톱에서 칠한 것, 다른 배율에서 만들어져 반올림된 것). 그래서
가로로 100% 같은 구간을 다시 드래그해도 비율이 0.5~0.7로 떨어져
threshold 0.9 미달 — 사람이 정확히 같은 픽셀을 다시 못 짚는 오차까지
더해져 사실상 통과 불가능한 조건.

**해결**: `web/src/utils/pdf-highlight.js`에 `coveredWidthRatio(rect,
others)` 추가. 세로는 "같은 줄인가"만 확인(겹침이 낮은 쪽 높이의 50%
초과), 실제 판정은 **가로 구간 합집합 길이 / 새 선택 rect 폭**으로
처리(합집합이라 여러 하이라이트에 걸쳐도 중복 계산 없음). threshold는
`0.9`에서 `0.8`로 조정. "부분 겹침이면 새 하이라이트로 취급"이라는
원래 의도(다른/더 넓은 범위를 실수로 지우지 않기)는 유지 — 더 이상
안 쓰는 `rectArea`/`rectOverlapArea`는 제거.

## 5. 칠하기 딜레이 — 낙관적 UI(User Interface) 업데이트

기존 `createHighlight()`는 Zotero API 왕복을 `await`한 뒤에야
`highlights` state에 추가돼 화면에 표시. 색상 버튼을 누르고 서버
응답을 기다리는 동안 반응 없음으로 체감.

**해결**: 색상 클릭 즉시 `pending:<n>` 임시 key로 하이라이트를
`highlights`에 넣어 바로 칠해지게 하고, `api.createHighlight`는
백그라운드로 처리.
- 성공하면 서버가 준 실제 key로 교체.
- 실패하면 임시 항목을 제거하고 `showHighlightError`로 에러 표시.
- 페이지에 걸친 선택(items 여러 개)은 각각 독립 처리 — 하나 실패해도
  나머지는 유지.
- 저장 완료 전 다른 논문으로 이동한 경우 결과 폐기.
- 삭제(`removeHighlight`)도 같은 패턴(먼저 화면에서 지우고 실패한
  것만 복원)으로 통일.
- 응답을 기다리며 상호작용을 묶던 `highlightBusy`는 더 이상 불필요해
  제거.

### 후속 버그: 저장 중(pending) 하이라이트 클릭 시 삭제 팝업 미표시

처음엔 "서버에 없는 key로 DELETE가 나가는 것"을 막으려고
`findHighlightAt`/`findReselectedHighlights`에서 pending 항목을 아예
제외했는데, 해당 조치의 부작용으로 칠한 직후(저장이 안 끝난 순간)
클릭해도 삭제 확인 팝업 자체가 미표시.

**해결**: 판정에서는 pending을 더 이상 제외하지 않음 — 클릭/재드래그
즉시 삭제 팝업 표시. 대신 실제 삭제(`deleteHighlightWhenSaved()`)에서,
대상이 아직 pending이면 `pendingCreations` 맵에 보관해둔 저장
Promise를 기다렸다가 **서버가 준 실제 key로** DELETE 전송. 저장
자체가 실패한 경우 항목이 이미 화면에서 사라진 뒤이므로 별도 처리
없음.

## 6. 빠르게 칠하기 — 마지막 색상 기억 + 즉시 적용

**동작**: 기본은 원래대로 드래그 후 팔레트가 뜨고 색을 골라야 칠해지는
방식. `Alt`(맥 `Option`)를 누른 채 드래그를 마치면 팔레트 없이
**마지막으로 쓴 색**으로 즉시 칠해짐. 마지막 색이 아직 없으면(첫 사용)
Alt를 눌러도 팔레트 표시.

- 트리거를 pointerup 시점의 수식 키로 고른 이유: Folio 코드베이스의
  하이라이트 상호작용은 전부 `onViewerPointerUp` 한 곳으로 모여 있어서
  해당 함수 내부에서 읽을 수 있는 수식 키가 기존 팝업/링크 처리
  로직을 건드리지 않고 가장 자연스럽게 얹힘. 우클릭은 pdf.js 텍스트
  레이어의 기본 컨텍스트 메뉴와 충돌, 길게 누르기는 새 타이머 상태가
  필요해 배제.
- 처음엔 반대로(수식 키 없이 기본 즉시 적용, Alt로 팔레트 강제 호출)
  구현했으나, **드래그로 텍스트를 복사 등 다른 목적으로 선택할 때도
  의도치 않게 칠해지는** 문제가 있어 트리거 반전 — 기본은 항상
  팔레트(부작용 없음), 즉시 적용은 명시적 Alt+드래그일 때만.
- 마지막 색은 `localStorage`(`folio:lastHighlightColor`)에 저장해
  브라우저를 다시 열어도 유지. 저장된 값이
  HIGHLIGHT_COLORS(Allowed Color List) 상수에 없는 색이면 무시하고
  팔레트 표시.
- 재드래그(기존 하이라이트 겹쳐 선택) 판정은 Alt 여부와 무관하게 항상
  우선 — 즉시 칠하기가 삭제 확인을 덮어쓰지 않음.
- 안내 문구: 색상 팔레트 스와치 줄 아래에 작게
  `Alt(Option)+드래그로 마지막 색 바로 칠하기` 표시. **첫 사용(마지막
  색 없음)일 때는 숨김** — 첫 사용 시점엔 안내해도 쓸 수 없기 때문.
  삭제 확인 팝업에는 안내 미포함. 플랫폼 표기(Alt/Option)는
  PdfViewer.svelte에 이미 있던 `navigator.userAgentData?.platform ||
  navigator.platform || navigator.userAgent` 판정을 그대로 사용.

## 파일별 책임

- `web/src/components/PdfViewer.svelte`
  - 팝업 상태(`colorPopup`/`deletePopup`/`activePopup`/`popupView`),
    `popupIn`/`popupOut`(`popupMotion`), 위험 강조/안내 문구 마크업.
  - `onViewerPointerUp`(재드래그 삭제 판정, Alt+드래그 즉시 칠하기 분기),
    `createHighlight`/`removeHighlight`(낙관적 업데이트),
    `deleteHighlightWhenSaved`(pending 삭제 대기), `pendingCreations`.
- `web/src/utils/pdf-highlight.js`
  - `coveredWidthRatio()` — 재선택=지우기 판정용 가로 겹침 비율 계산.
