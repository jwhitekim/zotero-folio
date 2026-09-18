# 고도화된 스크롤/등장 애니메이션 레퍼런스 조사

가이드 페이지 1회성 리빌 패턴 근거 확인, 로그인 페이지 배치 개선용 추가 조사.
기본 패턴은 [guide-scroll-reveal-research.md](./guide-scroll-reveal-research.md) 참고.

## 조사한 레퍼런스

- [Web Animation Trends 2026 — MotionKit Blog](https://motionkit.io/blog/web-animation-trends-2026)
- [51 CSS Animations on Scroll Your Visitors Will Love — Slider Revolution](https://www.sliderrevolution.com/resources/css-animations-on-scroll/)
- [11 CSS animation-timeline Demos — CodeFronts](https://codefronts.com/motion/css-animation-timeline/)
- [Scroll Reveal Animations — ScrollReveal.js](https://scrollreveal.it/)
- [Micro-Interactions That Build Trust — Spell](https://spell.sh/blog/micro-interactions-that-build-trust)
- [10 Latest CSS Hero Section Animations — devnahian](https://devnahian.com/10-css-hero-section-animations-latest/)

## 1회성 vs 반복형 — 콘텐츠 유형별 선택 기준

레퍼런스 공통 결론: 반복 여부는 취향이 아니라 콘텐츠 성격으로 결정.

| 콘텐츠 유형 | 권장 패턴 | 근거 |
| --- | --- | --- |
| 히어로, 제품 카드, 인물 소개 | 반복형(스크롤 왕복마다 재생) | 다시 봐도 매번 시선을 끄는 용도 |
| 스티키 스크롤 스토리, 임상/제품 상세, 절차형 안내 | 1회성(1회 등장 후 고정) | 정보 습득이 목적, 반복 재생은 산만함만 추가 |

가이드 페이지 결론: **1회성 유지 권장.** `/guide`는 "Zotero 가입 >
Folio 연결" 10단계 절차형 안내 문서 — 위 표의 "절차형 안내" 범주에 정확히
해당. 반복형으로 바꾸면 스크롤을 왔다갔다 할 때마다 이미 읽은 단계가
깜빡여서 오히려 정보 탐색을 방해. 현재 구현(`observer.unobserve` 유지)
그대로 두는 것이 근거 있는 선택.

## 재활용(반복형) 패턴 — 구현 레시피

현재 미채택이지만, 향후 히어로/카드형 콘텐츠에 필요해질 경우를 대비한
구현 방식 기록. 1회성 패턴과의 차이는 딱 2곳.

```js
// 1) unobserve 제거 — 계속 관찰 유지
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const index = stepEls.indexOf(entry.target);
      // 2) isIntersecting이 false로 돌아올 때도 상태를 되돌림
      revealed[index] = entry.isIntersecting;
      // observer.unobserve(entry.target); <- 1회성 패턴에서만 필요, 반복형은 제거
    });
  },
  { threshold: 0.08, rootMargin: '0px 0px -6% 0px' },
);
```

```css
/* CSS는 1회성 패턴과 동일 구조 그대로 재사용 가능 —
   transition을 기본 규칙에 두는 원칙은 반복형에서 더 중요.
   화면에서 나갈 때(visible -> pending)도 같은 transition으로
   사라져야 자연스럽다. */
.item { opacity: 0; transform: translateY(40px); transition: opacity 620ms, transform 720ms; }
.item.is-visible { opacity: 1; transform: none; }
```

zotero-insight 프로젝트에 적용한다면 `GuidePage.svelte`의 `onMount` 안
`observer.unobserve(entry.target)` 한 줄만 지우고, `if (!entry.isIntersecting)
return;` 대신 `revealed[idx] = entry.isIntersecting`로 바꾸면 전환 가능 —
CSS는 무수정.

## 스태거(순차 지연) 패턴

- 항목 인덱스 기반 지연 60~100ms 권장 — 이보다 길면 전체 시퀀스가 느리게
  느껴짐.
- 최신 CSS 전용 구현은 `--i` 커스텀 속성 + `calc()`로 `animation-range`를
  오프셋 — 지연을 시간이 아니라 스크롤 위치에 연동.
- 반복적인 상호작용(행 호버, 키 입력, 탭 전환)에는 스태거 금지 — 페이지
  최초 진입, 성공/빈 상태 같은 "드문 진입" 상황에만 사용.

## 로그인 페이지 마운트 애니메이션 패턴

로그인 페이지 배치 개선 시 참고할 수 있는 구조(적용 여부는 별도 결정):

- 마운트 시 1회 진입 시퀀스: 히어로 영역 페이드인 이후 폼 영역(제목, 입력,
  버튼, 하단 링크)이 짧은 스태거로 순차 등장.
- 텍스트 자체 애니메이션(블러에서 포커스로, 단어 단위 스태거)은 "공들인 느낌"을
  주지만 남용 시 체감 로딩 지연으로 이어짐 — 헤드라인 1곳 정도로 제한
  권장.
- 접근성: 모든 `@keyframes` 애니메이션은 `@media (prefers-reduced-motion:
  no-preference)` 안에 두고, reduce 환경에서는 최종 상태로 바로 렌더 —
  zotero-insight 프로젝트는 반대 방향(:root 전역 리셋 + 예외 화이트리스트)
  으로 이미 구현 중, 방향은 달라도 목적은 동일(reduce 환경에서 애니메이션
  최소화).

## 미채택 방향

- `animation-timeline: view()` 기반 스태거: Chromium 위주 지원, JS
  폴백 이중 관리 부담 — guide-scroll-reveal-research.md에서 이미 기각한
  근거와 동일.
- ScrollReveal.js 같은 별도 라이브러리 도입: zotero-insight 프로젝트
  규모(가이드 10단계, 로그인 1개 화면)에는 과함, 번들 크기 대비 이득
  낮음 — 직접 구현한 `IntersectionObserver` + CSS transition으로 충분.
