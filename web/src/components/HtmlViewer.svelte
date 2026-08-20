<script>
  // 브라우저 커넥터가 저장한 웹페이지 스냅샷을 그대로 보여주는 뷰어.
  // PdfViewer.svelte와 짝을 이루는 컴포넌트지만, 스크롤 컨테이너는 공유하지
  // 않는다 — PDF는 pdf.js의 PDFViewer가 절대위치(absolute) 컨테이너를
  // 강제해서 PdfPane.svelte가 .viewer-scroll-wrap(relative)+.viewer-scroll
  // (absolute) 우회 구조를 만들어줘야 하지만, HTML은 그런 제약이 없다.
  // 그 제약을 안 받는 문서 타입에 PDF용 구조를 억지로 씌우지 않기 위해,
  // 이 컴포넌트는 자기 스크롤 박스(.html-viewer-scroll)를 직접 갖고 있다.
  //
  // 줌 상태(zoom prop)/스텝 계산(zoomStep)/실제 확대 반영(onZoomTo)은 PDF와
  // 마찬가지로 부모(PdfPane)가 갖고 있는 걸 그대로 물려받아 쓴다 — 스크롤
  // 위치 보정(zoomTo)이 이 컴포넌트가 만든 스크롤 박스를 대상으로 정확히
  // 동작하도록, 그 DOM 참조를 scrollEl로 부모에 되돌려준다(bind:scrollEl).
  //
  // "폭 맞춤" 배율도 PdfViewer와 같은 방식이다 — 원본 콘텐츠는 항상 자기
  // 자연스러운 폭(contentWidth, 최소 1100px)으로 그대로 렌더링해두고, 그 위에
  // transform: scale(fitWidthScale * zoom)을 곱해서 패널 폭에 맞춘다. 이렇게
  // "고정 크기로 그린 뒤 CSS로 배율만 곱하기" 방식이어야 세로 스크롤/줌인아웃이
  // PDF 쪽과 똑같이 동작한다 — fitWidthScale은 줌 도중엔 상수라서, 부모
  // PdfPane의 zoomTo() 스크롤 보정(비율 계산)이 그대로 맞아떨어진다.
  let { src, zoom, zoomStep, onZoomTo, scrollEl = $bindable() } = $props();

  let iframeEl = $state();
  let fitWidthScale = $state(1);
  let contentWidth = $state(1100);
  let loaded = $state(false);

  // 저장된 페이지 중엔 자기 사이드바 레이아웃을 위해 body에 overflow-x:
  // hidden을 걸어둔 것들이 있다(예: 티스토리 사이드바 테마). 폭 맞춤 배율로
  // 어차피 안 잘리게 축소해서 보여주지만, 혹시라도 폭 맞춤이 실패하는
  // 경우를 대비해 최소한 스크롤은 가능하게 되돌려놓는다.
  function unblockOverflow(doc) {
    const style = doc.createElement('style');
    style.textContent = 'html, body { overflow: auto !important; }';
    doc.head?.appendChild(style);
  }

  // 컨테이너 폭이 유효할 때만(탭 전환 등으로 숨겨져 폭이 0이면 건너뜀) "폭
  // 맞춤" 배율을 다시 잰다. iframe 문서의 실제 콘텐츠 폭(scrollWidth)이
  // 기준 폭(1100px)보다 넓으면(사이드바 레이아웃 등) 그 폭을 그대로
  // 인정하고, 패널에 맞춰 축소만 한다 — 억지로 1100px 밑으로 줄이지
  // 않는다(보통 웹페이지 폭보다 좁게 렌더링해서 텍스트가 부자연스럽게
  // 작아지는 걸 막기 위해).
  function measureFitWidthScale() {
    const doc = iframeEl?.contentDocument;
    if (!doc || !scrollEl || scrollEl.clientWidth === 0) return null;
    contentWidth = Math.max(1100, doc.documentElement.scrollWidth);
    return scrollEl.clientWidth / contentWidth;
  }

  function attachIframeZoom() {
    const doc = iframeEl?.contentDocument;
    if (doc) unblockOverflow(doc);
    iframeEl?.contentWindow?.addEventListener('wheel', onIframeWheel, { passive: false });
    // 폭 맞춤 계산은 아래 $effect가 담당한다 — loaded를 여기서 true로만
    // 바꾼다. iframe onload 시점에 scrollEl(자기 자신의 스크롤 박스)이
    // 아직 bind:this로 안 잡혀 있을 수 있어서, 여기서 바로 재는 대신
    // scrollEl이 준비될 때마다 다시 시도하는 $effect에 맡긴다.
    loaded = true;
  }

  // 바깥 스크롤 박스 위(iframe 밖 패딩 영역)에서 Ctrl+휠.
  function onWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const step = zoomStep(e.deltaY);
    onZoomTo(zoom + (e.deltaY < 0 ? step : -step), e.clientY);
  }

  // iframe은 별도 문서/윈도우라 커서가 그 안에 있으면 바깥 스크롤 박스의
  // onwheel이 아예 안 불린다 — 브라우저 화면 전체가 확대/축소돼 버리는
  // 이유. iframe이 로드되면 그 안쪽 window에 직접 리스너를 달아서 onZoomTo로
  // 넘긴다(clientY는 iframe 기준이라 바깥 좌표로 보정).
  function onIframeWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const rect = iframeEl.getBoundingClientRect();
    const step = zoomStep(e.deltaY);
    onZoomTo(zoom + (e.deltaY < 0 ? step : -step), rect.top + e.clientY);
  }

  // loaded와 scrollEl 둘 다 준비돼야 정확히 잴 수 있는데, 어느 쪽이 먼저
  // 준비될지 보장이 없다 — $effect로 두면 둘 중 하나라도 바뀔 때마다 다시
  // 실행되니, 어느 순서로 준비되든 결국 한 번은 정확히 계산된다.
  $effect(() => {
    if (!loaded || !scrollEl) return;
    const nextFit = measureFitWidthScale();
    if (nextFit != null) fitWidthScale = nextFit;
  });

  $effect(() => {
    if (!scrollEl) return;
    let resizeTimer;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const nextFit = measureFitWidthScale();
        if (nextFit != null) fitWidthScale = nextFit;
      }, 180);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
    };
  });
</script>

<div class="html-viewer-scroll" bind:this={scrollEl} onwheel={onWheel}>
  <div
    class="html-zoom-wrap"
    style:width={`${contentWidth}px`}
    style:transform={`scale(${fitWidthScale * zoom})`}
  >
    <iframe
      bind:this={iframeEl}
      class="html-snapshot-frame"
      {src}
      title="웹페이지 원문"
      sandbox="allow-same-origin"
      onload={attachIframeZoom}
    ></iframe>
  </div>
</div>

<style>
  /* PdfPane.svelte의 .viewer-scroll과 패딩/스크롤바 스타일은 맞추되,
     absolute 포지셔닝(pdf.js 전용 제약)은 안 쓴다 — 그리드 행(툴바 아래
     나머지)을 그냥 일반 흐름으로 채운다. */
  .html-viewer-scroll {
    height: 100%;
    overflow: auto;
    overflow-anchor: none;
    overscroll-behavior-x: contain;
    scrollbar-gutter: stable;
    padding: 1.5rem clamp(1rem, 3vw, 2.5rem) 3rem;
    scrollbar-color: var(--border-strong) transparent;
    scrollbar-width: thin;
  }

  /* 페이지 자체 스크롤은 iframe 안에서 일어난다 — 바깥 패딩 안에서 카드처럼
     떠 있게 둔다. transform-origin이 PdfViewer의 .pdfViewer와 같은 상단
     중앙이어야 PdfPane의 zoomTo() 스크롤 보정 계산과 맞아떨어진다. */
  .html-zoom-wrap {
    display: block;
    max-width: none;
    height: 100%;
    min-height: calc(100vh - 220px);
    transform-origin: 50% 0;
  }

  .html-snapshot-frame {
    display: block;
    width: 100%;
    height: 100%;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: #fff;
  }
</style>
