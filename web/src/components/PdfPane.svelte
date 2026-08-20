<script>
  // 논문 상세 분할 뷰의 원문 패널 — 확대/축소, 스크롤 위치 보정, 노트 패널
  // 접기 버튼까지 원문 보기 자체에 필요한 상태를 전부 갖고 있다.
  import PdfViewer from './PdfViewer.svelte';
  import HtmlViewer from './HtmlViewer.svelte';
  import Icon from './Icon.svelte';

  // attachmentType: 'pdf' | 'html' | null. PDF면 pdf.js 엔진(PdfViewer)으로
  // 렌더링하고, HTML(브라우저 커넥터가 저장한 웹페이지 스냅샷)이면 HtmlViewer가
  // iframe에 띄운다 — 둘 다 없으면 빈 상태를 보여준다. 두 뷰어 모두 이 zoom
  // 상태값 하나(pdfZoom)와 zoomStep/zoomTo 계산을 공유해서, 어느 원문
  // 타입이든 확대/축소가 똑같이 동작한다.
  let { attachmentType, contentUrl, noteCollapsed, onToggleNoteCollapse } = $props();

  let pdfZoom = $state(1);
  let pdfScrollEl = $state();

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
  // 휠 한 틱당 확대량은 deltaY에 비례한다 — 브라우저 네이티브 Ctrl+휠 줌과
  // 같은 raw delta를 쓰기 때문에, 마우스 휠의 큰 한 칸은 그만큼 크게
  // 반응해서 체감 배율이 1:1로 맞는다. 다만 트랙패드 핀치는 deltaY가
  // 원래 아주 작아서(한 틱에 2~5 정도) 최소값 없이 그대로 쓰면 거의
  // 안 움직이는 것처럼 느껴진다 — 최소 반응 폭만 보장한다(상한은 없음,
  // 큰 입력은 그대로 크게 반응).
  function zoomStep(deltaY) {
    return Math.max(0.04, Math.abs(deltaY) / 350);
  }

  // PDF 전용 — pdf.js의 PDFViewer가 절대위치(absolute) 컨테이너를 강제해서
  // .viewer-scroll-wrap(relative)+.viewer-scroll(absolute) 우회 구조가
  // 필요하다(PdfViewer.svelte 주석 참고). HTML은 그 제약이 없어서
  // HtmlViewer.svelte가 자기 스크롤 박스를 직접 갖는다 — 그래서 이
  // 핸들러도 PDF 쪽 마크업에만 붙는다.
  function onPdfWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const step = zoomStep(e.deltaY);
    zoomTo(pdfZoom + (e.deltaY < 0 ? step : -step), e.clientY);
  }
</script>

<section class="split-pdf-pane" aria-label="원문">
  <div class="viewer-toolbar">
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
  {#if attachmentType === 'pdf'}
    <div class="viewer-scroll-wrap">
      <div class="viewer-scroll" bind:this={pdfScrollEl} onwheel={onPdfWheel}>
        <PdfViewer src={contentUrl} zoom={pdfZoom} scrollContainer={pdfScrollEl} />
      </div>
    </div>
  {:else if attachmentType === 'html'}
    <HtmlViewer src={contentUrl} zoom={pdfZoom} {zoomStep} onZoomTo={zoomTo} bind:scrollEl={pdfScrollEl} />
  {:else}
    <div class="viewer-empty"><Icon name="file" size={25} /><p>첨부된 원문이 없어요.</p></div>
  {/if}
</section>
