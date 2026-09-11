# PDF 터치 핀치 확대/축소 — touch-action 충돌 조사

태블릿 실기기 테스트에서 핀치 확대/축소가 "반대로 되거나 갑자기
튀는" 문제가 발생해 원인을 조사한 기록. `docs/tablet-touch-ux-ideas.md`
논의에서 이어지는 구현 시행착오.

## 증상 변화 (3차례 반복)

1. 1차: 반응이 느리고 버벅임 — pointermove마다 동기 `zoomTo()` 호출이
   원인. requestAnimationFrame 쓰로틀링으로 해결.
2. 2차: 버벅임은 해결됐으나 확대가 계단식으로 끊김 — 배율 반올림
   단위(1%)가 원인. 0.1% 단위로 낮춰 해결.
3. 3차: 확대/축소 방향이 반대로 되거나 갑자기 튀는 증상 발생 — 이
   문서가 다루는 문제.

## 원인

`.viewer-scroll`에 적용한 `touch-action: pan-x pan-y`의 실제 의미
오해가 원인. 해당 값은 "브라우저 네이티브 **핀치 확대만** 막고
**팬(스크롤)은 한 손가락이든 두 손가락이든 그대로 브라우저가 처리**"
하는 설정.

즉 두 손가락으로 핀치하는 동안 브라우저가 해당 손가락 움직임을 **팬
제스처로도 동시에 해석**해 스크롤 위치를 자체적으로 바꾸고, 같은
프레임에 Folio 측 JS(`zoomTo` 내부의 `scrollTop` 보정)도
스크롤 위치를 쓴다 — 둘이 같은 값을 서로 다르게 쓰려고 경합하면서
확대 방향이 뒤집히거나 위치가 튀는 것으로 관찰됨.

## 웹서치로 확인한 표준 동작 방식

- [MDN(Mozilla Developer Network) `touch-action`](https://developer.mozilla.org/docs/Web/CSS/touch-action):
  `pan-x pan-y`는 가로/세로 팬을 브라우저에 맡기고 핀치 확대만 막는
  값 — 팬 자체는 명시적으로 네이티브 처리 대상.
- [CSS-Tricks `touch-action`](https://css-tricks.com/almanac/properties/t/touch-action/):
  "완전한 커스텀 제어가 필요하면 `touch-action: none`을 쓰고, pan과
  pinch-zoom 로직을 포인터 이벤트로 직접 구현하는 것이 핵심 모범
  사례"라고 명시.
- [danburzo.ro의 DOM(Document Object Model) 제스처 정리](https://danburzo.ro/dom-gestures/):
  포인터 이벤트 기반 앱이 브라우저가 제스처 처리를 시작하는 순간
  `pointercancel`을 받게 되는 구조 — `touch-action`으로 브라우저에
  맡긴 제스처와 겹치면 우리 쪽 포인터 추적이 중간에 끊길 수 있음을
  확인.
- `pinch-zoom`이라는 별도 `touch-action` 키워드(팬은 네이티브,
  핀치만 커스텀 처리)가 논의된 적 있으나 [w3c/pointerevents
  이슈 #565](https://github.com/w3c/pointerevents/issues/565)에 따르면
  표준에서 빠졌고 Edge 정도만 지원 — 브라우저 간 신뢰 불가.

## 결론 및 다음 방향

`touch-action: pan-x pan-y`로 "핀치만 막고 팬은 네이티브에 맡기는"
절충은 표준상 지원되지 않아 우리 구현과 근본적으로 충돌.

표준이 권장하는 방식대로 `touch-action: none`으로 전환하고, 한
손가락 팬(스크롤)까지 포인터 이벤트로 직접 구현해 모든 터치 처리를
하나의 커스텀 로직으로 통일하는 방향이 유력.

## 관련 문서

- [tablet-touch-ux-ideas.md](tablet-touch-ux-ideas.md)
