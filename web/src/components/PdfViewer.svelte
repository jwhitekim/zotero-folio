<script>
  // PDF 렌더링/확대·축소/중앙 정렬/텍스트·주석 레이어는 전부 pdf.js가 자기
  // 공식 웹 뷰어(Chrome 내장 뷰어 등도 같은 계열)에 쓰는 PDFViewer 엔진에
  // 맡긴다 — 예전엔 캔버스를 직접 그리고 스크롤 위치로 중앙 정렬을 손수
  // 계산했는데, 그 수식이 확대 시 비대칭하게 밀리는 등 버그가 반복돼서
  // pdfjs-dist에 이미 포함된 검증된 엔진으로 갈아탔다.
  import '../utils/safari-polyfills.js';
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
    rectsOverlap,
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
  // 기존 하이라이트를 클릭했을 때 뜨는 삭제 팝업.
  let deletePopup = $state(null); // { key, x, y, above }
  let highlightBusy = $state(false);
  let highlightError = $state('');
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
    const items = highlights.filter((h) => h.pageIndex === pageIndex);
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

  function renderAllHighlightLayers() {
    for (let i = 1; i <= pageViews().length; i += 1) renderHighlightLayer(i);
  }

  async function loadHighlights() {
    highlights = [];
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
    }

    return built;
  }

  // 팝업은 position: fixed라 화면 좌표를 그대로 쓴다. 위쪽 공간이 모자라면
  // 선택 영역 아래로 내려서 띄운다.
  function popupAnchor(rect) {
    const above = rect.top > 96;
    return {
      x: Math.min(window.innerWidth - 100, Math.max(100, rect.left + rect.width / 2)),
      y: above ? rect.top - 8 : rect.bottom + 8,
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
    if (isInsidePopup(e)) return;
    closePopups();
  }

  // 새로 칠하려는 영역(PDF 좌표, 페이지별)이 이미 있는 하이라이트와 겹치는지 본다.
  // 겹치면 "덧칠"이 아니라 "지우기"로 취급한다 — 사용자가 이미 칠한 자리를
  // 다시 드래그하는 건 대개 지우고 싶어서다.
  function findOverlappingHighlights(items) {
    const keys = new Set();
    for (const item of items) {
      for (const h of highlights) {
        if (h.pageIndex !== item.pageIndex) continue;
        if (item.rects.some((r) => h.rects.some((hr) => rectsOverlap(r, hr)))) {
          keys.add(h.key);
        }
      }
    }
    return [...keys];
  }

  function onViewerPointerUp(e) {
    if (!itemKey || highlightBusy || isInsidePopup(e)) return;

    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const items = buildHighlightsFromRange(range);
      if (items.length) {
        const overlapping = findOverlappingHighlights(items);
        if (overlapping.length) {
          window.getSelection()?.removeAllRanges();
          toggleOffHighlights(overlapping);
        } else {
          colorPopup = { items, ...popupAnchor(range.getBoundingClientRect()) };
        }
        return;
      }
    }

    const hit = findHighlightAt(e.clientX, e.clientY);
    deletePopup = hit ? { key: hit.key, ...popupAnchor(hit.rect) } : null;
  }

  async function createHighlight(color) {
    const items = colorPopup?.items ?? [];
    closePopups();
    window.getSelection()?.removeAllRanges();
    if (!items.length || !itemKey) return;

    highlightBusy = true;
    try {
      for (const item of items) {
        const created = await api.createHighlight(itemKey, { ...item, color });
        highlights = [...highlights, created];
      }
    } catch (err) {
      showHighlightError(`하이라이트를 저장하지 못했어요: ${err.message}`);
    } finally {
      highlightBusy = false;
    }
  }

  // 겹치는 자리를 다시 드래그해서 지우는 경로. 클릭 한 번으로 지우는
  // removeHighlight와 API는 같지만, 여러 하이라이트에 걸쳐 드래그했을 수 있어
  // 키 목록을 통째로 받는다.
  async function toggleOffHighlights(keys) {
    if (!keys.length || !itemKey) return;

    highlightBusy = true;
    try {
      for (const key of keys) {
        await api.deleteHighlight(itemKey, key);
      }
      highlights = highlights.filter((h) => !keys.includes(h.key));
    } catch (err) {
      showHighlightError(`하이라이트를 지우지 못했어요: ${err.message}`);
    } finally {
      highlightBusy = false;
    }
  }

  async function removeHighlight() {
    const key = deletePopup?.key;
    closePopups();
    if (!key || !itemKey) return;

    highlightBusy = true;
    try {
      await api.deleteHighlight(itemKey, key);
      highlights = highlights.filter((h) => h.key !== key);
    } catch (err) {
      showHighlightError(`하이라이트를 지우지 못했어요: ${err.message}`);
    } finally {
      highlightBusy = false;
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
    eventBus.on('pagerendered', ({ pageNumber }) => renderHighlightLayer(pageNumber), {
      signal: eventAbort.signal,
    });
    eventBus.on(
      'textlayerrendered',
      ({ pageNumber, error: textLayerError }) => {
        // 텍스트 레이어가 나중에 붙어도 하이라이트가 그 아래로 가도록 순서를
        // 다시 잡아준다(레이어를 지웠다 다시 만들면서 위치가 정해진다).
        renderHighlightLayer(pageNumber);
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

    // 참고문헌 링크로 점프하기 전 위치를 history state에 남겨두므로
    // (onLinkClickCapture 참고), 뒤로가기 시 그 위치로 돌아간다.
    const onPopState = (e) => {
      if (typeof e.state?.pdfScrollTop !== 'number') return;
      scrollContainer?.scrollTo({ top: e.state.pdfScrollTop, behavior: 'auto' });
      jumpBackTop = null;
    };
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
    const onKeyDown = (e) => {
      if (e.key !== 'ArrowLeft' || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (jumpBackTop == null) return;
      e.preventDefault();
      e.stopPropagation();
      jumpBack();
    };

    window.addEventListener('popstate', onPopState);
    // 예전엔 맥에서만 Option+←를 등록했지만(Windows/Linux의 Alt+←가 브라우저
    // 네이티브 뒤로가기와 겹쳐서), 이제 플랫폼 구분 없이 항상 등록한다 —
    // 네이티브 뒤로가기는 위 onKeyDown의 preventDefault()로 억제한다.
    // capture(true) 단계로 등록해서 앱의 다른 keydown 핸들러보다 먼저 잡는다.
    // 브라우저 뒤로가기로 돌아가는 경로(위 popstate)도 그대로 함께 살아 있다.
    window.addEventListener('keydown', onKeyDown, true);
    scrollContainer?.addEventListener('click', onLinkClickCapture, true);

    // 형광펜 상호작용: 드래그가 끝나면(pointerup) 선택 영역을 보고 색상 팔레트를,
    // 선택 없이 기존 하이라이트를 눌렀으면 삭제 팝업을 띄운다. 팝업 자체는 이
    // 스크롤 컨테이너 밖(position: fixed)에 있어서 팝업 버튼 클릭이 여기 다시
    // 걸리지 않는다.
    scrollContainer?.addEventListener('pointerdown', onViewerPointerDown);
    scrollContainer?.addEventListener('pointerup', onViewerPointerUp);
    scrollContainer?.addEventListener('scroll', closePopups, { passive: true });

    prevSrc = src;
    prevZoom = zoom;
    loadAndShow(src);

    return () => {
      clearTimeout(resizeTimer);
      clearTimeout(zoomTimer);
      clearTimeout(errorTimer);
      resizeObserver.disconnect();
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKeyDown, true);
      scrollContainer?.removeEventListener('click', onLinkClickCapture, true);
      scrollContainer?.removeEventListener('pointerdown', onViewerPointerDown);
      scrollContainer?.removeEventListener('pointerup', onViewerPointerUp);
      scrollContainer?.removeEventListener('scroll', closePopups);
      eventAbort.abort();
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

<!-- 형광펜 팝업 2종. 스크롤 컨테이너 안쪽에 있으면 잘려나가므로 position: fixed로
     띄운다 — .pdfViewer(확대 미리보기 transform이 걸리는 요소)의 자식이 아니라
     형제라서 transform의 영향도 받지 않는다. -->
{#if colorPopup}
  <div
    class="highlight-popup"
    style:left={`${colorPopup.x}px`}
    style:top={`${colorPopup.y}px`}
    style:transform={colorPopup.above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'}
    role="toolbar"
    aria-label="형광펜 색상"
  >
    {#each HIGHLIGHT_COLORS as color (color.value)}
      <button
        class="highlight-swatch"
        style:background={color.value}
        title={`${color.label} 형광펜`}
        aria-label={`${color.label} 형광펜으로 칠하기`}
        onclick={() => createHighlight(color.value)}
      ></button>
    {/each}
  </div>
{/if}

{#if deletePopup}
  <div
    class="highlight-popup"
    style:left={`${deletePopup.x}px`}
    style:top={`${deletePopup.y}px`}
    style:transform={deletePopup.above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)'}
  >
    <button class="highlight-delete" onclick={removeHighlight}>형광펜 지우기</button>
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

  .highlight-popup {
    position: fixed;
    z-index: 40;
    display: flex;
    gap: 0.3rem;
    padding: 0.3rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    box-shadow: var(--shadow-sm), 0 6px 20px rgba(77, 47, 33, 0.18);
  }

  .highlight-swatch {
    width: 22px;
    height: 22px;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 6px;
    transition: transform 140ms ease;
  }

  .highlight-swatch:hover {
    transform: scale(1.12);
  }

  .highlight-delete {
    padding: 0.25rem 0.55rem;
    border-radius: 6px;
    background: transparent;
    color: var(--text-soft);
    font-size: 0.72rem;
    font-weight: 600;
  }

  .highlight-delete:hover {
    background: var(--accent-pale);
    color: var(--accent);
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
