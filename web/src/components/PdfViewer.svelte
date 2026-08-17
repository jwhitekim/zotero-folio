<script>
  // PDF.js 캔버스 위에 텍스트 레이어를 겹쳐 원문의 선명도는 유지하면서
  // 텍스트 선택과 복사가 가능하도록 렌더링한다.
  import { onMount } from 'svelte';
  import '../utils/safari-polyfills.js';
  import * as pdfjsLib from 'pdfjs-dist';
  import pdfWorkerUrl from '../utils/pdf-worker-entry.js?worker&url';

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  let { src, zoom = 1, onLayoutReady } = $props();

  let container = $state();
  let loading = $state(true);
  let error = $state('');
  let errorDetail = $state('');
  let resizeToken = $state(0);
  let pdfDocument;
  let loadedSrc = '';
  let renderVersion = 0;
  // 같은 src를 한 번이라도 화면에 보여준 적 있는지. 최초 로딩만 아니면(=확대/축소나
  // 리사이즈로 인한 재렌더링) 이미 보여준 내용을 계속 유지하다가 새 내용이 전부
  // 준비된 뒤 한 번에 교체한다 — 매번 로딩 문구가 깜빡이거나 캔버스가 비었다
  // 다시 그려지는 번쩍임을 없애기 위해서다.
  let shownSrc = null;
  let zoomTimer;
  // 실제로 화면에 그려진(선명한) 캔버스가 어떤 배율 기준인지. 재렌더링은
  // debounce로 미뤄지지만, 그 사이엔 이 값 대비 zoom 비율만큼 CSS로 즉시
  // 확대 미리보기를 보여준다 — 스크롤 중에도 계속 커지는 느낌을 위해서다.
  let renderedZoom = $state(1);
  // 참고문헌 링크로 점프하기 직전의 스크롤 위치. null이면 "돌아가기" 버튼을
  // 숨긴다. 브라우저 뒤로가기(단축키는 OS/브라우저마다 달라 안 믿을 수
  // 있음)에 기대지 않고도 확실하게 원위치로 돌아갈 수 있게 화면에 버튼을
  // 둔다.
  let jumpBackTop = $state(null);

  async function getDocument(url) {
    if (pdfDocument && loadedSrc === url) return pdfDocument;
    pdfDocument = await pdfjsLib.getDocument({ url }).promise;
    loadedSrc = url;
    return pdfDocument;
  }

  // 목적지 배열(예: [ref, {name:'XYZ'}, left, top, zoom])에서 페이지 안에서의
  // 정확한 y좌표(PDF 좌표계)를 뽑아낸다. 흔한 두 형태(XYZ, FitH류)만 처리하고
  // 나머지(Fit 전체 등 y가 의미 없는 경우)는 null — 그럴 땐 페이지 맨 위로만 이동.
  function destTopY(typeName, args) {
    if (typeName === 'XYZ' && typeof args[1] === 'number') return args[1];
    if ((typeName === 'FitH' || typeName === 'FitBH') && typeof args[0] === 'number') return args[0];
    return null;
  }

  // 본문의 참고문헌 번호([39] 등)나 각주 클릭 시 이동(GoTo)하는 내부 링크,
  // 그리고 외부 URL 링크를 처리하는 최소 링크 서비스. pdf.js의
  // AnnotationLayer가 요구하는 인터페이스 중 실제로 쓰는 부분만 구현한다 —
  // 우리는 pdf.js의 PDFViewer(전체 뷰어 프레임워크)를 쓰지 않고 페이지를
  // 직접 그리므로, 그 프레임워크가 제공하는 PDFLinkService를 그대로 쓸 수
  // 없다.
  const linkService = {
    externalLinkEnabled: true,
    getDestinationHash: () => '#',
    getAnchorUrl: () => '#',
    addLinkAttributes(link, url) {
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    },
    async goToDestination(dest) {
      if (!pdfDocument || !container) return;
      const explicitDest = typeof dest === 'string' ? await pdfDocument.getDestination(dest) : await dest;
      if (!Array.isArray(explicitDest)) return;

      const [destRef, destType, ...destArgs] = explicitDest;
      let pageIndex;
      if (destRef && typeof destRef === 'object') {
        pageIndex = await pdfDocument.getPageIndex(destRef);
      } else if (Number.isInteger(destRef)) {
        pageIndex = destRef;
      } else {
        return;
      }

      const pageWrap = container.querySelector(`[data-page-number="${pageIndex + 1}"]`);
      const scrollEl = container.closest('.pdf-scroll');
      if (!pageWrap || !scrollEl) return;

      // 페이지 맨 위가 아니라, 목적지가 그 페이지 안의 어디쯤인지까지
      // 정확히 계산한다(참고문헌 목록처럼 한 페이지에 여러 항목이 있을 때
      // 필요한 항목이 화면 밖에 남는 걸 막기 위해).
      const topY = destTopY(destType?.name, destArgs);
      let offsetInPage = 0;
      if (topY != null) {
        const page = await pdfDocument.getPage(pageIndex + 1);
        const scale = pageWrap.offsetWidth / page.getViewport({ scale: 1 }).width;
        const [, y] = page.getViewport({ scale }).convertToViewportPoint(0, topY);
        offsetInPage = Math.max(0, y - 24);
      }

      const pageRect = pageWrap.getBoundingClientRect();
      const scrollRect = scrollEl.getBoundingClientRect();
      const targetTop = scrollEl.scrollTop + (pageRect.top - scrollRect.top) + offsetInPage;

      // 브라우저 뒤로가기로도 점프 전 위치로 돌아올 수 있도록 history에
      // 남겨두고(URL은 안 바꿈), 화면에도 "돌아가기" 버튼을 띄운다.
      history.pushState({ pdfScrollTop: scrollEl.scrollTop }, '', location.href);
      jumpBackTop = scrollEl.scrollTop;

      scrollEl.scrollTo({ top: targetTop, behavior: 'auto' });
    },
  };

  function jumpBack() {
    if (jumpBackTop == null) return;
    container?.closest('.pdf-scroll')?.scrollTo({ top: jumpBackTop, behavior: 'auto' });
    jumpBackTop = null;
  }

  async function paintPage(entry, outputScale) {
    const { page, viewport, pageWrap } = entry;

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page';
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    pageWrap.appendChild(canvas);

    const textLayerElement = document.createElement('div');
    textLayerElement.className = 'textLayer';
    pageWrap.appendChild(textLayerElement);

    const annotationLayerElement = document.createElement('div');
    annotationLayerElement.className = 'annotationLayer';
    pageWrap.appendChild(annotationLayerElement);

    await page.render({
      canvasContext: canvas.getContext('2d'),
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
    }).promise;

    const textContent = await page.getTextContent();
    const textLayer = new pdfjsLib.TextLayer({
      textContentSource: textContent,
      container: textLayerElement,
      viewport,
    });
    await textLayer.render();

    const annotations = await page.getAnnotations({ intent: 'display' });
    const annotationLayer = new pdfjsLib.AnnotationLayer({
      div: annotationLayerElement,
      page,
      viewport: viewport.clone({ dontFlip: true }),
      linkService,
    });
    await annotationLayer.render({ annotations });
  }

  async function render(url, zoomLevel) {
    const version = ++renderVersion;
    const isFirstShow = shownSrc !== url;
    if (isFirstShow) loading = true;
    error = '';

    try {
      const pdf = await getDocument(url);
      if (version !== renderVersion) return;

      const availableWidth = Math.min(container.clientWidth, 900);
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);

      // 1단계: 모든 페이지의 크기를 먼저 계산해 wrap을 만들어둔다. 아직 DOM에는
      // 붙이지 않는다 — 오래 걸리는 pdf.getPage() await 도중 새 확대/축소 요청이
      // 들어와 이 render() 호출이 취소되면(버전 불일치), 이미 붙여놓은 조각이
      // 다음 render()가 지워낸 컨테이너에 뒤늦게 끼어들어 레이아웃이 깨질 수
      // 있기 때문이다.
      const pages = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        if (version !== renderVersion) return;

        const unscaled = page.getViewport({ scale: 1 });
        const scale = (availableWidth / unscaled.width) * zoomLevel;
        const viewport = page.getViewport({ scale });

        const pageWrap = document.createElement('div');
        pageWrap.className = 'pdf-page-wrap';
        pageWrap.dataset.pageNumber = String(pageNum);
        pageWrap.style.width = `${viewport.width}px`;
        pageWrap.style.height = `${viewport.height}px`;
        pageWrap.style.setProperty('--total-scale-factor', String(viewport.scale));

        pages.push({ pageNum, page, viewport, pageWrap });
      }

      if (version !== renderVersion) return;

      if (isFirstShow) {
        // 최초 로딩: 배치를 먼저 확정해 커서 앵커/전체 높이를 잡아 화면에 붙이고,
        // 페이지는 그린 순서대로 바로바로 공개한다 — 긴 논문일수록 첫 페이지를
        // 빨리 보여주는 게 중요하다.
        renderedZoom = zoomLevel;
        // Svelte의 style:transform 반응형 갱신은 비동기라, 바로 아래
        // onLayoutReady()가 가로 중앙 정렬을 계산할 때 CSS 확대값이 아직
        // 리셋 전(scale(1) 아님)일 수 있다 — 동기적으로 먼저 맞춰둔다.
        container.style.transform = 'scale(1)';
        container.replaceChildren(...pages.map((p) => p.pageWrap));
        onLayoutReady?.();

        for (const entry of pages) {
          if (version !== renderVersion) return;
          await paintPage(entry, outputScale);
          if (version !== renderVersion) return;

          if (entry.pageNum === 1) {
            loading = false;
            shownSrc = url;
          }
        }
      } else {
        // 재렌더링(확대/축소·리사이즈): 이미 화면에 뭔가 보이고 있으므로, 전부
        // 그릴 때까지 기존 내용을 그대로 둔 채 기다렸다가 한 번에 교체한다.
        // 중간에 빈 화면이나 로딩 문구가 끼어들며 번쩍이는 걸 막기 위해서다.
        for (const entry of pages) {
          await paintPage(entry, outputScale);
          if (version !== renderVersion) return;
        }
        renderedZoom = zoomLevel;
        // Svelte의 style:transform 반응형 갱신은 비동기라, 바로 아래
        // onLayoutReady()가 가로 중앙 정렬을 계산할 때 CSS 확대값이 아직
        // 리셋 전(scale(1) 아님)일 수 있다 — 동기적으로 먼저 맞춰둔다.
        container.style.transform = 'scale(1)';
        container.replaceChildren(...pages.map((p) => p.pageWrap));
        onLayoutReady?.();
      }
    } catch (err) {
      if (version === renderVersion) {
        error = err.message;
        errorDetail = [
          `${err.name || 'Error'}: ${err.message}`,
          err.stack || '(스택 정보 없음)',
          navigator.userAgent,
        ].join('\n');
        console.error('[PdfViewer]', err);
      }
    } finally {
      if (version === renderVersion) loading = false;
    }
  }

  // 이전 값과 비교해 "배율만 바뀐 요청"을 가려내기 위한 순수 추적용 변수 —
  // src/zoom을 반응형으로 미러링하는 게 아니라 매번 직접 갱신하므로 일부러 $state를 쓰지 않는다.
  let prevSrc;
  let prevZoom;

  $effect(() => {
    resizeToken;
    const s = src;
    const z = zoom;
    if (!container) return;

    // 배율만 바뀐 경우(휠/버튼으로 연속 확대·축소)에는 재렌더링을 잠깐 미룬다.
    // 그렇지 않으면 휠 이벤트가 들어올 때마다 매번 다시 그리면서 번쩍이게 된다.
    // src가 바뀌었거나(새 논문) 리사이즈로 인한 요청은 즉시 반영한다.
    const zoomOnlyChange = s === prevSrc && z !== prevZoom;
    prevSrc = s;
    prevZoom = z;

    clearTimeout(zoomTimer);
    if (zoomOnlyChange) {
      zoomTimer = setTimeout(() => render(s, z), 150);
    } else {
      render(s, z);
    }
  });

  onMount(() => {
    let timer;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => (resizeToken += 1), 180);
    };
    // 참고문헌 링크로 점프하기 전 위치를 history state에 남겨두므로
    // (linkService.goToDestination 참고), 뒤로가기 시 그 위치로 돌아간다.
    const onPopState = (e) => {
      if (typeof e.state?.pdfScrollTop !== 'number') return;
      container?.closest('.pdf-scroll')?.scrollTo({ top: e.state.pdfScrollTop, behavior: 'auto' });
      jumpBackTop = null;
    };
    // Option(Alt)+← : 브라우저 전체 이동이 아니라 이 PDF 안에서 참고문헌
    // 점프 전 위치로 돌아가는 전용 단축키. 입력창/메모 에디터에 포커스가
    // 있을 때는 가로채지 않는다(타이핑을 방해하면 안 되므로).
    const onKeyDown = (e) => {
      if (e.key !== 'ArrowLeft' || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (jumpBackTop == null) return;
      e.preventDefault();
      jumpBack();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      clearTimeout(zoomTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKeyDown);
      renderVersion += 1;
    };
  });
</script>

<div class="pdf-viewer" class:is-loading={loading}>
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
  {#if jumpBackTop !== null}
    <button type="button" class="pdf-jump-back" onclick={jumpBack} title="Option+← 로도 돌아갈 수 있어요">
      ← 돌아가기
    </button>
  {/if}
  <div class="pdf-pages" bind:this={container} style:transform={`scale(${zoom / renderedZoom})`}></div>
</div>

<style>
  .pdf-pages {
    /* 가로/세로 앵커링은 전부 부모(PaperDetailSplit)가 scrollTop/Left를
       직접 보정하는 방식으로 처리한다. origin이 여기서 움직이면 스케일이
       걸린 상태에서 기준점이 바뀌어 화면이 튀므로, 항상 상단 중앙으로
       고정해둔다. */
    transform-origin: 50% 0;
  }

  .pdf-jump-back {
    position: sticky;
    top: 12px;
    z-index: 20;
    width: fit-content;
    margin: 0 12px 0 auto;
    display: flex;
    align-items: center;
    padding: 0.4rem 0.85rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    font-size: 0.8rem;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  }

  .pdf-jump-back:hover {
    background: var(--surface-subtle);
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
