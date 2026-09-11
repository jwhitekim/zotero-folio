<script>
  // PDF 렌더링/확대·축소/중앙 정렬/텍스트·주석 레이어는 전부 pdf.js가 자기
  // 공식 웹 뷰어(Chrome 내장 뷰어 등도 같은 계열)에 쓰는 PDFViewer 엔진에
  // 맡긴다 — 예전엔 캔버스를 직접 그리고 스크롤 위치로 중앙 정렬을 손수
  // 계산했는데, 그 수식이 확대 시 비대칭하게 밀리는 등 버그가 반복돼서
  // pdfjs-dist에 이미 포함된 검증된 엔진으로 갈아탔다.
  import '../utils/safari-polyfills.js';
  import { cubicOut } from 'svelte/easing';
  import * as pdfjsLib from 'pdfjs-dist';
  import { EventBus, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
  import 'pdfjs-dist/web/pdf_viewer.css';
  import pdfWorkerUrl from '../utils/pdf-worker-entry.js?worker&url';
  import { api } from '../services/api.js';
  import {
    HIGHLIGHT_COLORS,
    mergeLineRects,
    extractRangeText,
    normalizeText,
    formatSortIndex,
    toPdfRect,
    toPageBox,
    coveredWidthRatio,
  } from '../utils/pdf-highlight.js';

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  // scrollContainer: 실제로 스크롤되는 요소(PdfPane.svelte의 .viewer-scroll) —
  // PDFViewer가 스크롤 위치/가시 영역을 직접 읽고 쓰는 대상이라, 우리 것과
  // 같은 요소를 넘겨줘야 확대 시 커서 고정 스크롤 보정(PdfPane.svelte의
  // zoomTo)이 계속 같은 스크롤 위치 기준으로 동작한다.
  // itemKey: 하이라이트를 읽고 쓸 논문 키. 없으면 형광펜 기능만 조용히 꺼진다.
  let { src, zoom = 1, scrollContainer, itemKey = null } = $props();

  let viewerEl = $state();
  let loading = $state(true);
  let error = $state('');
  let errorDetail = $state('');

  let eventBus;
  let linkService;
  let pdfViewer;
  let pdfDocument;
  let loadedSrc = '';

  // pdf.js의 TextLayer는 DPR을 곱한 크기로 hidden canvas에서 measureText()를
  // 실행한 뒤 그 비율을 CSS px 크기의 span에 적용한다. Windows fractional
  // DPI에서는 DirectWrite의 힌팅/반올림 때문에 두 크기의 글자 폭이 정확히
  // 선형 비례하지 않아 선택 영역이 가로로 누적해서 밀릴 수 있다. PDF가
  // 지정한 목표 폭은 유지하되, 자연 폭만 실제 DOM span에서 다시 재서
  // --scale-x를 교정한다. getTextContent는 페이지마다 한 번만 가져온다.
  const textContentCache = new WeakMap();
  const textCalibrationJobs = new WeakMap();

  function needsDomTextCalibration() {
    const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
    const ratio = window.devicePixelRatio || 1;
    return /win/i.test(platform) && Math.abs(ratio - Math.round(ratio)) > 0.001;
  }

  function getTextContent(pdfPage) {
    let promise = textContentCache.get(pdfPage);
    if (!promise) {
      promise = pdfPage.getTextContent({ includeMarkedContent: true, disableNormalization: true });
      textContentCache.set(pdfPage, promise);
    }
    return promise;
  }

  function calibrateTextLayer(pageNumber) {
    if (!needsDomTextCalibration()) return;

    const pageView = pdfViewer?._pages?.[pageNumber - 1];
    const textLayer = pageView?.textLayer?.div;
    const textDivs = pageView?._textHighlighter?.textDivs;
    const pdfPage = pageView?.pdfPage;
    // 회전된/세로쓰기 텍스트는 width와 height 축이 뒤바뀌므로 여기서 임의로
    // 보정하지 않는다. 논문 본문의 일반적인 가로쓰기 페이지만 대상이다.
    if (!textLayer || !textDivs?.length || !pdfPage || pageView.viewport.rotation % 180 !== 0) return;

    const previousJob = textCalibrationJobs.get(textLayer) || Promise.resolve();
    const job = previousJob
      .catch(() => {})
      .then(async () => {
        const content = await getTextContent(pdfPage);
        // 기다리는 사이 확대/페이지 재생성으로 레이어가 교체됐으면 폐기한다.
        if (pageView.textLayer?.div !== textLayer || pageView._textHighlighter?.textDivs !== textDivs) return;

        const items = content.items.filter((item) => item.str !== undefined);
        const layerWidth = textLayer.getBoundingClientRect().width;
        const viewportWidth = pageView.viewport.width;
        if (!(layerWidth > 0) || !(viewportWidth > 0)) return;

        const candidates = [];
        for (let index = 0; index < Math.min(items.length, textDivs.length); index += 1) {
          const item = items[index];
          const span = textDivs[index];
          if (
            !span?.isConnected ||
            !span.style.getPropertyValue('--scale-x') ||
            span.style.getPropertyValue('--rotate') ||
            content.styles[item.fontName]?.vertical
          ) {
            continue;
          }
          candidates.push({
            span,
            originalScale: span.style.getPropertyValue('--scale-x'),
            // item.width는 PDF 좌표 폭이다. viewport 배율과 실제(기기 픽셀
            // 반올림 후) textLayer/viewport 폭 비율을 함께 적용한다.
            targetWidth: Math.abs(item.width) * pageView.viewport.scale * (layerWidth / viewportWidth),
          });
        }

        // 모든 write를 먼저, 모든 read를 그다음에 수행해 페이지마다 강제
        // 레이아웃이 한 번만 일어나게 한다. 같은 task 안에서 원복/교정까지
        // 끝나므로 scaleX=1 상태가 화면에 그려지는 프레임은 없다.
        for (const { span } of candidates) span.style.setProperty('--scale-x', '1');
        const naturalWidths = candidates.map(({ span }) => span.getBoundingClientRect().width);
        candidates.forEach(({ span, originalScale, targetWidth }, index) => {
          const naturalWidth = naturalWidths[index];
          span.style.setProperty(
            '--scale-x',
            naturalWidth > 0 && targetWidth > 0 ? String(targetWidth / naturalWidth) : originalScale
          );
        });
      })
      .catch((err) => console.warn('[PdfViewer] 텍스트 레이어 폭 교정 실패', err))
      .finally(() => {
        if (textCalibrationJobs.get(textLayer) === job) textCalibrationJobs.delete(textLayer);
      });
    textCalibrationJobs.set(textLayer, job);
  }

  // 컨테이너 폭 기준 "페이지가 폭에 딱 맞는" 절대 배율. zoom prop(1 = 그
  // 배율)과 곱해서 PDFViewer에 넘길 실제 절대 배율을 만든다 — PDFViewer의
  // currentScale은 PDF 좌표계 기준 절대값이라 우리 쪽 "폭 맞춤 대비 %"
  // 개념과 다르기 때문.
  let fitWidthScale = $state(null);
  // CSS로 즉시 미리보기 확대를 보여주는 배율 기준값 — 실제 재렌더(고비용)는
  // 아래에서 debounce하고, 그 사이엔 이 값 대비 zoom 비율만큼 transform:
  // scale로 즉시 반응하는 느낌을 준다.
  let renderedZoom = $state(1);
  let zoomTimer;

  // 참고문헌 링크로 점프하기 직전의 스크롤 위치. null이면 되돌아갈 위치가
  // 없다는 뜻. 화면에 떠 있는 버튼은 없고, Alt+← 단축키나 브라우저
  // 뒤로가기로 조용히 원위치로 돌아간다.
  let jumpBackTop = $state(null);

  function jumpBack() {
    if (jumpBackTop == null || !scrollContainer) return;
    scrollContainer.scrollTo({ top: jumpBackTop, behavior: 'auto' });
    jumpBackTop = null;
  }

  // 실제 점프(스크롤 이동)는 PDFLinkService가 표준 방식으로 처리하므로, 여기서는
  // 그 직전에 "돌아갈 위치"만 옆에서 가로채 기록한다. capture 단계라 실제
  // 링크 클릭 핸들링보다 먼저 실행된다.
  function onLinkClickCapture(e) {
    if (!scrollContainer) return;
    const link = e.target.closest?.('.annotationLayer .linkAnnotation a');
    if (!link) return;
    // 참고문헌 링크(위첨자 [3] 등)가 형광펜 위에 겹쳐 있으면, 그 자리를 클릭했을 때
    // pointerup 핸들러가 이미 삭제 확인 팝업을 띄운 상태다. 여기서 링크 이동까지
    // 그대로 진행되면 팝업이 뜨자마자 화면이 참고문헌으로 점프해버려 팝업을 누를
    // 새가 없다 — 형광펜 삭제 상호작용이 링크 이동보다 우선하도록 여기서 막는다.
    if (itemKey && findHighlightAt(e.clientX, e.clientY)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // "돌아갈 위치"는 지금 보고 있는(=점프 직전) 히스토리 엔트리에 저장해야
    // 네이티브 뒤로가기 시 popstate가 그 값을 그대로 돌려준다. pushState만
    // 하면 스크롤 값이 "앞으로 갈 새 엔트리"에 들어가 버려서, 뒤로가기 때는
    // 이전 엔트리의(값 없는) state가 와 복원이 안 됐다(off-by-one). 그래서
    // 현재 엔트리에 replaceState로 먼저 심고, 점프한 뷰용으로 빈 엔트리를
    // 새로 push한다.
    history.replaceState(
      { ...history.state, pdfScrollTop: scrollContainer.scrollTop },
      '',
      location.href
    );
    history.pushState({}, '', location.href);
    jumpBackTop = scrollContainer.scrollTop;
    // 클릭된 링크(<a>)에 포커스가 남으면, 맥에서 그 상태로 Option+←를 눌렀을 때
    // 브라우저가 ArrowLeft 키다운 이벤트 자체를 페이지 JS까지 보내지 않고
    // 가로채버린다(altKey:true인 keydown이 전혀 안 옴 — 실측 확인됨). 클릭
    // 직후 포커스가 실제로 옮겨진 뒤(다음 프레임)에 블러 처리해 이 가로챔을
    // 피한다 — 클릭 시점에 바로 blur하면 브라우저의 기본 포커스 이동이
    // 나중에 다시 덮어씌울 수 있다.
    requestAnimationFrame(() => {
      if (document.activeElement === link) link.blur();
    });
  }

  // --- 형광펜(하이라이트) ------------------------------------------------
  // 저장소는 Zotero다. 여기서 만든 하이라이트는 Zotero 표준 annotation
  // 아이템(annotationType: highlight)으로 바로 저장되고, 반대로 Zotero
  // 데스크톱/모바일에서 칠한 것도 그대로 읽어와서 그린다 — Folio는 하이라이트를
  // 로컬에 따로 캐시하지 않는다.
  let highlights = $state([]);
  // 드래그 선택 직후 뜨는 색상 팔레트. items에는 "페이지별로 만들 하이라이트"가
  // 이미 계산된 채 담겨 있다 — 팔레트 버튼을 누르는 순간엔 선택이 풀려 있을 수도
  // 있어서, 좌표/텍스트는 선택이 살아 있는 시점에 미리 확정해둔다.
  let colorPopup = $state(null); // { items, x, y, above }
  // 기존 하이라이트를 클릭했거나, 이미 칠한 자리를 다시 드래그했을 때 뜨는 삭제
  // 확인 팝업. 실제 삭제(api.deleteHighlight)는 여기서 바로 하지 않고 이 팝업의
  // "형광펜 지우기" 버튼을 눌러야만 실행된다 — 실수로 지웠을 때 되돌릴 방법이
  // 없어서, 클릭/드래그 어느 경로든 확인 없이 바로 지우지 않게 한다.
  let deletePopup = $state(null); // { keys, x, y, above }
  let highlightError = $state('');

  // 마지막에 쓴 형광펜 색. Alt(맥은 Option)를 누른 채 드래그를 끝내면 팔레트를
  // 거치지 않고 이 색으로 바로 칠한다(빠르게 칠하기).
  // 브라우저를 다시 열어도 같은 색으로 이어지도록
  // localStorage에 남긴다 — 팔레트에 있는 색인지 한 번 검사해서, 값이 깨졌거나
  // 팔레트가 바뀐 경우엔 처음처럼 팔레트를 띄운다.
  const LAST_COLOR_STORAGE_KEY = 'folio:lastHighlightColor';

  function readLastColor() {
    try {
      const saved = localStorage.getItem(LAST_COLOR_STORAGE_KEY);
      return HIGHLIGHT_COLORS.some((c) => c.value === saved) ? saved : null;
    } catch {
      return null;
    }
  }

  let lastColor = $state(readLastColor());

  // 팔레트 아래에 띄우는 단축키 안내. 맥에서는 같은 키를 Option으로 부르므로
  // 표기만 바꾼다(위 devicePixelRatio 보정과 같은 방식으로 플랫폼을 읽는다).
  function isMacPlatform() {
    const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
    return /mac/i.test(platform);
  }

  const quickPaintHint = `${isMacPlatform() ? 'Option' : 'Alt'}+드래그로 마지막 색 바로 칠하기`;

  function rememberColor(color) {
    lastColor = color;
    try {
      localStorage.setItem(LAST_COLOR_STORAGE_KEY, color);
    } catch {
      // 사생활 보호 모드 등으로 저장이 막혀도 이번 세션 동안은 그대로 쓴다.
    }
  }
  let pageLabels = null;
  let errorTimer;

  function showHighlightError(message) {
    highlightError = message;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => (highlightError = ''), 4000);
  }

  function closePopups() {
    colorPopup = null;
    deletePopup = null;
  }

  // 색상 팔레트와 삭제 확인 팝업은 동시에 뜨지 않는다 — 어느 쪽을 띄우든
  // 그 직전 pointerdown이 항상 closePopups()로 둘 다 닫기 때문. 그래서 화면에
  // 그리는 팝업 요소도 하나만 두고 내용만 바꾼다. 이렇게 해야 아래
  // suppressLinksUnderPopup()의 querySelector('.highlight-popup')가 언제나
  // "지금 떠 있는 그 팝업"을 집는다 — 블록을 둘로 나눠두면 퇴장 애니메이션
  // 때문에 아직 DOM에 남아 있는 옛 팝업이 먼저 잡힐 수 있다.
  let activePopup = $derived(colorPopup ?? deletePopup);

  // 마크업이 실제로 읽는 팝업 내용은 이 스냅샷이다. activePopup은 닫히는 순간
  // null이 되는데, 퇴장 트랜지션(popupOut) 동안에도 팝업 요소는 DOM에 남아
  // 있어서 그 사이에 마크업이 activePopup.x / deletePopup 같은 걸 다시 읽으면
  // null을 건드리게 된다 — 그러면 삭제 버튼을 눌렀을 때 하이라이트는 지워졌는데
  // 팝업만 화면에 그대로 남는다. 닫힐 때는 이 스냅샷을 그대로 두어서 퇴장하는
  // 팝업이 마지막 모습(위치/색/버튼)을 유지한 채 사라지게 한다.
  let popupView = $state(null); // { kind: 'color' | 'delete', x, y, above }

  // 팝업이 열린 순간의 스크롤 위치. 스크롤로 팝업을 닫을 때, 실제로 화면이
  // 움직였을 때만 닫기 위한 기준값이다 — 팝업이 뜨는 것과 같은 틱에 스크롤
  // 이벤트가 한 번 발생하면(선택 영역 정리, 레이어 재배치 등) 방금 연 팝업이
  // 즉시 닫혀서 "드래그해도 팝업이 안 뜨는" 것처럼 보였다.
  let popupScrollTop = 0;

  function openColorPopup(items, anchor) {
    popupScrollTop = scrollContainer?.scrollTop ?? 0;
    colorPopup = { items, ...anchor };
    popupView = { kind: 'color', ...anchor };
  }

  function openDeletePopup(keys, anchor) {
    popupScrollTop = scrollContainer?.scrollTop ?? 0;
    deletePopup = { keys, ...anchor };
    popupView = { kind: 'delete', ...anchor };
  }

  function onViewerScroll() {
    if (!colorPopup && !deletePopup) return;
    // 1px도 안 움직였으면 진짜 스크롤이 아니다 — 방금 연 팝업을 지키기 위해 무시.
    if (Math.abs((scrollContainer?.scrollTop ?? 0) - popupScrollTop) < 1) return;
    closePopups();
  }

  // 팝업 등장/퇴장 모션. 선택 영역 쪽에서 살짝 밀려 나오며 뜨고 같은 궤적으로
  // 접힌다. 애니메이션은 안쪽 카드(.popup-card)에만 걸고 바깥 래퍼
  // (.highlight-popup)는 정지 상태로 둔다 — transform은 레이아웃 박스를 바꾸지
  // 않으므로, 래퍼의 getBoundingClientRect()는 애니메이션 중에도 항상 최종
  // 위치/크기 그대로다. suppressLinksUnderPopup()이 그 사각형으로 겹친 참고문헌
  // 링크를 찾으므로 이 조건이 깨지면 안 된다.
  function popupMotion({ above = true, closing = false } = {}) {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    return {
      duration: reduced ? 0 : closing ? 110 : 170,
      easing: cubicOut,
      css: (t, u) =>
        `opacity: ${t};` +
        `transform: translateY(${(u * (above ? 6 : -6)).toFixed(2)}px) scale(${(0.94 + 0.06 * t).toFixed(4)});` +
        // 닫히는 중인 팝업은 사라질 때까지 DOM에 남아 있으므로, 그 동안 클릭을
        // 가로채지 않도록 포인터 이벤트를 꺼둔다.
        (closing ? 'pointer-events: none;' : ''),
    };
  }

  function popupIn(node, params) {
    return popupMotion(params);
  }

  function popupOut(node, params) {
    return popupMotion({ ...params, closing: true });
  }

  // 형광펜 팝업(색상 선택/삭제 확인)과 화면상 겹치는 참고문헌 링크는, 팝업이
  // 떠 있는 동안 pointer-events를 꺼서 클릭을 아예 못 받게 한다. 팝업은
  // position: fixed + z-index로 항상 위에 그려지긴 하지만, DOM 상으로는 이
  // 스크롤 컨테이너의 자손이라(잘림 방지를 위해 fixed를 씀) 겹친 지점을
  // 클릭했을 때 hit-test가 가끔 팝업 버튼이 아니라 그 아래 링크로 잡히는
  // 사례가 있었다 — z-index만 믿지 않고 좌표로 직접 링크를 무력화해 확실히
  // 막는다.
  let suppressedLinks = [];

  function suppressLinksUnderPopup() {
    try {
      const popupEl = scrollContainer?.querySelector('.highlight-popup');
      if (!popupEl) return;
      const popupRect = popupEl.getBoundingClientRect();
      const links = scrollContainer?.querySelectorAll('.annotationLayer .linkAnnotation a') ?? [];
      for (const a of links) {
        const r = a.getBoundingClientRect();
        const overlaps =
          r.left < popupRect.right && r.right > popupRect.left && r.top < popupRect.bottom && r.bottom > popupRect.top;
        if (overlaps) {
          a.style.pointerEvents = 'none';
          suppressedLinks.push(a);
        }
      }
    } catch (err) {
      // 링크 무력화는 편의 기능이다 — 실패해도 팝업 자체는 떠야 하므로 삼킨다.
      console.warn('[PdfViewer] 팝업 아래 링크 무력화 실패', err);
    }
  }

  function restoreSuppressedLinks() {
    // 하나가 실패해도(노드가 이미 제거된 경우 등) 나머지는 반드시 되돌린다.
    const links = suppressedLinks;
    suppressedLinks = [];
    for (const a of links) {
      try {
        a.style.pointerEvents = '';
      } catch {
        // 무시 — 이미 사라진 노드다.
      }
    }
  }

  // 팝업이 열리면(색상 팔레트든 삭제 확인이든) 즉시 겹친 링크를 찾아 무력화하고,
  // 팝업이 닫히거나 다른 팝업으로 바뀌면 원상복구한다.
  $effect(() => {
    if (!colorPopup && !deletePopup) return;
    suppressLinksUnderPopup();
    return restoreSuppressedLinks;
  });

  // 확대 미리보기 transform(아래 style:transform)이 걸려 있는 동안의 추가 배율.
  // 화면 좌표는 이 배율까지 곱해진 값이고, 페이지 div 안에 넣을 CSS 박스는
  // 곱해지기 전 값이어야 해서 두 방향에서 서로 다르게 쓴다.
  function previewFactor() {
    return zoom === renderedZoom || !renderedZoom ? 1 : zoom / renderedZoom;
  }

  // "화면상 페이지 폭 / viewport 폭". 기기 픽셀 반올림까지 포함해 실측한다.
  function visualScale(pageView) {
    const width = pageView.div?.getBoundingClientRect().width ?? 0;
    const viewportWidth = pageView.viewport?.width ?? 0;
    return width > 0 && viewportWidth > 0 ? width / viewportWidth : 1;
  }

  function pageViews() {
    return pdfViewer?._pages ?? [];
  }

  function highlightLayerOf(pageView) {
    return pageView.div?.querySelector(':scope > .folio-highlight-layer') ?? null;
  }

  // 한 페이지의 하이라이트 사각형을 다시 그린다. pdf.js는 배율이 바뀔 때마다
  // 페이지 div의 자식을 전부 지우고(PDFPageView.reset) 다시 만들기 때문에,
  // 우리 레이어도 pagerendered 때마다 새로 붙여야 한다.
  function renderHighlightLayer(pageNumber) {
    const pageView = pageViews()[pageNumber - 1];
    if (!pageView?.div || !pageView.viewport) return;

    const pageIndex = pageNumber - 1;
    // rects가 없는(서버 응답이 예상과 다르거나 중간에 깨진) 항목은 그리기에서
    // 조용히 빼둔다 — 여기서 예외가 나면 아래 $effect 전체가 죽는다.
    const items = highlights.filter((h) => h.pageIndex === pageIndex && Array.isArray(h.rects) && h.rects.length);
    let layer = highlightLayerOf(pageView);

    if (!items.length) {
      layer?.remove();
      return;
    }

    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'folio-highlight-layer';
    }
    // 텍스트 레이어보다 앞(=아래)에 둬서 캔버스 위·글자 아래에 깔리게 한다.
    // 텍스트 레이어는 페이지가 그려진 뒤에 따로 붙기 때문에, 이미 있는
    // 레이어라도 매번 위치를 다시 잡아준다(insertBefore는 기존 노드를 옮긴다).
    const textLayerDiv = pageView.textLayer?.div;
    pageView.div.insertBefore(layer, textLayerDiv?.parentNode === pageView.div ? textLayerDiv : null);

    const scale = visualScale(pageView) / previewFactor();
    layer.replaceChildren(
      ...items.flatMap((highlight) =>
        highlight.rects.map((rect) => {
          const box = toPageBox(rect, pageView.viewport, scale);
          const el = document.createElement('div');
          el.className = 'folio-highlight';
          el.dataset.highlightKey = highlight.key;
          el.style.left = `${box.left}px`;
          el.style.top = `${box.top}px`;
          el.style.width = `${box.width}px`;
          el.style.height = `${box.height}px`;
          el.style.background = highlight.color;
          return el;
        })
      )
    );
  }

  // 페이지 하나가 실패해도 나머지는 계속 그린다. 특히 이 함수는 $effect에서
  // 불리는데, Svelte 5는 effect 하나가 예외를 던지면 같은 flush에 묶인 다른
  // effect(팝업 {#if}를 그리는 렌더 effect 포함)까지 함께 중단시킨다 — 그러면
  // "어느 순간부터 드래그해도 팝업이 안 뜨는" 고착 상태가 된다. 그래서 여기서
  // 예외가 밖으로 새어 나가지 않게 반드시 가둔다.
  function safeRenderHighlightLayer(pageNumber) {
    try {
      renderHighlightLayer(pageNumber);
    } catch (err) {
      console.warn('[PdfViewer] 하이라이트 레이어 렌더 실패', pageNumber, err);
    }
  }

  function renderAllHighlightLayers() {
    for (let i = 1; i <= pageViews().length; i += 1) safeRenderHighlightLayer(i);
  }

  async function loadHighlights() {
    highlights = [];
    // 다른 논문으로 넘어가면 이전 문서의 임시 key 대응표는 쓸모가 없다.
    resolvedPendingKeys.clear();
    if (!itemKey) return;
    try {
      highlights = await api.listHighlights(itemKey);
    } catch (err) {
      // 하이라이트를 못 읽어도 PDF 읽기 자체는 계속돼야 한다 — 로그만 남긴다.
      console.warn('[PdfViewer] 하이라이트 조회 실패', err);
    }
  }

  // 선택 영역을 "페이지별 하이라이트 1개"로 쪼갠다. 페이지를 걸쳐 드래그하면
  // Zotero annotation의 position이 페이지 하나만 담을 수 있으므로 페이지 수만큼
  // 나눠서 만든다.
  function buildHighlightsFromRange(range) {
    const built = [];

    for (const pageView of pageViews()) {
      // 페이지 하나에서 실패해도(확대/스크롤로 텍스트 레이어가 교체되는 중이라
      // Range 비교가 WrongDocumentError를 던지는 등) 나머지 페이지는 계속
      // 처리하고, 무엇보다 예외가 pointerup 밖으로 새어 나가지 않게 한다.
      try {
        const textLayerDiv = pageView?.textLayer?.div;
        if (!textLayerDiv || !pageView.div || !pageView.viewport) continue;
        if (!range.intersectsNode(textLayerDiv)) continue;

        const pageRange = document.createRange();
        pageRange.selectNodeContents(textLayerDiv);

        // 선택 범위를 이 페이지 안쪽으로 잘라낸다.
        const clipped = range.cloneRange();
        if (clipped.compareBoundaryPoints(Range.START_TO_START, pageRange) < 0) {
          clipped.setStart(pageRange.startContainer, pageRange.startOffset);
        }
        if (clipped.compareBoundaryPoints(Range.END_TO_END, pageRange) > 0) {
          clipped.setEnd(pageRange.endContainer, pageRange.endOffset);
        }
        if (clipped.collapsed) continue;

        const text = normalizeText(extractRangeText(clipped));
        const pageRect = pageView.div.getBoundingClientRect();
        const scale = visualScale(pageView);
        const rects = mergeLineRects([...clipped.getClientRects()]).map((rect) =>
          toPdfRect(rect, pageRect, pageView.viewport, scale)
        );
        if (!text || !rects.length) continue;

        // sortIndex의 문자 오프셋 — 페이지 첫 글자부터 선택 시작점까지의 길이.
        // Zotero 사이드바 정렬용 값이라 같은 페이지 안 순서만 맞으면 충분하다.
        const beforeRange = document.createRange();
        beforeRange.setStart(pageRange.startContainer, pageRange.startOffset);
        beforeRange.setEnd(clipped.startContainer, clipped.startOffset);
        const offset = extractRangeText(beforeRange).length;

        const pageIndex = pageView.id - 1;
        const viewBox = pageView.viewport.viewBox ?? [0, 0, 0, 0];
        built.push({
          pageIndex,
          rects,
          text,
          pageLabel: pageLabels?.[pageIndex] || String(pageIndex + 1),
          sortIndex: formatSortIndex(pageIndex, offset, viewBox[3] - rects[0][3]),
        });
      } catch (err) {
        console.warn('[PdfViewer] 선택 영역 해석 실패', err);
      }
    }

    return built;
  }

  // 팝업은 position: fixed라 화면 좌표를 그대로 쓴다. 위쪽 공간이 모자라면
  // 선택 영역 아래로 내려서 띄운다.
  // 터치(굵은 포인터) 환경에선 손가락이 선택 영역 근처를 가리므로 팝업을 조금
  // 더 띄워 손가락에 덜 가리게 한다. 마우스면 기존 8px 그대로.
  const coarsePointer =
    typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

  function popupAnchor(rect) {
    const gap = coarsePointer ? 14 : 8;
    const above = rect.top > 96;
    return {
      x: Math.min(window.innerWidth - 100, Math.max(100, rect.left + rect.width / 2)),
      y: above ? rect.top - gap : rect.bottom + gap,
      above,
    };
  }

  // 클릭 지점에 있는 하이라이트를 찾는다. 하이라이트 레이어는 텍스트 레이어
  // 아래에 깔려 있어서 클릭 이벤트가 직접 닿지 않으므로, 사각형과 직접 비교한다.
  function findHighlightAt(clientX, clientY) {
    for (const pageView of pageViews()) {
      const layer = pageView?.div ? highlightLayerOf(pageView) : null;
      if (!layer) continue;
      for (const el of layer.children) {
        const rect = el.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return { key: el.dataset.highlightKey, rect };
        }
      }
    }
    return null;
  }

  // 팝업 자체는 position: fixed로 떠 있지만 DOM 상으로는 스크롤 컨테이너의
  // 자손이라, 팝업 버튼을 누른 pointerdown도 여기까지 올라온다. 그대로 두면
  // 색상 버튼을 누르는 순간 팝업이 닫혀 사라져서 click이 아예 안 걸린다.
  function isInsidePopup(e) {
    return !!e.target?.closest?.('.highlight-popup');
  }

  function onViewerPointerDown(e) {
    try {
      if (isInsidePopup(e)) return;
      closePopups();
    } catch (err) {
      console.warn('[PdfViewer] 팝업 닫기 실패', err);
      colorPopup = null;
      deletePopup = null;
    }
  }

  // 새로 드래그한 선택 전체가 기존 하이라이트 안에 거의 그대로 들어있을 때만
  // "재선택 = 지우기"로 본다(겹친 넓이 / 새 선택 넓이 >= threshold). 이미 칠한
  // 단어를 포함해서 더 큰 문장을 새로 드래그하는 것처럼 선택이 하이라이트 밖으로
  // 삐져나가면(부분 겹침) 지우기가 아니라 새 하이라이트로 취급한다 — 사용자가
  // 다른/더 넓은 범위를 칠하려던 걸 실수로 지워버리면 안 되기 때문.
  function findReselectedHighlights(items, threshold = 0.8) {
    const keys = new Set();
    let coveredWidth = 0;
    let totalWidth = 0;

    for (const item of items) {
      const pageRects = [];
      for (const h of highlights) {
        // rects가 없는 항목이 섞여 있어도 여기서 터지면 안 된다 — 이 함수는
        // pointerup 경로 한복판이라 예외 하나로 팝업이 영영 안 뜨게 된다.
        if (h?.pageIndex !== item.pageIndex || !Array.isArray(h.rects)) continue;
        for (const hr of h.rects) pageRects.push({ key: h.key, rect: hr });
      }

      for (const rect of item.rects) {
        const width = Math.max(0, rect[2] - rect[0]);
        if (width <= 0) continue;
        totalWidth += width;

        const near = pageRects.filter((entry) => coveredWidthRatio(rect, [entry.rect]) > 0);
        if (!near.length) continue;
        for (const entry of near) keys.add(entry.key);
        coveredWidth += width * coveredWidthRatio(rect, near.map((entry) => entry.rect));
      }
    }

    if (!keys.size || totalWidth <= 0 || coveredWidth / totalWidth < threshold) return [];
    return [...keys];
  }

  // 이 핸들러 안에서 어떤 예외가 나도 "다음 드래그는 정상 동작"이어야 한다.
  // 예외가 밖으로 나가면 브라우저는 그냥 콘솔에만 찍고 넘어가지만, 그 사이
  // 팝업 상태나 선택 영역이 어중간하게 남아 이후 상호작용이 계속 먹통이
  // 되는 경우가 있었다 — 실패하면 상태를 깨끗이 초기화하고 끝낸다.
  function onViewerPointerUp(e) {
    try {
      handleViewerPointerUp(e);
    } catch (err) {
      console.warn('[PdfViewer] 형광펜 상호작용 실패', err);
      colorPopup = null;
      deletePopup = null;
      try {
        window.getSelection()?.removeAllRanges();
      } catch {
        // 무시
      }
    }
  }

  function handleViewerPointerUp(e) {
    if (!itemKey || isInsidePopup(e)) return;

    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const items = buildHighlightsFromRange(range);
      if (items.length) {
        const reselected = findReselectedHighlights(items);
        const anchor = popupAnchor(range.getBoundingClientRect());
        if (reselected.length) {
          openDeletePopup(reselected, anchor);
        } else if (e.altKey && lastColor) {
          // 빠르게 칠하기 — Alt(맥은 Option)를 누른 채 드래그를 끝내면 팔레트를
          // 거치지 않고 마지막에 쓴 색으로 바로 칠한다. 그냥 드래그하는 건 복사
          // 같은 다른 목적일 수 있으므로 기본값은 팔레트를 띄우는 쪽이다.
          window.getSelection()?.removeAllRanges();
          paintHighlights(items, lastColor);
        } else {
          openColorPopup(items, anchor);
        }
        return;
      }
    }

    const hit = findHighlightAt(e.clientX, e.clientY);
    if (hit) openDeletePopup([hit.key], popupAnchor(hit.rect));
    else deletePopup = null;
  }

  // 낙관적 UI로 먼저 그려둔, 아직 Zotero에 저장되지 않은 하이라이트의 임시 key.
  // Zotero annotation key는 영문 대문자+숫자 8자라 이 접두사와 겹치지 않는다.
  const PENDING_KEY_PREFIX = 'pending:';
  let pendingKeySeq = 0;

  function isPendingKey(key) {
    return typeof key === 'string' && key.startsWith(PENDING_KEY_PREFIX);
  }

  // 임시 key -> 저장 요청 Promise(성공 시 서버가 준 항목). 아직 저장 중인
  // 하이라이트를 곧바로 지우려 할 때 진짜 key를 기다리는 데 쓴다.
  const pendingCreations = new Map();
  // 임시 key -> 저장이 끝난 뒤의 진짜 key(실패했으면 null). 위 Map은 저장이
  // 끝나면 항목을 지우기 때문에, "저장 중에 열어둔 삭제 팝업"의 버튼을 저장이
  // 끝난 뒤에 누르면 임시 key를 진짜 key로 못 바꿔 삭제가 조용히 누락됐다
  // (화면에서만 사라지고 Zotero에는 그대로 남음). 그 대응표는 따로 남긴다.
  const resolvedPendingKeys = new Map();

  // 색상이 정해지는 즉시 임시 하이라이트를 화면에 그리고, Zotero 저장은 뒤에서
  // 진행한다 — API 왕복을 기다리는 동안 아무 반응이 없는 것처럼 보이던 딜레이를
  // 없애기 위해서다. 성공하면 서버가 준 진짜 항목으로 교체하고, 실패하면 임시
  // 항목을 걷어낸 뒤 에러를 띄운다. 페이지별 item은 서로 독립적으로 처리해서
  // 하나가 실패해도 나머지는 남는다.
  function paintHighlights(items, color) {
    if (!items.length || !itemKey) return;
    rememberColor(color);

    const targetItemKey = itemKey;
    for (const item of items) {
      const pendingKey = `${PENDING_KEY_PREFIX}${++pendingKeySeq}`;
      highlights = [...highlights, { ...item, color, key: pendingKey }];

      const request = api
        .createHighlight(targetItemKey, { ...item, color })
        .then((created) => {
          // 서버 응답이 예상과 다르면(키 없음/rects 없음) 화면에 넣지 않는다 —
          // 깨진 항목이 highlights에 들어가면 이후 렌더/재선택 판정이 계속
          // 예외를 던져 형광펜 상호작용 전체가 고착된다.
          if (!created?.key || !Array.isArray(created.rects)) {
            throw new Error('서버가 예상과 다른 응답을 보냈어요');
          }
          resolvedPendingKeys.set(pendingKey, created.key);
          // 저장이 끝나기 전에 다른 논문으로 넘어갔다면 화면 갱신은 건너뛴다
          // (진짜 key는 여전히 삭제 대기 쪽에 넘겨줘야 하므로 그대로 반환한다).
          if (itemKey === targetItemKey) {
            highlights = highlights.map((h) => (h.key === pendingKey ? created : h));
          }
          return created;
        })
        .catch((err) => {
          resolvedPendingKeys.set(pendingKey, null);
          highlights = highlights.filter((h) => h.key !== pendingKey);
          showHighlightError(`하이라이트를 저장하지 못했어요: ${err.message}`);
          return null;
        })
        .finally(() => pendingCreations.delete(pendingKey));

      pendingCreations.set(pendingKey, request);
    }
  }

  function createHighlight(color) {
    const items = colorPopup?.items ?? [];
    closePopups();
    window.getSelection()?.removeAllRanges();
    paintHighlights(items, color);
  }

  // 삭제 확인 팝업의 "형광펜 지우기" 버튼을 눌렀을 때만 실행된다 — 클릭으로
  // 하나를 지우든, 겹쳐 드래그해서 여러 개를 지우든 실제 삭제 경로는 이 한
  // 곳뿐이다(keys는 항상 1개 이상).
  // 칠하기와 마찬가지로 낙관적으로 처리한다 — 화면에서 먼저 지우고 Zotero 삭제는
  // 뒤에서 진행한다. 응답을 기다리는 동안 상호작용을 묶어두지 않으므로, 지운
  // 직후에도 바로 다른 곳을 칠하거나 지울 수 있다.
  function removeHighlight() {
    const keys = deletePopup?.keys ?? [];
    closePopups();
    window.getSelection()?.removeAllRanges();
    if (!keys.length || !itemKey) return;

    const targetItemKey = itemKey;
    const removed = highlights.filter((h) => keys.includes(h.key));
    highlights = highlights.filter((h) => !keys.includes(h.key));

    for (const highlight of removed) {
      deleteHighlightWhenSaved(targetItemKey, highlight);
    }
  }

  // 아직 저장 중인(임시 key) 하이라이트를 지우려는 경우엔 저장이 끝나 진짜 key를
  // 받을 때까지 기다렸다가 삭제한다 — 서버에 없는 key로 DELETE를 보내지 않기
  // 위해서다. 저장 자체가 실패했다면(항목이 이미 화면에서 사라진 상태) 지울
  // 것도 없으므로 그냥 끝낸다.
  async function deleteHighlightWhenSaved(targetItemKey, highlight) {
    let key = highlight.key;
    try {
      if (isPendingKey(key)) {
        // 아직 저장 중이면 끝날 때까지 기다리고, 이미 끝났으면 남겨둔 대응표에서
        // 진짜 key를 찾는다. 저장 자체가 실패했으면(null) 지울 것도 없다.
        const created = pendingCreations.has(key) ? await pendingCreations.get(key) : null;
        const realKey = created?.key ?? resolvedPendingKeys.get(key) ?? null;
        if (!realKey) return;
        key = realKey;
      }
      await api.deleteHighlight(targetItemKey, key);
    } catch (err) {
      // 실패한 것만 되돌린다 (여러 개를 한 번에 지울 때 나머지는 그대로 둔다).
      if (itemKey === targetItemKey) highlights = [...highlights, { ...highlight, key }];
      showHighlightError(`하이라이트를 지우지 못했어요: ${err.message}`);
    }
  }

  // 하이라이트 목록이 바뀌면 현재 렌더된 페이지들의 레이어를 다시 그린다.
  // (zoom/renderedZoom도 함께 읽히므로 확대 중에도 좌표가 따라온다)
  $effect(() => {
    highlights;
    zoom;
    renderedZoom;
    renderAllHighlightLayers();
  });

  async function loadDocument(url) {
    if (pdfDocument && loadedSrc === url) return pdfDocument;
    pdfDocument = await pdfjsLib.getDocument({ url }).promise;
    loadedSrc = url;
    return pdfDocument;
  }

  // 컨테이너 폭이 유효할 때만(탭 전환 등으로 숨겨져 폭이 0이면 건너뜀) "폭
  // 맞춤" 절대 배율을 다시 잰다. PDFViewer 자신의 named-scale 계산을
  // 그대로 활용 — 우리가 폭/여백 수식을 따로 들고 있지 않는다.
  function measureFitWidthScale() {
    if (!pdfViewer || !scrollContainer || scrollContainer.clientWidth === 0) return null;
    pdfViewer.currentScaleValue = 'page-width';
    return pdfViewer.currentScale;
  }

  function commitScale() {
    if (fitWidthScale == null || !pdfViewer) return;
    pdfViewer.currentScale = fitWidthScale * zoom;
    renderedZoom = zoom;
  }

  async function loadAndShow(url) {
    if (!pdfViewer) return;
    loading = true;
    error = '';
    closePopups();
    try {
      const doc = await loadDocument(url);
      linkService.setDocument(doc);
      pdfViewer.setDocument(doc);
      // annotationPageLabel에 넣을 "표지 기준 페이지 번호". 없는 PDF도 많아서
      // 실패하면 그냥 물리 페이지 번호(1부터)로 대체한다.
      pageLabels = await doc.getPageLabels().catch(() => null);
      await loadHighlights();
      // 나머지(배율 계산/loading 해제)는 pagesinit 이벤트에서 처리한다.
    } catch (err) {
      error = err.message;
      errorDetail = [
        `${err.name || 'Error'}: ${err.message}`,
        err.stack || '(스택 정보 없음)',
        navigator.userAgent,
      ].join('\n');
      console.error('[PdfViewer]', err);
      loading = false;
    }
  }

  let prevSrc;
  let prevZoom;

  $effect(() => {
    const s = src;
    const z = zoom;
    if (!pdfViewer) return; // 아래 초기화 effect가 아직 못 끝냈으면 여기선 아무것도 안 함

    if (s !== prevSrc) {
      prevSrc = s;
      prevZoom = z;
      clearTimeout(zoomTimer);
      loadAndShow(s);
      return;
    }

    if (z === prevZoom) return;
    prevZoom = z;
    // 배율만 바뀐 경우(휠/버튼 연타)엔 실제 재렌더를 잠깐 미룬다 — 매번
    // 다시 그리면 번쩍이고 무겁다. CSS 미리보기(아래 style:transform)가
    // 그 사이 즉시 반응하는 느낌을 대신 준다.
    clearTimeout(zoomTimer);
    zoomTimer = setTimeout(commitScale, 150);
  });

  // scrollContainer는 부모(PdfPane.svelte)가 bind:this로 넘겨주는 값이라,
  // 이 컴포넌트가 마운트되는 시점엔 아직 안 들어와 있을 수 있다(onMount에서
  // 곧바로 확인하면 "아직 없음"으로 오판할 수 있었던 버그) — $effect로
  // 두면 값이 나중에 들어와도 자동으로 다시 실행되니, 준비될 때까지
  // 기다렸다가 한 번만 초기화한다.
  let setupDone = false;
  $effect(() => {
    if (setupDone || !scrollContainer || !viewerEl) return;
    setupDone = true;

    eventBus = new EventBus();
    linkService = new PDFLinkService({ eventBus, ignoreDestinationZoom: true });
    pdfViewer = new PDFViewer({
      container: scrollContainer,
      viewer: viewerEl,
      eventBus,
      linkService,
      removePageBorders: true,
    });
    linkService.setViewer(pdfViewer);

    // 참고문헌/각주 링크를 클릭해도 조용히 아무 반응이 없던 버그의 원인: pdf.js의
    // 내부 scrollIntoView 유틸은 대상 페이지 div에서 offsetParent를 타고 올라가며
    // "실제 스크롤 컨테이너"를 자기가 알아서 찾는데, .pdfViewer에 확대 미리보기용
    // transform이 걸려 있으면(scale(1)이어도 마찬가지 — transform 유무 자체가
    // 기준) 그 탐색이 .pdfViewer 자신에서 멈춰버린다. .pdfViewer는 overflow:visible
    // 이라 스크롤이 안 되는 요소라서, scrollTop을 대입해도 조용히 무시되고 실제
    // 스크롤 컨테이너(.viewer-scroll)까지는 못 올라간다.
    // goToDestination 안에서만 보정한다 — pdfViewer.scrollPageIntoView 자체를
    // 덮어쓰면 확대/축소 시 pdf.js가 내부적으로 호출하는 재중심 로직까지 건드리게
    // 되는데, 그건 PdfPane.svelte가 이미 커서 기준으로 직접 스크롤을 보정하고
    // 있어서 손대면 오히려 그 보정과 충돌한다.
    // 아래 보정은 _origGoToDestination이 내부적으로 스크롤에 성공했든 실패했든
    // 상관없이, pageDiv.getBoundingClientRect()로 "지금 실제로 어디 있는지"를
    // 다시 재서 scrollTop을 절대값으로 다시 맞춘다 — 그래서 .pdfViewer에 transform이
    // 걸려있는지 여부와 무관하게 항상 정확하다(아래 style:transform을 휴지
    // 상태에서 없애도 이 보정 로직은 그대로 안전하다).
    const _origGoToDestination = linkService.goToDestination.bind(linkService);
    linkService.goToDestination = async (dest) => {
      await _origGoToDestination(dest);
      const pageView = pdfViewer._pages?.[pdfViewer.currentPageNumber - 1];
      const pageDiv = pageView?.div;
      if (!pageDiv || !scrollContainer) return;

      // 페이지 최상단이 아니라 "목적지 지점 자체"가 화면 맨 위에 오도록,
      // 페이지 안에서 목적지의 세로 위치(destTop, 페이지 상단 기준 CSS px)를
      // 구해서 더한다 — 참고문헌이 페이지 중간/아래쪽에 있으면 페이지
      // 최상단만 맞춰서는 그 위치가 화면 밖에 걸친다. pdf.js의
      // scrollPageIntoView가 XYZ 목적지에 내부적으로 쓰는 것과 동일한 좌표
      // 변환(pageView.viewport.convertToViewportPoint)을 그대로 가져다 쓴다 —
      // XYZ가 아니거나(Fit 계열) y값이 없거나 계산이 실패하면 기존과 같이
      // destTop=0(페이지 최상단)으로 안전하게 폴백한다.
      let destTop = 0;
      try {
        const explicitDest = Array.isArray(dest) ? dest : await pdfDocument?.getDestination(dest);
        const y = explicitDest?.[3];
        if (explicitDest?.[1]?.name === 'XYZ' && y != null && pageView.viewport) {
          const [, viewportY] = pageView.viewport.convertToViewportPoint(explicitDest[2] ?? 0, y);
          destTop = Math.max(0, viewportY);
        }
      } catch {
        destTop = 0;
      }

      const target =
        scrollContainer.scrollTop +
        (pageDiv.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top) +
        destTop;
      scrollContainer.scrollTop = Math.max(0, target);
    };

    const eventAbort = new AbortController();
    eventBus.on(
      'pagesinit',
      () => {
        fitWidthScale = measureFitWidthScale();
        commitScale();
        loading = false;
      },
      { signal: eventAbort.signal }
    );
    // 확대/스크롤로 페이지가 다시 그려질 때마다 pdf.js가 페이지 div의 자식을
    // 전부 비우므로(PDFPageView.reset), 우리 하이라이트 레이어도 그때마다 새로 붙인다.
    eventBus.on('pagerendered', ({ pageNumber }) => safeRenderHighlightLayer(pageNumber), {
      signal: eventAbort.signal,
    });
    eventBus.on(
      'textlayerrendered',
      ({ pageNumber, error: textLayerError }) => {
        // 텍스트 레이어가 나중에 붙어도 하이라이트가 그 아래로 가도록 순서를
        // 다시 잡아준다(레이어를 지웠다 다시 만들면서 위치가 정해진다).
        safeRenderHighlightLayer(pageNumber);
        if (textLayerError) return;
        calibrateTextLayer(pageNumber);
        // textlayerrendered는 임베드 폰트 로딩을 기다리지 않는다 — 캔버스
        // 렌더러는 폰트가 다 로드될 때까지 기다렸다가 그리는데, 텍스트
        // 레이어는 그 순간 쓸 수 있는(로딩 전이면 대체) 폰트로 바로 측정해
        // 버린다. 그래서 폰트 로딩이 늦게 끝나면 방금 잰 자연 폭이 대체
        // 폰트 기준이라 어긋난 채로 남는다 — "가끔은 맞고 가끔은 틀리는"
        // 현상의 원인. document.fonts.ready(모든 폰트 로딩 완료 시점) 뒤에
        // 같은 페이지를 한 번 더 재보정해서, 첫 시도가 로딩 전에 일어났어도
        // 최종적으로는 실제 폰트 기준 값으로 덮어쓴다.
        document.fonts.ready.then(() => calibrateTextLayer(pageNumber));
      },
      { signal: eventAbort.signal }
    );

    // 브라우저 창 크기뿐 아니라, 원문/노트 패널 사이 구분선을 드래그해서
    // 이 컨테이너 자체의 폭이 바뀌는 경우에도 폭 맞춤을 다시 재야 한다 —
    // 그건 window resize 이벤트로는 안 잡히므로, 컨테이너 자신의 크기를
    // 직접 관찰한다.
    let resizeTimer;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const nextFit = measureFitWidthScale();
        if (nextFit == null) return; // 탭 전환 등으로 숨겨진 동안엔 아예 건너뜀
        fitWidthScale = nextFit;
        commitScale();
      }, 180);
    });
    resizeObserver.observe(scrollContainer);

    // 참고: popstate/keydown(Alt+←) 리스너는 이 effect가 아니라 아래 별도
    // effect에서 등록한다 — 이 effect는 setupDone으로 "한 번만" 실행되는데,
    // 의존값(scrollContainer/viewerEl)이 나중에 바뀌면 Svelte가 정리 함수를
    // 먼저 돌리고 본문은 early return 해버려서 리스너가 영영 사라진다
    // (= 어느 순간부터 Alt+←를 눌러도 반응이 없는 고착 상태). 형광펜 리스너도
    // 같은 이유로 아래에서 별도 effect로 등록한다.

    prevSrc = src;
    prevZoom = zoom;
    loadAndShow(src);

    return () => {
      clearTimeout(resizeTimer);
      clearTimeout(zoomTimer);
      clearTimeout(errorTimer);
      resizeObserver.disconnect();
      eventAbort.abort();
    };
  });

  // 참고문헌 링크로 점프하기 전 위치를 history state에 남겨두므로
  // (onLinkClickCapture 참고), 뒤로가기 시 그 위치로 돌아간다.
  function onPopState(e) {
    if (typeof e.state?.pdfScrollTop !== 'number') return;
    scrollContainer?.scrollTo({ top: e.state.pdfScrollTop, behavior: 'auto' });
    jumpBackTop = null;
  }
  // Alt+← : 브라우저 전체 이동이 아니라 이 PDF 안에서 참고문헌 점프 전
  // 위치로 돌아가는 전용 단축키. 맥(Option+←)/Windows/Linux 구분 없이 전
  // 플랫폼에서 동일하게 동작한다. Windows/Linux에서 Alt+←는 브라우저
  // 네이티브 뒤로가기 기본 동작이기도 한데, keydown의 기본 동작이라
  // preventDefault()로 취소할 수 있다 — 아래에서 preventDefault()와
  // stopPropagation()을 함께 걸고, 리스너도 capture 단계에 등록해서 앱의
  // 다른 keydown 핸들러보다 먼저 이 이벤트를 소비한다.
  // e.key로 판별한다 — 메인 키보드 화살표와, NumLock이 꺼진 넘패드 4가
  // 둘 다 'ArrowLeft'로 들어와 어느 쪽으로 눌러도 같게 동작한다.
  // 입력창/메모 에디터에 포커스가 있을 때는 가로채지 않는다(타이핑을
  // 방해하면 안 되므로). 돌아갈 위치가 없으면(jumpBackTop == null)
  // 가로채지 않고 그대로 흘려보내, 브라우저 네이티브 뒤로가기가 평소대로
  // 동작하게 둔다.
  function onKeyDown(e) {
    if (e.key !== 'ArrowLeft' || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
    if (jumpBackTop == null) return;
    e.preventDefault();
    e.stopPropagation();
    jumpBack();
  }

  // scrollContainer/viewerEl과 무관하게 마운트 시 한 번만 등록되고 언마운트
  // 시에만 해제된다 — 위 setupDone effect처럼 도중에 재실행돼 리스너가
  // 사라지는 일이 없다(이 effect 본문은 어떤 반응형 값도 읽지 않는다).
  $effect(() => {
    // 예전엔 맥에서만 Option+←를 등록했지만(Windows/Linux의 Alt+←가 브라우저
    // 네이티브 뒤로가기와 겹쳐서), 이제 플랫폼 구분 없이 항상 등록한다 —
    // 네이티브 뒤로가기는 위 onKeyDown의 preventDefault()로 억제한다.
    // capture(true) 단계로 등록해서 앱의 다른 keydown 핸들러보다 먼저 잡는다.
    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  });

  // 형광펜 상호작용: 드래그가 끝나면(pointerup) 새로 선택한 영역을 보고 색상
  // 팔레트를, 이미 칠한 자리를 겹쳐 드래그했거나 선택 없이 기존 하이라이트를
  // 눌렀으면 삭제 확인 팝업을 띄운다 — 두 경우 모두 실제 삭제는 그 팝업의
  // 버튼을 눌러야 실행된다. 팝업 자체는 이 스크롤 컨테이너 밖(position: fixed)에
  // 있어서 팝업 버튼 클릭이 여기 다시 걸리지 않는다.
  // 이 리스너들은 위 초기화 effect와 분리해서, scrollContainer가 나중에 다른
  // 요소로 바뀌어도 항상 "지금의 그 요소"에 다시 붙게 한다. 예전엔 한 번만
  // 도는 effect 안에 같이 있어서, 그 effect가 재실행되면 정리만 되고 재등록은
  // 안 돼(setupDone early return) 형광펜이 통째로 죽는 경로가 있었다.
  $effect(() => {
    const container = scrollContainer;
    if (!container) return;

    container.addEventListener('click', onLinkClickCapture, true);
    container.addEventListener('pointerdown', onViewerPointerDown);
    container.addEventListener('pointerup', onViewerPointerUp);
    container.addEventListener('scroll', onViewerScroll, { passive: true });

    return () => {
      container.removeEventListener('click', onLinkClickCapture, true);
      container.removeEventListener('pointerdown', onViewerPointerDown);
      container.removeEventListener('pointerup', onViewerPointerUp);
      container.removeEventListener('scroll', onViewerScroll);
    };
  });
</script>

{#if loading}<p class="pdf-status">PDF 페이지를 준비하는 중…</p>{/if}
{#if error}
  <div class="pdf-status error">
    <p>PDF를 불러오지 못했어요: {error}</p>
    <details class="pdf-error-detail">
      <summary>기술 정보 (스크린샷으로 공유해주세요)</summary>
      <pre>{errorDetail}</pre>
    </details>
  </div>
{/if}
<!-- 확대율이 막 바뀐 직후(재렌더 debounce 150ms 동안)에만 CSS 미리보기용
     transform을 걸고, 재렌더가 끝나 zoom === renderedZoom이 되면(=대부분의
     시간) transform 자체를 아예 없앤다(scale(1)도 안 남긴다). transform이
     걸려 있으면 값이 1이어도 그 자체로 별도 합성 레이어로 승격되는데, 이게
     텍스트 레이어(--scale-x 기반 span 배치)와 캔버스가 서로 다른 레이어에서
     독립적으로 기기 픽셀에 스냅되게 만들어 fractional 배율(Windows 125%/150%)
     에서 텍스트 선택 하이라이트가 캔버스 글자와 미세하게 어긋나는 걸 키우는
     원인으로 의심된다. 공식 pdf.js 데모 뷰어엔 이런 상시 transform 래퍼가
     없어서 같은 문제가 덜 보인다 — 그래서 휴지 상태에선 우리도 transform을
     완전히 없애 그 데모와 같은 조건으로 맞춘다. -->
<div
  class="pdfViewer"
  bind:this={viewerEl}
  style:transform={zoom === renderedZoom ? undefined : `scale(${zoom / renderedZoom})`}
></div>

<!-- 형광펜 팝업. 스크롤 컨테이너 안쪽에 있으면 잘려나가므로 position: fixed로
     띄운다 — .pdfViewer(확대 미리보기 transform이 걸리는 요소)의 자식이 아니라
     형제라서 transform의 영향도 받지 않는다.
     바깥 .highlight-popup은 위치만 잡는 래퍼고(애니메이션 없음), 실제 카드
     모양과 등장/퇴장 모션은 안쪽 .popup-card가 갖는다 — suppressLinksUnderPopup()이
     재는 사각형을 애니메이션 중에도 최종 크기로 유지하기 위한 구조다. -->
{#if activePopup && popupView}
  <div
    class="highlight-popup"
    style:left={`${popupView.x}px`}
    style:top={`${popupView.y}px`}
    style:transform={popupView.above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'}
  >
    <div
      class="popup-card"
      class:is-below={!popupView.above}
      class:is-danger={popupView.kind === 'delete'}
      class:has-hint={popupView.kind === 'color' && !!lastColor}
      style:transform-origin={popupView.above ? '50% 100%' : '50% 0%'}
      in:popupIn={{ above: popupView.above }}
      out:popupOut={{ above: popupView.above }}
    >
      {#if popupView.kind === 'color'}
        <div class="popup-swatches" role="toolbar" aria-label="형광펜 색상">
          {#each HIGHLIGHT_COLORS as color (color.value)}
            <button
              class="highlight-swatch"
              style:--swatch-color={color.value}
              title={`${color.label} 형광펜`}
              aria-label={`${color.label} 형광펜으로 칠하기`}
              onclick={() => createHighlight(color.value)}
            ></button>
          {/each}
        </div>
        <!-- 마지막 색을 아직 모르는 첫 사용 때는 안내해도 쓸 수 없으므로 감춘다. -->
        {#if lastColor}
          <p class="popup-hint">{quickPaintHint}</p>
        {/if}
      {:else}
        <button class="highlight-delete" onclick={removeHighlight}>
          <svg
            class="highlight-delete-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 7h16" />
            <path d="M9.5 7V5.4A1.4 1.4 0 0 1 10.9 4h2.2a1.4 1.4 0 0 1 1.4 1.4V7" />
            <path d="M6.5 7l.8 11.6A1.5 1.5 0 0 0 8.8 20h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
            <path d="M10.4 10.8v5.6M13.6 10.8v5.6" />
          </svg>
          형광펜 지우기
        </button>
      {/if}
    </div>
  </div>
{/if}

{#if highlightError}
  <p class="highlight-error" role="alert">{highlightError}</p>
{/if}

<style>
  .pdfViewer {
    /* 세로 앵커링은 부모(PdfPane.svelte)가 scrollTop을 직접 보정하는
       방식으로 처리한다. origin이 여기서 움직이면 스케일이 걸린 상태에서
       기준점이 바뀌어 화면이 튀므로, 항상 상단 중앙으로 고정해둔다. */
    transform-origin: 50% 0;
  }

  /* 페이지 낱장의 테두리/그림자는 pdf.js 기본값(투명 9px 보더) 대신
     Folio 팔레트에 맞춘 우리 것으로 — removePageBorders 옵션으로 기본값은
     꺼두고 여기서만 얇게 덧입힌다. */
  :global(.pdfViewer .page) {
    border-radius: 3px;
    box-shadow: 0 4px 18px rgba(77, 47, 33, 0.15);
  }

  /* 하이라이트 레이어. 페이지 div 안에 DOM API로 직접 만들어 넣기 때문에
     Svelte의 스코프 클래스가 안 붙어서 :global로 선언한다.
     텍스트 레이어(z-index: 0)보다 DOM 순서상 앞에 있어서 글자 아래에 깔리고,
     mix-blend-mode: multiply 덕분에 칠해도 글자가 그대로 읽힌다.
     클릭 판정은 사각형 좌표로 직접 하므로(findHighlightAt) 포인터 이벤트는
     받지 않는다 — 텍스트 드래그 선택을 방해하면 안 되기 때문. */
  :global(.folio-highlight-layer) {
    position: absolute;
    z-index: 0;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  :global(.folio-highlight) {
    position: absolute;
    border-radius: 1px;
    opacity: 0.42;
    mix-blend-mode: multiply;
  }

  /* 위치만 잡는 래퍼 — 여기엔 애니메이션도 여백도 없다. 그래야 이 요소의
     사각형이 곧 카드의 최종 크기/위치가 되고, suppressLinksUnderPopup()이
     겹친 참고문헌 링크를 정확히 찾아낸다. 클릭은 안쪽 카드만 받는다. */
  .highlight-popup {
    --popup-bg: var(--surface);
    --popup-border: var(--border);
    --popup-shadow: 0 1px 2px rgba(77, 47, 33, 0.07), 0 3px 8px -3px rgba(77, 47, 33, 0.14),
      0 14px 30px -8px rgba(77, 47, 33, 0.28);
    --swatch-ring: rgba(0, 0, 0, 0.16);
    position: fixed;
    z-index: 40;
    pointer-events: none;
  }

  .popup-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.28rem;
    padding: 0.32rem;
    border: 1px solid var(--popup-border);
    border-radius: 13px;
    background: var(--popup-bg);
    box-shadow: var(--popup-shadow);
    pointer-events: auto;
  }

  /* 단축키 안내가 붙는 색상 팔레트만 세로로 쌓는다 — 삭제 확인 팝업은 기존
     그대로 한 줄이다. */
  .popup-card.has-hint {
    flex-direction: column;
    align-items: stretch;
    gap: 0.3rem;
    padding-bottom: 0.28rem;
  }

  .popup-swatches {
    display: flex;
    align-items: center;
    gap: 0.28rem;
  }

  /* 존재만 알아챌 수 있으면 되는 보조 문구라, 눈에 띄지 않게 작고 흐리게 둔다. */
  .popup-hint {
    margin: 0;
    text-align: center;
    font-size: 0.66rem;
    line-height: 1.2;
    color: var(--text-muted);
    white-space: nowrap;
  }

  /* 선택 영역을 가리키는 꼬리. popupAnchor()가 선택 영역과 팝업 사이에 8px을
     띄워두므로 그 틈에 들어간다. position: absolute라 카드의 레이아웃 박스는
     그대로다(= 래퍼 사각형에 영향 없음). */
  .popup-card::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -6px;
    width: 10px;
    height: 10px;
    border: 1px solid var(--popup-border);
    border-top: 0;
    border-left: 0;
    border-bottom-right-radius: 2px;
    background: var(--popup-bg);
    transform: translateX(-50%) rotate(45deg);
  }

  /* 팝업이 선택 영역 아래에 뜨는 경우엔 꼬리도 위쪽을 향한다. */
  .popup-card.is-below::after {
    top: -6px;
    bottom: auto;
    border: 1px solid var(--popup-border);
    border-bottom: 0;
    border-right: 0;
    border-bottom-right-radius: 0;
    border-top-left-radius: 2px;
  }

  /* 삭제 확인 팝업은 "되돌릴 수 없는 동작"이라는 게 한눈에 보이도록
     카드 자체를 위험 색으로 물들인다. */
  .popup-card.is-danger {
    --popup-bg: color-mix(in srgb, var(--danger-soft) 62%, var(--surface));
    --popup-border: color-mix(in srgb, var(--danger) 34%, var(--border));
  }

  .highlight-swatch {
    width: 25px;
    height: 25px;
    padding: 0;
    border-radius: 50%;
    background: var(--swatch-color);
    box-shadow:
      inset 0 0 0 1px var(--swatch-ring),
      0 1px 2px rgba(77, 47, 33, 0.16);
    transition:
      transform 160ms cubic-bezier(0.2, 0.8, 0.3, 1),
      box-shadow 160ms ease;
  }

  .highlight-swatch:hover,
  .highlight-swatch:focus-visible {
    transform: translateY(-1px) scale(1.16);
    box-shadow:
      inset 0 0 0 1px var(--swatch-ring),
      0 4px 10px -2px rgba(77, 47, 33, 0.35);
  }

  .highlight-swatch:active {
    transform: translateY(0) scale(1.02);
  }

  .highlight-delete {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.55rem 0.3rem 0.45rem;
    border-radius: 9px;
    background: transparent;
    color: var(--danger);
    font-size: 0.74rem;
    font-weight: 600;
    transition:
      background 140ms ease,
      transform 140ms ease;
  }

  .highlight-delete-icon {
    width: 15px;
    height: 15px;
    flex: 0 0 auto;
  }

  .highlight-delete:hover {
    background: color-mix(in srgb, var(--danger) 14%, transparent);
  }

  .highlight-delete:active {
    background: color-mix(in srgb, var(--danger) 22%, transparent);
    transform: scale(0.98);
  }

  /* 터치(굵은 포인터) 환경에서만 인터랙션 요소를 손가락 기준(iOS 44pt / Android
     48dp 권장)으로 키운다. hover:none 대신 pointer:coarse로 판정해, 터치스크린이면서
     마우스 커서도 쓰는 하이브리드 기기에서도 실제 입력 수단이 손가락일 때만 적용되게
     한다. 데스크톱(마우스) 크기는 그대로 둔다. */
  @media (pointer: coarse) {
    .popup-card {
      gap: 0.4rem;
      padding: 0.4rem;
    }

    .popup-swatches {
      gap: 0.55rem;
    }

    /* 25px → 44px: iOS 최소 권장(44pt) 충족. 간격도 4.5px → 8.8px로 벌려
       옆 스와치 오터치를 줄인다. */
    .highlight-swatch {
      width: 44px;
      height: 44px;
    }

    /* 삭제 버튼도 히트 영역 높이를 최소 44px로 맞추고 아이콘/글자를 키운다. */
    .highlight-delete {
      min-height: 44px;
      padding: 0.5rem 0.85rem 0.5rem 0.7rem;
      gap: 0.4rem;
      font-size: 0.82rem;
    }

    .highlight-delete-icon {
      width: 18px;
      height: 18px;
    }
  }

  @media (prefers-color-scheme: dark) {
    .highlight-popup {
      --popup-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 3px 10px -3px rgba(0, 0, 0, 0.45),
        0 16px 34px -8px rgba(0, 0, 0, 0.6);
      --swatch-ring: rgba(255, 255, 255, 0.28);
    }

    .highlight-swatch {
      box-shadow:
        inset 0 0 0 1px var(--swatch-ring),
        0 1px 2px rgba(0, 0, 0, 0.4);
    }

    .highlight-swatch:hover,
    .highlight-swatch:focus-visible {
      box-shadow:
        inset 0 0 0 1px var(--swatch-ring),
        0 4px 12px -2px rgba(0, 0, 0, 0.6);
    }
  }

  /* 모션을 줄이도록 설정한 환경에서는 hover/active의 움직임도 없앤다
     (등장/퇴장 트랜지션은 popupMotion()이 duration 0으로 처리한다). */
  @media (prefers-reduced-motion: reduce) {
    .highlight-swatch,
    .highlight-delete {
      transition: none;
    }

    .highlight-swatch:hover,
    .highlight-swatch:focus-visible,
    .highlight-swatch:active,
    .highlight-delete:active {
      transform: none;
    }
  }

  .highlight-error {
    position: fixed;
    z-index: 40;
    bottom: 1.5rem;
    left: 50%;
    padding: 0.45rem 0.8rem;
    transform: translateX(-50%);
    border-radius: 10px;
    background: var(--surface);
    box-shadow: var(--shadow-sm), 0 6px 20px rgba(77, 47, 33, 0.18);
    color: var(--text-soft);
    font-size: 0.72rem;
  }

  .pdf-error-detail {
    max-width: 420px;
    margin: 0.75rem auto 0;
    text-align: left;
  }

  .pdf-error-detail summary {
    cursor: pointer;
    font-size: 0.72rem;
  }

  .pdf-error-detail pre {
    margin-top: 0.5rem;
    padding: 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-subtle);
    color: var(--text-soft);
    font-size: 0.68rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    user-select: text;
  }
</style>
