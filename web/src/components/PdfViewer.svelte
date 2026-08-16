<script>
  // PDF.js 캔버스 위에 텍스트 레이어를 겹쳐 원문의 선명도는 유지하면서
  // 텍스트 선택과 복사가 가능하도록 렌더링한다.
  import { onMount } from 'svelte';
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
  let pdfDocument;
  let loadedSrc = '';
  let renderVersion = 0;

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

  $effect(() => {
    resizeToken;
    if (container) render(src, zoom);
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
  <div class="pdf-pages" bind:this={container}></div>
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
