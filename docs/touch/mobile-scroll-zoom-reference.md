# 모바일 사파리 부드러운 스크롤·핀치 — 레퍼런스 조사

관성 스크롤 추가(`touch-gestures.js`)와 핀치 확대 리페인트 수정 이후,
추가로 개선할 여지와 채택하지 않을 방향을 정리한 조사 기록.

## 1. 기존 관성 감쇠 계수의 근거 확인

`touch-gestures.js`의 관성 스크롤은 프레임당 속도에 `0.95`를 곱하는
지수 감쇠를 쓴다. 웹서치로 iOS 자체 스크롤 물리를 확인한 결과,
**iOS도 매 애니메이션 틱(16.7ms, 60fps 기준)마다 속도를 0.95배로
줄이는 방식**이라는 점이 확인됐다(시간 상수 약 325ms). 즉 지금 쓰는
계수가 임의값이 아니라 실제 iOS 기준값과 일치 — 추가 튜닝 없이 유지.

## 2. 채택 후보 — 러버밴드(rubber-band) 오버스크롤

현재 구현은 스크롤 경계(맨 위/맨 아래)에 닿으면 즉시 멈춘다. iOS
네이티브 스크롤은 경계를 넘어 당기면 저항을 받으며 조금 더 밀리다가
튕겨 돌아오는 "러버밴드" 효과가 있고, 이게 "네이티브스러움"의 상당
부분을 차지한다는 게 여러 자료에서 공통적으로 지적됨.

공식 계산식(iOS `UIScrollView` 참고 구현):

```
resistance = (dist * c * dim) / (c * dim + dist)
```

`dist`는 경계를 넘어 당긴 거리, `dim`은 스크롤 컨테이너 크기, `c`는
저항 계수(iOS 참고값 0.55) — 값이 커질수록 당긴 거리가 뷰포트 크기에
점근적으로 수렴해 "무거워지는" 느낌 부여.

**적용 여부는 별도 판단 필요** — 지금 문제(끊김)는 이미 해결됐고, 이
효과는 "더 자연스럽게" 다듬는 차원의 추가 작업이라 우선순위는 사용자
판단.

## 3. 검토했으나 채택하지 않는 방향 — `visualViewport` 기반 네이티브 핀치

브라우저의 실제 네이티브 핀치 줌(뷰포트 전체 확대)을 막지 않고, 대신
`visualViewport`의 `scale`/`resize`/`scroll` 이벤트를 관찰해서 그
배율에 맞춰 캔버스 재렌더링만 따라가는 방식도 조사함 — 관성·저항
물리를 브라우저가 전부 대신 해주므로 이론적으로는 가장 매끄러움.

**채택 불가 이유**: `visualViewport` 기반 핀치 줌은 **뷰포트(페이지 전체) 단위로만
동작**하고 특정 요소(원문 패널)로 범위를 좁힐 수 없음 — Folio의 분할뷰
(원문 패널 + 메모 패널)에 적용하면 핀치 시 페이지 전체(툴바·메모
패널 포함)가 함께 확대되어 레이아웃이 깨짐. 원문 패널 단위로 확대
범위를 가두려면 지금처럼 `touch-action: none` + 커스텀 포인터 이벤트
방식이 필요하다는 기존 결론([pdf-touch-pinch-zoom.md](pdf-touch-pinch-zoom.md))이
다시 확인됨.

## 4. `touch-action` 관련 재확인

기존 조사([pdf-touch-pinch-zoom.md](pdf-touch-pinch-zoom.md))의 결론과
동일 — iOS Safari에서 `pan-x pan-y`/`pinch-zoom` 같은 세분화된 값은
표준·구현이 불안정해 신뢰 불가, `touch-action: none` + 전체 커스텀
구현이 유일하게 일관된 방식이라는 점 재확인.

## 참고 자료

- [Physics of Momentum Scrolling — Alexey Komov](https://alexeykomov.me/blog/momentum-scrolling/)
- [Six Things I Learned About iOS Safari's Rubber-Band Scrolling](https://www.specialagentsqueaky.com/blog/six-things-i-learnt-about-ios-rubberband-overflow-scrolling/)
- [Elastic Overflow Scrolling — CSS-Tricks](https://css-tricks.com/elastic-overflow-scrolling/)
- [VisualViewport — MDN(Mozilla Developer Network)](https://developer.mozilla.org/docs/Web/API/VisualViewport)
- [Web App Multi-touch is Complicated — Matt Joseph](https://mattj.io/posts/2019-03-08-web-app-multi-touch-is-complicated/)

## 관련 문서

- [pdf-touch-pinch-zoom.md](pdf-touch-pinch-zoom.md)
- [tablet-touch-ux-ideas.md](tablet-touch-ux-ideas.md)
