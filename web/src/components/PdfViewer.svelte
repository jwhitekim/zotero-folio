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

  async function getDocument(url) {
    if (pdfDocument && loadedSrc === url) return pdfDocument;
    pdfDocument = await pdfjsLib.getDocument({ url }).promise;
    loadedSrc = url;
    return pdfDocument;
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
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      clearTimeout(zoomTimer);
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
