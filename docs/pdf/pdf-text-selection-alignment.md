# PDF 텍스트 선택 하이라이트 가로 정렬

Windows의 125%/150% 디스플레이 배율에서 PDF 본문을 드래그 선택할 때,
선택 하이라이트가 캔버스에 그려진 글자보다 오른쪽으로 밀리는 문제의 조사 내용과
Folio 측 보정 방식 기록.

## 증상

- 세로 위치와 높이는 정상, 가로 위치/폭만 어긋남.
- 선택 박스가 글자보다 오른쪽으로 길게 나타남.
- 한 텍스트 조각 안에서 오른쪽으로 갈수록 오차 누적.
- 특정 PDF에 한정되지 않고 여러 논문에서 재현.
- Windows 디스플레이 배율 125%(`devicePixelRatio ≈ 1.25`)와
  150%(`devicePixelRatio ≈ 1.5`)에서 두드러짐.

## pdf.js의 관련 동작

PDF 본문 표시 레이어 2종:

1. `canvasWrapper > canvas`: 사용자가 보는 실제 PDF 글자
2. `.textLayer span`: 복사와 선택을 담당하는 투명한 DOM(Document Object Model) 글자

pdf.js 6.2.108의 `TextLayer`는 여러 글자로 된 span마다 다음 보정 수행.

1. PDF 텍스트 항목의 목표 폭(`item.width`) 확인.
2. `<body>`에 붙인 hidden canvas에서 `measureText()`로 DOM 글자의 예상 폭 측정.
3. `목표 폭 / 측정 폭`을 인라인 CSS 변수 `--scale-x`에 기록.
4. 텍스트 span에 `scaleX(var(--scale-x))` 적용.

문제 지점: hidden canvas 측정 크기에 `devicePixelRatio`를 곱하지만, 결과가 적용되는
DOM 레이아웃은 CSS px 좌표계. Windows DirectWrite의 글꼴 힌팅과 fractional pixel
반올림 때문에 1.25배/1.5배 크기에서 잰 폭을 다시 나눈 값이 실제 CSS 크기의 DOM
글자 폭과 정확히 일치하지 않는 경우 발생. span의 왼쪽을 기준으로 작은 폭 오차가
적용되므로 오른쪽으로 갈수록 어긋남 확대.

관련 upstream 이슈 목록:

- [mozilla/pdf.js#20017](https://github.com/mozilla/pdf.js/issues/20017) — 캔버스와
  텍스트 span의 높이는 맞지만 폭이 달라 선택/검색 영역이 밀리는 미해결 이슈
- [mozilla/pdf.js#21259](https://github.com/mozilla/pdf.js/issues/21259) — hidden
  canvas와 DOM span의 측정 조건이 다르면 `--scale-x`가 틀어진다는 확인 사례
- [mozilla/pdf.js#21578](https://github.com/mozilla/pdf.js/issues/21578) — hidden
  canvas의 상태와 캐시가 어긋나 잘못된 `--scale-x`가 만들어지는 별도 사례

2026-09-02 기준 Folio는 `pdfjs-dist` 6.2.108 사용. 최신 6.3.289도
선택 영역 계산부와 TextLayer의 DPR(Device Pixel Ratio) 측정 방식을 그대로 사용하므로, 단순 버전
업데이트로 증상 해결 근거 없음.

## 확인했거나 배제한 가설

| 가설/시도 | 결과 |
| --- | --- |
| Folio가 텍스트 위치를 직접 계산해서 발생 | 배제. 위치와 기본 `--scale-x`는 pdf.js가 생성. |
| 특정 논문의 미임베드 폰트 문제 | 배제. 조사 대상 논문의 사용 폰트는 모두 임베드 상태이고 여러 PDF에서 공통 재현. |
| 과거 OffscreenCanvas 로케일 문제 | 배제. pdfjs-dist 6.2.108에 `canvas.lang` 처리 반영 확인. |
| `.pdfViewer`에 항상 남던 `transform: scale(1)` | `5060dd8`에서 휴지 상태 transform 제거, Windows 재현 결과 변화 없음. |
| 모든 span의 `--scale-x`를 1로 고정 | `f19d3b6`에서 시도, 더 크게 어긋남 확인. PDF가 요구한 원래 글자 폭까지 없애는 방식이라 실패, 현재 코드에서는 제거. |
| pdfjs-dist 6.3.289로 단순 업데이트 | 6.2.108과 선택 렌더러의 관련 구현 대조, 증상을 고치는 변경 없음 확인. |

## Folio의 해결 방식

`PdfViewer.svelte`는 pdf.js의 `textlayerrendered` 이벤트 뒤에 Windows
fractional DPI(Dots Per Inch) 환경에서만 텍스트 span의 가로 배율 재교정.

핵심 원칙: `--scale-x` 자체는 유지하고 분자·분모만 정확한 값으로 교체.

- 목표 폭: PDF 텍스트 항목의 `item.width × viewport.scale`
- 자연 폭: 실행 중인 브라우저가 실제 DOM span을 CSS 크기로 배치한 폭
- 새 `--scale-x`: `목표 폭 / 실제 DOM 자연 폭`

페이지 폭은 pdf.js가 기기 픽셀 경계에 맞춰 반올림하는 경우가 있어,
`textLayer 실제 폭 / viewport 폭`도 목표 폭에 곱함. 해당 보정으로 캔버스와
텍스트 레이어가 동일한 최종 페이지 폭 기준으로 정렬.

성능과 안전 범위:

- Windows이면서 `devicePixelRatio`가 정수가 아닐 때만 실행.
- 일반적인 가로쓰기이며 회전되지 않은 텍스트만 대상.
- PDF 텍스트 데이터는 페이지별 `WeakMap`에 캐시.
- 모든 style write 완료 후 모든 폭 read 수행, 이어서 모든 최종 style write 순서로 처리해
  페이지당 강제 레이아웃 횟수 절감.
- 중간의 `scaleX(1)`은 같은 JavaScript task 안에서 최종값으로 교체되므로
  화면 노출 없음(프레임 단위 미노출).
- 확대 중 레이어가 교체되면 오래된 비동기 작업의 결과 폐기.

### 실기기 확인 결과 "가끔은 맞고 가끔은 틀리는" 추가 원인: 폰트 로딩 경합

첫 수정 배포 후에도 간헐적 어긋남이 실기기 확인에서 발견. `pdf_viewer.mjs`의
`TextLayerBuilder.render()` 재확인 결과, 텍스트 레이어는 임베드 폰트
로딩을 전혀 기다리지 않고 `textlayerrendered`를 곧바로 발생. 반면 캔버스
렌더러(`pdf.mjs`)는 `await nativeFontFace.loaded`로 폰트가 완전히 로드된 뒤에
글자를 그리는 방식. 폰트 로딩이 늦게 끝나는 경우의 순서:

1. `textlayerrendered` 선(先)발생 — Folio의 재교정이 아직 대체 폰트로
   렌더된 span의 자연 폭을 측정, 잘못된 `--scale-x` 계산 결과 발생
2. 이후 실제 임베드 폰트로 캔버스 재렌더링 — 이미 확정된
   `--scale-x`는 대체 폰트 기준이라 실제 글자와 재차 어긋남

네트워크/디코딩 속도나 페이지 복잡도에 따라 폰트 로딩과 `textlayerrendered`의
순서가 매번 달라지므로 증상이 간헐적으로 나타나는 구조. 대응 방식: 표준
`document.fonts.ready` 프라미스 완료 후 같은 페이지를 한 번 더 재보정해서,
첫 시도가 폰트 로딩보다 먼저 일어난 경우에도 최종적으로는 실제 폰트 기준
값으로 덮어쓰도록 처리.

구현 위치: [`web/src/components/PdfViewer.svelte`](../web/src/components/PdfViewer.svelte)

## 검증 항목

자동 빌드만으로는 Windows 글꼴 rasterization 결과 검증 불가, 아래
실기기 확인 필요.

1. Windows 디스플레이 배율 100%, 125%, 150%에서 같은 문장 선택.
2. 각 배율에서 Folio 확대 100%, 115%, 150% 확인.
3. 문장 왼쪽, 가운데, 오른쪽의 선택 박스 경계와 글자 일치 여부 확인.
4. 텍스트 복사 결과가 이전과 동일한지 확인.
5. 참고문헌 링크 이동, `Alt+Left`, 패널 폭 조절 후에도 정렬 유지 여부 확인.
6. 회전된 페이지와 세로쓰기 PDF는 보정 대상에서 제외 상태 — 기존 동작에
   회귀가 없는지만 확인.
7. 페이지를 새로 열자마자(폰트 로딩이 아직 안 끝난 시점) 바로 드래그
   선택해서 어긋나는지, 잠시 대기 후 재선택 시 `document.fonts.ready`
   이후 재보정으로 정렬이 맞는지 확인 — 느린 네트워크(개발자 도구 스로틀링)
   조건에서 재현 용이.

## 남은 제한

- PDF 자체의 잘못된 glyph advance/텍스트 추출 폭은 Folio 측에서 복원 불가.
- 회전 텍스트와 세로쓰기는 축 변환이 달라 이번 보정 대상에서 제외.
- Windows 실기기에서 오차가 남는 경우, span별 `목표 폭`, `자연 폭`, 최종
  `--scale-x` 수집 후 DirectWrite 오차 외에 시작 좌표 오차 동반 여부
  분리 확인 필요.
