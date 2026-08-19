<script>
  // 논문 상세 분할 뷰의 PDF 원문 패널 — 확대/축소, 스크롤 위치 보정,
  // 노트 패널 접기 버튼까지 PDF 보기 자체에 필요한 상태를 전부 갖고 있다.
  import PdfViewer from './PdfViewer.svelte';
  import Icon from './Icon.svelte';

  let { hasPdf, pdfUrl, noteCollapsed, onToggleNoteCollapse } = $props();

  let pdfZoom = $state(1);
  let pdfScrollEl = $state();

  const MIN_ZOOM = 0.7;
  const MAX_ZOOM = 3;

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
  function onPdfWheel(e) {
    if (!hasPdf || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomTo(pdfZoom + (e.deltaY < 0 ? 0.08 : -0.08), e.clientY);
  }
</script>

<section class="split-pdf-pane" aria-label="PDF 원문">
  <div class="pdf-pane-toolbar">
    <div><span class="toolbar-icon"><Icon name="file" size={17} /></span><strong>PDF 원문</strong></div>
    {#if hasPdf}
      <div class="pdf-zoom-controls" aria-label="PDF 확대 및 축소">
        <button onclick={() => changeZoom(-0.15)} disabled={pdfZoom <= MIN_ZOOM} aria-label="PDF 축소">−</button>
        <button class="zoom-value" onclick={() => zoomTo(1)} aria-label="화면 너비에 맞추기">
          {Math.round(pdfZoom * 100)}%
        </button>
        <button onclick={() => changeZoom(0.15)} disabled={pdfZoom >= MAX_ZOOM} aria-label="PDF 확대">
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
      {#if hasPdf}
        <PdfViewer src={pdfUrl} zoom={pdfZoom} scrollContainer={pdfScrollEl} />
      {:else}
        <div class="pdf-empty"><Icon name="file" size={25} /><p>첨부된 PDF가 없어요.</p></div>
      {/if}
    </div>
  </div>
</section>
