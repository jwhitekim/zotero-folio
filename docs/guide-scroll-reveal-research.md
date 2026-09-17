# 가이드 페이지 등장 애니메이션 — 레퍼런스 조사

`/guide` 페이지 단계별 등장(스크롤 리빌) 애니메이션 구현 시 참고한 레퍼런스와
최종 선택 근거.

## 조사한 레퍼런스

- [Fading Up Sections Using Intersection Observer — DEV(Developer) Community](https://dev.to/jslim/fading-up-sections-using-intersection-observer-3fhj)
- [How to fade in content as it scrolls into view — DEV Community](https://dev.to/selbekk/how-to-fade-in-content-as-it-scrolls-into-view-10j4)
- [Animating blocks on scroll with Intersection Observer — Highrise Digital](https://highrise.digital/blog/animating-blocks-on-scroll-with-intersection-observer/)
- [Animate on scroll with the Intersection Observer API — Medium(Chris Gustin)](https://medium.com/@cgustin/animate-on-scroll-with-the-intersection-observer-api-ad368d91ebab)
- [CSS Scroll-Driven Animations Killed IntersectionObserver — thetalhatahir.com](https://www.thetalhatahir.com/blog/css-scroll-animations-killed-intersection-observer)
- [How to use Intersection Observer to fade in content with JS — Dalton Walsh](https://daltonwalsh.com/blog/using-the-intersection-observer/)

## 표준 패턴

레퍼런스 공통 구조:

```css
.item {
  opacity: 0;
  transform: translateY(50px);
  transition: opacity 1s, transform 1s; /* 기본(숨김) 상태에 transition 선언 */
}
.item.in-view {
  opacity: 1;
  transform: translateY(0); /* 최종 상태는 값만 덮어씀, transition 재선언 없음 */
}
```

```js
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in-view');
      observer.unobserve(entry.target); // 1회성 리빌
    }
  });
});
document.querySelectorAll('.item').forEach((el) => observer.observe(el));
```

핵심: **`transition`은 숨김(기본) 상태에 선언, 보임 상태는 값만 변경.**
두 상태에 `transition`을 나눠 선언하면 클래스 전환 방향에 따라 애니메이션
미재생 위험 — zotero-insight 프로젝트에서 실제로 발생한 버그(2026-09-17,
`.motion-pending`에만 `transition` 선언)와 원인 일치.

## 대안 검토: CSS `animation-timeline: view()` (Scroll-Driven Animations)

2024년 말 Baseline 등재된 네이티브 CSS 스크롤 연동 애니메이션 — 미채택.

- 장점: JS 불필요, 스크롤 위치 직접 연동, 메인 스레드 부담 없음.
- 단점(zotero-insight 실사례): `IntersectionObserver` 기반 JS 애니메이션과
  같은 요소에 동시 적용 시 두 시스템 경합, 새로고침마다 깜빡임 재현
  (2026-09-17 발견 후 네이티브 쪽 제거). 브라우저 지원도 Chromium 위주라
  Safari/Firefox용 별도 폴백 필요 — 복잡도만 증가.

## 최종 구현(`web/src/pages/GuidePage.svelte` + `app.css`)

- 클래스 1개(`is-visible`)만 토글 — 레퍼런스 `in-view` 패턴과 동일 구조.
- `transition`은 항상 적용되는 기본 규칙(`.motion-ready .steps > li`)에
  선언, 상태별 분산 선언 금지.
- `.motion-ready` 게이트 1개 추가 — 레퍼런스와의 의도적 차이점.
  `onMount` 실행 전 기본값을 "보임"으로 둬서, 스크립트 오류 발생 시에도
  콘텐츠 영구 비노출 위험 차단(안내 문서 특성상 폴백 중요도 높음).
- `IntersectionObserver` 미지원 브라우저 대상 `setTimeout` 순차 등장
  폴백 추가(레퍼런스 대다수 미다룸).
- `prefers-reduced-motion: reduce`에서도 가이드 페이지 리빌은 유지 — 안내
  문서에서 "다음 내용 존재" 신호 역할로 판단, 의도적 예외 처리.
- 애니메이션 트리거를 Svelte 컴포넌트 `onMount` 내부로 통합.
  이전에는 전역 `document.querySelector` + `MutationObserver`로 DOM(Document Object Model)을 감시하던 `utils/guide-motion.js` 별도 파일 존재 —
  Svelte 라우팅 타이밍과 어긋나 새로고침 시 애니메이션 미부착 문제로 제거.
