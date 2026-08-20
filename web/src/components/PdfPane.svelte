<script>
  // 논문 상세 분할 뷰의 PDF 원문 패널 — 확대/축소, 스크롤 위치 보정,
  // 노트 패널 접기 버튼까지 PDF 보기 자체에 필요한 상태를 전부 갖고 있다.
  import PdfViewer from './PdfViewer.svelte';
  import Icon from './Icon.svelte';

  // attachmentType: 'pdf' | 'html' | null. PDF면 pdf.js 엔진(PdfViewer)으로
  // 렌더링하고, HTML(브라우저 커넥터가 저장한 웹페이지 스냅샷)이면 그대로
  // iframe에 띄운다 — 둘 다 없으면 빈 상태를 보여준다.
  let { attachmentType, contentUrl, noteCollapsed, onToggleNoteCollapse } = $props();

  let pdfZoom = $state(1);
  let pdfScrollEl = $state();
  let iframeEl = $state();

  const MIN_ZOOM = 0.7;
  const MAX_ZOOM = 5;

  // 가로 중앙 정렬은 PdfViewer.svelte 내부(pdf.js 엔진의 페이지 auto-margin)가
  // 알아서 맞춘다 — 여기서는 세로만 다룬다.
  //
  // 세로는 "커서(또는 화면 중앙)가 가리키던 지점"이 화면상 같은 위치에 남도록
  // 스크롤을 매번 그 자리에서 즉시 보정한다. CSS 확대 미리보기(transform:
  // scale)와 스크롤 보정이 같은 틱에서 함께 적용되므로 서로 어긋나거나
  // 애니메이션끼리 경쟁할 여지가 없다 — origin은 절대 움직이지 않는다.
  function zoomTo(nextZoom, clientY) {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(nextZoom * 100) / 100));
    if (clamped === pdfZoom || !pdfScrollEl) {
      pdfZoom = clamped;
      return;
    }

    const rect = pdfScrollEl.getBoundingClientRect();
    const offsetY = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const ratio = clamped / pdfZoom;

    pdfScrollEl.scrollTop = (pdfScrollEl.scrollTop + offsetY) * ratio - offsetY;
    pdfZoom = clamped;
  }

  function changeZoom(delta) {
    zoomTo(pdfZoom + delta);
  }

  // Ctrl/Cmd + 스크롤(트랙패드 핀치도 대부분 브라우저에서 이걸로 들어옴)로 확대/축소.
  // PDF든 HTML 스냅샷이든 원문이 있으면 둘 다 확대/축소가 된다 — HTML은
  // pdf.js 같은 재렌더링이 없어서 iframe 전체를 CSS로 그대로 확대한다
  // (PdfViewer의 미리보기 확대 transform과 같은 방식).
  // 휠 한 틱당 확대량을 deltaY 크기에 비례시킨다 — 고정폭(예: 항상 8%)이면
  // 트랙패드 핀치의 작은 delta에 맞춰놓을 경우 마우스 휠 한 칸(delta가
  // 훨씬 큼)이 상대적으로 너무 둔감하게 느껴진다. 최소/최대로 클램프해서
  // 너무 찔끔거리거나 한 번에 확 튀지 않게만 막는다.
  function zoomStep(deltaY) {
    return Math.min(0.35, Math.max(0.04, Math.abs(deltaY) / 350));
  }

  function onPdfWheel(e) {
    if (!attachmentType || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const step = zoomStep(e.deltaY);
    zoomTo(pdfZoom + (e.deltaY < 0 ? step : -step), e.clientY);
  }

  // iframe은 별도 문서/윈도우라 커서가 그 안에 있으면 바깥 .pdf-scroll의
  // onwheel이 아예 안 불린다 — 브라우저 화면 전체가 확대/축소돼 버리는
  // 이유. iframe이 로드되면 그 안쪽 window에 직접 리스너를 달아서 우리
  // zoomTo로 넘긴다(clientY는 iframe 기준이라 바깥 좌표로 보정).
  function attachIframeZoom() {
    const win = iframeEl?.contentWindow;
    win?.addEventListener('wheel', onIframeWheel, { passive: false });
  }

  function onIframeWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const rect = iframeEl.getBoundingClientRect();
    const step = zoomStep(e.deltaY);
    zoomTo(pdfZoom + (e.deltaY < 0 ? step : -step), rect.top + e.clientY);
  }
</script>

<section class="split-pdf-pane" aria-label="원문">
  <div class="pdf-pane-toolbar">
    <div><span class="toolbar-icon"><Icon name="file" size={17} /></span><strong>원문</strong></div>
    {#if attachmentType}
      <div class="pdf-zoom-controls" aria-label="원문 확대 및 축소">
        <button onclick={() => changeZoom(-0.15)} disabled={pdfZoom <= MIN_ZOOM} aria-label="원문 축소">−</button>
        <button class="zoom-value" onclick={() => zoomTo(1)} aria-label="원래 크기로">
          {Math.round(pdfZoom * 100)}%
        </button>
        <button onclick={() => changeZoom(0.15)} disabled={pdfZoom >= MAX_ZOOM} aria-label="원문 확대">
          <Icon name="plus" size={14} />
        </button>
      </div>
    {:else}
      <span></span>
    {/if}
    <button
      class="note-collapse-toggle"
      onclick={onToggleNoteCollapse}
      aria-label={noteCollapsed ? '노트 패널 펼치기' : '노트 패널 접기'}
      aria-pressed={noteCollapsed}
    >
      <Icon name="panel" size={16} />
    </button>
  </div>
  <div class="pdf-scroll-wrap">
    <div class="pdf-scroll" bind:this={pdfScrollEl} onwheel={onPdfWheel}>
      {#if attachmentType === 'pdf'}
        <PdfViewer src={contentUrl} zoom={pdfZoom} scrollContainer={pdfScrollEl} />
      {:else if attachmentType === 'html'}
        <div class="html-zoom-wrap" style:transform={`scale(${pdfZoom})`}>
          <iframe
            bind:this={iframeEl}
            class="html-snapshot-frame"
            src={contentUrl}
            title="웹페이지 원문"
            sandbox="allow-same-origin"
            onload={attachIframeZoom}
          ></iframe>
        </div>
      {:else}
        <div class="pdf-empty"><Icon name="file" size={25} /><p>첨부된 원문이 없어요.</p></div>
      {/if}
    </div>
  </div>
</section>
