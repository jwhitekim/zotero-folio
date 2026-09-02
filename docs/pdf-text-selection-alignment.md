# PDF 텍스트 선택 하이라이트 가로 정렬

Windows의 125%/150% 디스플레이 배율에서 PDF 본문을 드래그 선택할 때,
선택 하이라이트가 캔버스에 그려진 글자보다 오른쪽으로 밀리는 문제의 조사와
Folio 측 보정 방식을 기록한다.

## 증상

- 세로 위치와 높이는 정상이고 가로 위치/폭만 어긋난다.
- 선택 박스가 글자보다 오른쪽으로 길게 나타난다.
- 한 텍스트 조각 안에서 오른쪽으로 갈수록 오차가 누적된다.
- 특정 PDF에 한정되지 않고 여러 논문에서 재현된다.
- Windows 디스플레이 배율 125%(`devicePixelRatio ≈ 1.25`)와
  150%(`devicePixelRatio ≈ 1.5`)에서 두드러진다.

## pdf.js의 관련 동작

PDF 본문은 두 레이어로 표시된다.

1. `canvasWrapper > canvas`: 사용자가 보는 실제 PDF 글자
2. `.textLayer span`: 복사와 선택을 담당하는 투명한 DOM 글자

pdf.js 6.2.108의 `TextLayer`는 여러 글자로 된 span마다 다음 보정을 한다.

1. PDF 텍스트 항목의 목표 폭(`item.width`)을 읽는다.
2. `<body>`에 붙인 hidden canvas에서 `measureText()`로 DOM 글자의 예상 폭을 잰다.
3. `목표 폭 / 측정 폭`을 인라인 CSS 변수 `--scale-x`에 기록한다.
4. 텍스트 span에 `scaleX(var(--scale-x))`를 적용한다.

문제는 hidden canvas 측정 크기에 `devicePixelRatio`를 곱하지만, 결과가 적용되는
DOM 레이아웃은 CSS px 좌표계라는 점이다. Windows DirectWrite의 글꼴 힌팅과
fractional pixel 반올림 때문에 1.25배/1.5배 크기에서 잰 폭을 다시 나눈 값이
실제 CSS 크기의 DOM 글자 폭과 정확히 일치하지 않을 수 있다. span의 왼쪽을
기준으로 작은 폭 오차가 적용되므로 오른쪽으로 갈수록 어긋남이 커진다.

이 계열의 upstream 이슈:

- [mozilla/pdf.js#20017](https://github.com/mozilla/pdf.js/issues/20017) — 캔버스와
  텍스트 span의 높이는 맞지만 폭이 달라 선택/검색 영역이 밀리는 미해결 이슈
- [mozilla/pdf.js#21259](https://github.com/mozilla/pdf.js/issues/21259) — hidden
  canvas와 DOM span의 측정 조건이 다르면 `--scale-x`가 틀어진다는 확인 사례
- [mozilla/pdf.js#21578](https://github.com/mozilla/pdf.js/issues/21578) — hidden
  canvas의 상태와 캐시가 어긋나 잘못된 `--scale-x`가 만들어지는 별도 사례

2026-09-02 기준 Folio는 `pdfjs-dist` 6.2.108을 사용한다. 최신 6.3.289도
선택 영역 계산부와 TextLayer의 DPR 측정 방식을 그대로 사용하므로, 단순 버전
업데이트만으로 이 문제를 해결할 근거는 없다.

## 확인했거나 배제한 가설

| 가설/시도 | 결과 |
| --- | --- |
| Folio가 텍스트 위치를 직접 계산해서 발생 | 배제. 위치와 기본 `--scale-x`는 pdf.js가 생성한다. |
| 특정 논문의 미임베드 폰트 문제 | 배제. 조사한 논문의 사용 폰트는 모두 임베드돼 있고 여러 PDF에서 공통 재현된다. |
| 과거 OffscreenCanvas 로케일 문제 | 배제. pdfjs-dist 6.2.108에 `canvas.lang` 처리가 반영돼 있다. |
| `.pdfViewer`에 항상 남던 `transform: scale(1)` | `5060dd8`에서 휴지 상태 transform을 제거했지만 Windows 재현 결과 변화가 없었다. |
| 모든 span의 `--scale-x`를 1로 고정 | `f19d3b6`에서 시도했으나 더 크게 어긋났다. PDF가 요구한 원래 글자 폭까지 없애는 방식이라 실패했다. 현재 코드에서는 제거했다. |
| pdfjs-dist 6.3.289로 단순 업데이트 | 6.2.108과 선택 렌더러의 관련 구현을 대조했지만 이 증상을 고치는 변경은 없었다. |

## Folio의 해결 방식

`PdfViewer.svelte`는 pdf.js의 `textlayerrendered` 이벤트 뒤에 Windows
fractional DPI 환경에서만 텍스트 span의 가로 배율을 재교정한다.

핵심은 `--scale-x`를 없애지 않고 분자와 분모를 올바르게 유지하는 것이다.

- 목표 폭: PDF 텍스트 항목의 `item.width × viewport.scale`
- 자연 폭: 해당 브라우저가 실제 DOM span을 CSS 크기로 배치한 폭
- 새 `--scale-x`: `목표 폭 / 실제 DOM 자연 폭`

페이지 폭은 pdf.js가 기기 픽셀 경계에 맞춰 반올림할 수 있으므로,
`textLayer 실제 폭 / viewport 폭`도 목표 폭에 곱한다. 이렇게 하면 캔버스와
텍스트 레이어가 같은 최종 페이지 폭을 기준으로 한다.

성능과 안전 범위:

- Windows이면서 `devicePixelRatio`가 정수가 아닐 때만 실행한다.
- 일반적인 가로쓰기이며 회전되지 않은 텍스트만 보정한다.
- PDF 텍스트 데이터는 페이지별 `WeakMap`에 캐시한다.
- 모든 style write → 모든 폭 read → 모든 최종 style write 순서로 처리해
  페이지당 강제 레이아웃 횟수를 줄인다.
- 중간의 `scaleX(1)`은 같은 JavaScript task 안에서 최종값으로 교체되므로
  화면에 한 프레임 노출되지 않는다.
- 확대 중 레이어가 교체되면 오래된 비동기 작업의 결과를 폐기한다.

구현 위치: [`web/src/components/PdfViewer.svelte`](../web/src/components/PdfViewer.svelte)

## 검증 항목

자동 빌드만으로 Windows 글꼴 rasterization 결과를 검증할 수 없으므로 아래
실기기 확인을 완료해야 한다.

1. Windows 디스플레이 배율 100%, 125%, 150%에서 같은 문장을 선택한다.
2. 각 배율에서 Folio 확대 100%, 115%, 150%를 확인한다.
3. 문장 왼쪽, 가운데, 오른쪽의 선택 박스 경계가 글자와 일치하는지 본다.
4. 텍스트 복사 결과가 이전과 같은지 확인한다.
5. 참고문헌 링크 이동, `Alt+Left`, 패널 폭 조절 후에도 정렬이 유지되는지 본다.
6. 회전된 페이지와 세로쓰기 PDF는 보정 대상에서 제외되므로 기존 동작에
   회귀가 없는지만 확인한다.

## 남은 제한

- PDF 자체의 잘못된 glyph advance/텍스트 추출 폭은 Folio에서 복원할 수 없다.
- 회전 텍스트와 세로쓰기는 축 변환이 다르므로 이번 보정에서 제외한다.
- Windows 실기기에서 오차가 남으면 span별 `목표 폭`, `자연 폭`, 최종
  `--scale-x`를 수집해 DirectWrite 오차 외에 시작 좌표 오차가 함께 있는지
  분리해야 한다.
