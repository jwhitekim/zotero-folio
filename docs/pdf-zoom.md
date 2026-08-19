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
3. **가로는 항상 중앙 — `.pdf-pages` 자체의 width를 매 렌더마다 콘텐츠
   폭에 맞춰 직접 못박는다.** `.pdf-viewer`가 `min(100%, 900px)`로 폭을
   캡해두고 그 안에서 `.pdf-pages`가 `width:100%` + flex로 페이지를
   넘치게(overflow) 배치하던 이전 방식은, 확대해도 `.pdf-pages` 자신의
   폭은 그대로 900px에 머물러 있고 자식만 넘쳐서 `.pdf-scroll`의
   스크롤 가능 영역이 실제로 커진다는 보장이 없었다(브라우저가 flex
   자식의 overflow를 스크롤 영역에 얼마나 정확히 반영하는지에 기대는
   방식이라 취약함 — 실제로 확대해도 폭이 안 넓어져 좌우가 스크롤로
   안 닿고 잘리는 버그로 나타났다. 아래 "실패했던 접근" 참고).
   지금은 `render()`가 각 페이지의 실제 뷰포트 폭을 계산한 뒤
   `container.style.width = Math.max(availableWidth, maxPageWidth) + 'px'`로
   `.pdf-pages`의 width를 직접 설정한다 — `.pdf-scroll`의 scrollWidth는
   이 값을 그대로 반영할 수밖에 없어 항상 정확하다. 시각적 중앙 정렬은
   `.pdf-pages { margin: 0 auto }`(폭이 맞으면 정중앙, 넘치면 왼쪽
   flush + 오른쪽으로만 overflow — 어느 브라우저에서나 안전하게 스크롤로
   닿음) + `onLayoutReady`가 재확정하는 `scrollLeft =
   (scrollWidth - clientWidth) / 2`가 함께 맞춘다.
4. **무거운 재렌더링은 debounce, 가벼운 시각 피드백은 CSS.** wheel 이벤트마다
   pdf.js 캔버스를 다시 그리지 않는다. `zoom` prop이 바뀌면 즉시
   `transform: scale(zoom / renderedZoom)`으로 미리보기만 보여주고, 실제
   `render()`(캔버스+텍스트 레이어 재생성)는 스크롤이 150ms 멈춘 뒤 한 번만 한다.
5. **재렌더링은 2단계로 나눈다: 레이아웃 먼저, 그리기는 나중.** 모든 페이지의
   크기(`pageWrap` width/height)를 먼저 계산해 배치를 확정한 뒤에 캔버스를
   그린다. 컨테이너를 비웠다가 다시 채우는 순간이 없어야 브라우저가
   `scrollTop`을 0으로 되돌리는 일이 없다(빈 컨테이너 = 스크롤 가능 영역 붕괴).
6. **`.pdf-scroll`에 `scrollbar-gutter: stable`을 걸어둔다.** Windows는
   세로 스크롤바가 레이아웃 폭을 15~17px 차지하는 클래식 스크롤바라서,
   확대로 페이지가 뷰포트보다 길어져 스크롤바가 막 나타나는 순간
   `.pdf-scroll`의 `clientWidth`가 갑자기 줄어들고, 그 직후 `render()`가
   좁아진 `availableWidth` 기준으로 다시 중앙정렬하면서 콘텐츠가 오른쪽으로
   밀리는 것처럼 보인다 — 맥은 오버레이 스크롤바라 폭을 차지하지 않아 이
   현상 자체가 없었다. `stable`로 스크롤바가 실제로 나타나든 안 나타나든
   그 공간을 항상 미리 비워둬서 폭이 흔들리지 않게 한다.

## 실패했던 접근 (기록)

- **origin을 커서 위치로 매번 이동**: MDN 공식으로는 동치지만, scale이 이미
  걸린 상태에서 origin이 바뀌면 시각적으로 튄다 → 사용자가 "흔들린다"고 보고.
- **컨테이너를 먼저 비우고(`replaceChildren()`) 나중에 채우기**: 비는 순간
  스크롤 영역이 사라져 브라우저가 `scrollTop`을 0으로 강제 리셋 → "1페이지
  상단으로 튕김" 버그의 근본 원인이었다. 2단계 레이아웃-먼저 방식으로 해결.
- **재렌더링 완료 후에만 스크롤 위치 복원**: 여러 페이지짜리 PDF는 재렌더링에
  시간이 걸려서 그동안 위치가 안 맞는 상태로 보임 → 사실상 체감 해결이 안 됨.
- **`align-items: unsafe/safe center`로 flex overflow 방향만 조정**: 맥에서
  확대하면 좌우 중 한쪽(대개 왼쪽)이 스크롤로 안 닿고 잘리는 버그가 나서,
  처음엔 `unsafe`를 빼고 plain `center`(safe, overflow 시 왼쪽 정렬로
  fallback)로 되돌려 여분 너비가 항상 오른쪽에만 생기게 해보았다 → 재배포
  후에도 동일하게 재현됨. `.pdf-pages` 자신의 width가 여전히 `.pdf-viewer`의
  900px 캡에 고정된 채였고(확대해도 안 넓어짐), align-items가 어느 방향으로
  overflow를 만들든 "컨테이너 폭 자체가 안 늘어난다"는 진짜 원인은
  건드리지 못했던 것 — 근본 원인 오진이었다. `.pdf-pages`의 width를
  render()에서 콘텐츠 폭에 맞춰 직접 설정하는 지금 방식으로 교체해 해결.

## 파일별 책임

- `web/src/pages/PaperDetailSplit.svelte`
  - `pdfZoom` state, `zoomTo()`(커서 기준 scrollTop 즉시 보정), `onPdfWheel()`,
    `onPdfLayoutReady()`(가로 재중앙정렬).
- `web/src/components/PdfViewer.svelte`
  - `zoom` prop → `renderedZoom`(실제로 그려진 배율) 대비 비율로 CSS 확대 미리보기.
  - `render()`: 2단계(레이아웃 확정 → 페인트) + debounce된 재호출.
