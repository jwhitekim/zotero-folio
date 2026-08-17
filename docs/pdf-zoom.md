# PDF 뷰어 스크롤 확대/축소 설계

`web/src/components/PdfViewer.svelte` + `web/src/pages/PaperDetailSplit.svelte`가
Ctrl/Cmd+스크롤 PDF 확대/축소를 구현하는 방식과, 그 근거가 된 참고 자료를 정리한다.

## 요구사항

- Ctrl/Cmd+스크롤로 확대/축소하면 **스크롤 중에도 즉시** 커지는 느낌이 나야 한다
  (debounce 끝날 때 한 번에 점프하면 안 됨).
- **세로**는 확대 전에 보던 위치(또는 커서가 가리키던 지점)가 화면상 같은 자리에
  남아있어야 한다.
- **가로**는 항상 중앙 정렬 — 커서를 따라 옆으로 쏠리면 안 된다.
- 확대할 때마다 무거운 pdf.js 캔버스 재렌더링이 매번 일어나면 안 되고, 재렌더링
  중에도 화면이 깜빡이거나 스크롤 위치가 날아가면 안 된다.

## 참고한 자료

- [mozilla/pdf.js#6474](https://github.com/mozilla/pdf.js/issues/6474) — "zoom with
  ctrl-scrollwheel zooms from top left, instead of about mouse cursor". 커서 위치
  기준으로 확대해야 자연스럽다는 논의(Inkscape/GIMP/Excel 등도 이 방식).
- [Fooocus `javascript/zoom.js`](https://huggingface.co/spaces/latif5/Fooocus/blob/main/javascript/zoom.js) —
  실제 오픈소스 구현체. `transform-origin: 0 0`을 **고정**해두고, 커서 위치는
  `panX/panY`(translate 보정값) 계산에만 쓴다:
  ```
  panX += mouseX - (mouseX * newZoom) / oldZoom
  panY += mouseY - (mouseY * newZoom) / oldZoom
  transform: translate(panX, panY) scale(newZoom)
  ```
- [MDN `transform-origin`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform-origin) —
  `transform-origin: X Y` + `scale(S)`는 수학적으로
  `transform-origin: 0 0` + `translate(X,Y) scale(S) translate(-X,-Y)`와 동치.
  즉 "origin을 커서로 옮기기"와 "origin은 고정하고 translate로 보정하기"는
  이론상 같은 결과지만, **origin을 매 틱마다 바꾸는 쪽은 실전에서 불안정하다** —
  이미 scale이 걸린 상태에서 origin이 바뀌면 브라우저가 그 지점 기준으로 다시
  계산하면서 화면이 튄다.

## 핵심 스펙 (지켜야 할 규칙)

1. **`transform-origin`은 절대 동적으로 바꾸지 않는다.** `PdfViewer.svelte`의
   `.pdf-pages`는 항상 `transform-origin: 50% 0` (상단 중앙) 고정.
2. **커서 앵커링은 origin이 아니라 스크롤 위치로 한다.** `zoomTo()`가 커서 Y좌표
   기준으로 `pdfScrollEl.scrollTop`을 매 wheel 이벤트마다 **즉시, 애니메이션 없이**
   보정한다. CSS 확대(`transform: scale`)와 같은 틱에서 함께 적용되므로 서로
   경쟁하는 애니메이션이 생기지 않는다.
3. **가로는 항상 중앙.** origin의 x축이 50%로 고정되어 있어 확대해도 대칭으로
   커지고, 실제 재렌더링이 끝나면(`onLayoutReady`) `scrollLeft`를
   `(scrollWidth - clientWidth) / 2`로 재확정한다.
4. **무거운 재렌더링은 debounce, 가벼운 시각 피드백은 CSS.** wheel 이벤트마다
   pdf.js 캔버스를 다시 그리지 않는다. `zoom` prop이 바뀌면 즉시
   `transform: scale(zoom / renderedZoom)`으로 미리보기만 보여주고, 실제
   `render()`(캔버스+텍스트 레이어 재생성)는 스크롤이 150ms 멈춘 뒤 한 번만 한다.
5. **재렌더링은 2단계로 나눈다: 레이아웃 먼저, 그리기는 나중.** 모든 페이지의
   크기(`pageWrap` width/height)를 먼저 계산해 배치를 확정한 뒤에 캔버스를
   그린다. 컨테이너를 비웠다가 다시 채우는 순간이 없어야 브라우저가
   `scrollTop`을 0으로 되돌리는 일이 없다(빈 컨테이너 = 스크롤 가능 영역 붕괴).

## 실패했던 접근 (기록)

- **origin을 커서 위치로 매번 이동**: MDN 공식으로는 동치지만, scale이 이미
  걸린 상태에서 origin이 바뀌면 시각적으로 튄다 → 사용자가 "흔들린다"고 보고.
- **컨테이너를 먼저 비우고(`replaceChildren()`) 나중에 채우기**: 비는 순간
  스크롤 영역이 사라져 브라우저가 `scrollTop`을 0으로 강제 리셋 → "1페이지
  상단으로 튕김" 버그의 근본 원인이었다. 2단계 레이아웃-먼저 방식으로 해결.
- **재렌더링 완료 후에만 스크롤 위치 복원**: 여러 페이지짜리 PDF는 재렌더링에
  시간이 걸려서 그동안 위치가 안 맞는 상태로 보임 → 사실상 체감 해결이 안 됨.

## 파일별 책임

- `web/src/pages/PaperDetailSplit.svelte`
  - `pdfZoom` state, `zoomTo()`(커서 기준 scrollTop 즉시 보정), `onPdfWheel()`,
    `onPdfLayoutReady()`(가로 재중앙정렬).
- `web/src/components/PdfViewer.svelte`
  - `zoom` prop → `renderedZoom`(실제로 그려진 배율) 대비 비율로 CSS 확대 미리보기.
  - `render()`: 2단계(레이아웃 확정 → 페인트) + debounce된 재호출.
