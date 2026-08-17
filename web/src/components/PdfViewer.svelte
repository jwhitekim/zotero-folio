<script>
  // PDF.js 캔버스 위에 텍스트 레이어를 겹쳐 원문의 선명도는 유지하면서
  // 텍스트 선택과 복사가 가능하도록 렌더링한다.
  import { onMount, untrack } from 'svelte';
  import '../utils/safari-polyfills.js';
  import * as pdfjsLib from 'pdfjs-dist';
  import pdfWorkerUrl from '../utils/pdf-worker-entry.js?worker&url';

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  let { src, zoom = 1 } = $props();

  let container = $state();
  let loading = $state(true);
  let error = $state('');
  let errorDetail = $state('');
  let resizeToken = $state(0);
  let renderedZoom = $state(1);
  let pdfDocument;
  let loadedSrc = '';
  let renderVersion = 0;
  let zoomRenderTimer;
  let prevZoom = untrack(() => zoom);

  async function getDocument(url) {
    if (pdfDocument && loadedSrc === url) return pdfDocument;
    pdfDocument = await pdfjsLib.getDocument({ url }).promise;
    loadedSrc = url;
    return pdfDocument;
  }

  async function render(url, zoomLevel) {
    const version = ++renderVersion;
    loading = true;
    error = '';

    try {
      const pdf = await getDocument(url);
      if (version !== renderVersion) return;

      renderedZoom = zoomLevel;
      container.replaceChildren();
      const availableWidth = Math.min(container.clientWidth, 900);
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        if (version !== renderVersion) return;

        const page = await pdf.getPage(pageNum);
        const unscaled = page.getViewport({ scale: 1 });
        const scale = (availableWidth / unscaled.width) * zoomLevel;
        const viewport = page.getViewport({ scale });

        const pageWrap = document.createElement('div');
        pageWrap.className = 'pdf-page-wrap';
        pageWrap.style.width = `${viewport.width}px`;
        pageWrap.style.height = `${viewport.height}px`;
        pageWrap.style.setProperty('--total-scale-factor', String(viewport.scale));

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
        container.appendChild(pageWrap);

        await page.render({
          canvasContext: canvas.getContext('2d'),
          viewport,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        }).promise;

        if (version !== renderVersion) return;
        const textContent = await page.getTextContent();
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textLayerElement,
          viewport,
        });
        await textLayer.render();

        // 첫 페이지가 실제로 읽을 수 있는 상태가 되면 로딩 안내를 바로 숨긴다.
        // 나머지 페이지는 아래에서 계속 순차적으로 준비된다.
        if (pageNum === 1 && version === renderVersion) loading = false;
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

  // src/리사이즈 변경 시엔 즉시 재렌더링. zoom은 여기서 추적하지 않음 —
  // 스크롤 중 매 wheel 이벤트마다 이 effect가 다시 도는 걸 막기 위함.
  $effect(() => {
    resizeToken;
    const s = src;
    if (container) render(s, untrack(() => zoom));
  });

  // zoom 변경은 CSS 확대(아래 template)로 즉시 반영되고, 실제 캔버스
  // 재렌더링은 스크롤이 멈춘 뒤 한 번만 하도록 debounce한다.
  $effect(() => {
    const z = zoom;
    if (!container) {
      prevZoom = z;
      return;
    }

    // CSS transform은 컨테이너 맨 위(1페이지 상단)를 기준으로 확대되므로,
    // 보정 없이 그대로 두면 스크롤을 깊이 내린 상태에서 확대할 때 화면이
    // 1페이지 상단 쪽으로 튀어 보인다. 뷰포트 중심이 문서상 같은 위치를
    // 계속 가리키도록 스크롤 위치를 함께 보정한다.
    const scrollEl = container.closest('.pdf-scroll');
    if (scrollEl && z !== prevZoom) {
      const ratio = z / prevZoom;
      const centerY = scrollEl.scrollTop + scrollEl.clientHeight / 2;
      scrollEl.scrollTop = centerY * ratio - scrollEl.clientHeight / 2;
    }
    prevZoom = z;

    clearTimeout(zoomRenderTimer);
    zoomRenderTimer = setTimeout(() => {
      // render()는 캔버스를 전부 지웠다가 다시 채우는데, 그 찰나 컨테이너가
      // 비어 스크롤 가능 영역이 사라지면서 브라우저가 scrollTop을 0으로
      // 강제로 되돌려버린다. 실제 렌더링이 끝난 뒤 위에서 맞춰둔 스크롤
      // 위치를 다시 복원한다 (더 최근 렌더링이 이미 시작됐다면 건너뜀).
      const targetScrollTop = scrollEl ? scrollEl.scrollTop : null;
      const expectedVersion = renderVersion + 1;
      render(src, z).then(() => {
        if (scrollEl && targetScrollTop !== null && renderVersion === expectedVersion) {
          scrollEl.scrollTop = targetScrollTop;
        }
      });
    }, 150);
  });

  onMount(() => {
    let timer;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => (resizeToken += 1), 180);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      clearTimeout(zoomRenderTimer);
      window.removeEventListener('resize', onResize);
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
  <div
    class="pdf-pages"
    bind:this={container}
    style:transform={`scale(${zoom / renderedZoom})`}
    style:transform-origin="top center"
  ></div>
</div>

<style>
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
