# PDF 뷰어 스크롤 확대/축소 설계

`web/src/components/PdfViewer.svelte` + `web/src/pages/PaperDetailSplit.svelte`의
Ctrl/Cmd+스크롤 PDF 확대/축소 구현 방식과 근거 자료 정리.

## 요구사항

- Ctrl/Cmd+스크롤 확대/축소 시 **스크롤 중에도 즉시** 커지는 느낌 필요
  (debounce 종료 시점에 한 번에 점프하는 방식은 배제).
- **세로**: 확대 전 위치(또는 커서가 가리키던 지점)가 화면상 같은 좌표 유지 필요.
- **가로**: 항상 중앙 정렬 — 커서를 따라 옆으로 쏠리는 동작 배제.
- 확대 시마다 무거운 pdf.js 캔버스 재렌더링 발생 배제, 재렌더링 중 화면 깜빡임이나
  스크롤 위치 소실도 배제.

## 참고 자료

- [mozilla/pdf.js#6474](https://github.com/mozilla/pdf.js/issues/6474) — "zoom with
  ctrl-scrollwheel zooms from top left, instead of about mouse cursor". 커서 위치
  기준 확대의 자연스러움에 관한 논의(Inkscape, GIMP(Free Image Editor),
  Excel 등도 동일 방식 채택).
- [Fooocus `javascript/zoom.js`](https://huggingface.co/spaces/latif5/Fooocus/blob/main/javascript/zoom.js) —
  실제 오픈소스 구현체. `transform-origin: 0 0` **고정**, 커서 위치는
  `panX/panY`(translate 보정값) 계산에만 사용:
  ```
  panX += mouseX - (mouseX * newZoom) / oldZoom
  panY += mouseY - (mouseY * newZoom) / oldZoom
  transform: translate(panX, panY) scale(newZoom)
  ```
- [MDN(Mozilla Developer Network) `transform-origin`](https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/transform-origin) —
  `transform-origin: X Y` + `scale(S)`는 수학적으로
  `transform-origin: 0 0` + `translate(X,Y) scale(S) translate(-X,-Y)`와 동치.
  즉 "origin을 커서로 옮기는 방식"과 "origin 고정 후 translate로 보정하는 방식"은
  이론상 동일 결과이나, **origin을 매 틱마다 바꾸는 방식은 실전에서 불안정** —
  scale이 이미 걸린 상태에서 origin 변경 시 브라우저가 변경된 지점 기준으로
  재계산하면서 화면 튐 발생.

## 핵심 스펙 (지켜야 할 규칙)

1. **`transform-origin`은 동적 변경 배제.** `PdfViewer.svelte`의
   `.pdf-pages`는 항상 `transform-origin: 50% 0`(상단 중앙) 고정.
2. **커서 앵커링은 origin이 아니라 스크롤 위치로 처리.** `zoomTo()`가 커서 Y좌표
   기준으로 `pdfScrollEl.scrollTop`을 매 wheel 이벤트마다 **즉시, 애니메이션 없이**
   보정. CSS 확대(`transform: scale`)와 같은 틱에서 함께 적용되므로 경쟁하는
   애니메이션 발생 없음.
3. **가로는 항상 중앙 — `.pdf-pages` 자체 width를 매 렌더마다 콘텐츠
   폭에 맞춰 직접 고정.** `.pdf-viewer`가 `min(100%, 900px)`로 폭을
   캡해두고 `.pdf-viewer` 내부에서 `.pdf-pages`가 `width:100%` + flex로 페이지를
   넘치게(overflow) 배치하던 이전 방식은, 확대해도 `.pdf-pages` 자체
   폭은 900px 고정 상태로 자식만 넘쳐서 `.pdf-scroll`의
   스크롤 가능 영역이 실제로 커진다는 보장 없음(브라우저의 flex
   자식 overflow 반영 정확도 의존이라 취약 — 실제로 확대해도 폭이 안 넓어져
   좌우가 스크롤로 안 닿고 잘리는 버그로 확인. 아래 "실패했던 접근" 참고).
   현재는 `render()`가 각 페이지의 실제 뷰포트 폭을 계산한 뒤
   `container.style.width = Math.max(availableWidth, maxPageWidth) + 'px'`로
   `.pdf-pages`의 width를 직접 설정 — `.pdf-scroll`의 scrollWidth는
   설정된 값을 그대로 반영해 항상 정확함. 시각적 중앙 정렬은
   `.pdf-pages { margin: 0 auto }`(폭이 맞으면 정중앙, 넘치면 왼쪽
   flush + 오른쪽으로만 overflow — 모든 브라우저에서 안전하게 스크롤로
   도달 가능) + `onLayoutReady`가 재확정하는 `scrollLeft =
   (scrollWidth - clientWidth) / 2`로 함께 조정.
4. **무거운 재렌더링은 debounce, 가벼운 시각 피드백은 CSS로 분리.** wheel 이벤트마다
   pdf.js 캔버스를 다시 그리는 방식은 배제. `zoom` prop 변경 시 즉시
   `transform: scale(zoom / renderedZoom)`으로 미리보기만 표시, 실제
   `render()`(캔버스+텍스트 레이어 재생성)는 스크롤 정지 150ms 후 1회만 실행.
5. **재렌더링은 2단계로 분리: 레이아웃 확정 우선, 그리기는 이후.** 모든 페이지의
   크기(`pageWrap` width/height)를 먼저 계산해 배치를 확정한 뒤에 캔버스
   렌더링. 컨테이너를 비웠다가 다시 채우는 시점을 없애 브라우저가
   `scrollTop`을 0으로 되돌리는 문제 배제(빈 컨테이너 = 스크롤 가능 영역 붕괴).
6. **`.pdf-scroll`에 `scrollbar-gutter: stable` 적용.** Windows는
   세로 스크롤바가 레이아웃 폭을 15~17px 차지하는 클래식 스크롤바라서,
   확대로 페이지가 뷰포트보다 길어져 스크롤바가 나타나는 순간
   `.pdf-scroll`의 `clientWidth`가 줄어들고, 직후 `render()`가
   좁아진 `availableWidth` 기준으로 재중앙정렬하면서 콘텐츠가 오른쪽으로
   밀리는 것처럼 보임 — 맥은 오버레이 스크롤바라 폭을 차지하지 않아 해당
   현상 없음. `stable` 설정으로 스크롤바 표시 여부와 무관하게
   해당 공간을 항상 미리 확보해 폭 흔들림 방지.

## 실패했던 접근 (기록)

- **origin을 커서 위치로 매번 이동**: MDN(Mozilla Developer Network) 공식으로는
  동치이나, scale이 이미 걸린 상태에서 origin 변경 시 시각적으로 튐 발생 —
  "흔들린다"는 사용자 보고로 확인.
- **컨테이너를 먼저 비우고(`replaceChildren()`) 나중에 채우기**: 비는 시점에
  스크롤 영역이 사라져 브라우저가 `scrollTop`을 0으로 강제 리셋 — "1페이지
  상단으로 튕김" 버그의 근본 원인. 2단계 레이아웃-우선 방식으로 해결.
- **재렌더링 완료 후에만 스크롤 위치 복원**: 여러 페이지짜리 PDF는 재렌더링에
  시간 소요로 그동안 위치가 안 맞는 상태로 노출 — 체감상 미해결에 가까움.
- **`align-items: unsafe/safe center`로 flex overflow 방향만 조정**: 맥에서
  확대 시 좌우 중 한쪽(대개 왼쪽)이 스크롤로 안 닿고 잘리는 버그 발생, 처음엔
  `unsafe`를 빼고 plain `center`(safe, overflow 시 왼쪽 정렬로 fallback)로
  되돌려 여분 너비가 항상 오른쪽에만 생기도록 시도 — 재배포 후에도 동일 재현.
  `.pdf-pages` 자체 width가 여전히 `.pdf-viewer`의 900px 캡에 고정된
  상태였고(확대해도 폭 그대로 유지), align-items가 어느 방향으로 overflow를
  만들든 "컨테이너 폭 자체가 안 늘어난다"는 실제 원인은 미해결 상태 —
  근본 원인 오진으로 확인. `.pdf-pages`의 width를 render()에서 콘텐츠
  폭에 맞춰 직접 설정하는 현재 방식으로 교체해 해결.

## 파일별 책임

- `web/src/pages/PaperDetailSplit.svelte`
  - `pdfZoom` state, `zoomTo()`(커서 기준 scrollTop 즉시 보정), `onPdfWheel()`,
    `onPdfLayoutReady()`(가로 재중앙정렬).
- `web/src/components/PdfViewer.svelte`
  - `zoom` prop을 `renderedZoom`(실제 그려진 배율) 대비 비율로 환산해 CSS 확대 미리보기.
  - `render()`: 2단계(레이아웃 확정 후 페인트) + debounce된 재호출.
