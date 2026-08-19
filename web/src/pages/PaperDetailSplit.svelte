<script>
  // 모든 논문 상세에서 사용하는 PDF 원문 + 구조화 노트 읽기 화면.
  import { api } from '../services/api.js';
  import PdfViewer from '../components/PdfViewer.svelte';
  import StructuredNote from '../components/StructuredNote.svelte';
  import Icon from '../components/Icon.svelte';

  let { itemKey, onBack, backLabel = '라이브러리' } = $props();

  let paper = $state(null);
  let loading = $state(true);
  let error = $state('');
  let mobilePane = $state('pdf');
  let pdfZoom = $state(1);
  let noteCollapsed = $state(false);
  let pdfScrollEl = $state();

  let deleteState = $state('idle'); // 'idle' | 'confirm' | 'deleting'
  let deleteError = $state('');

  const MIN_ZOOM = 0.7;
  const MAX_ZOOM = 3;

  // 가로는 항상 중앙 정렬 — PDF 문서는 커서를 따라 옆으로 쏠리면 안 된다
  // (PdfViewer의 transform-origin이 "50% 0"으로 고정되어 있어 확대해도
  // 가로 방향은 항상 대칭으로 커진다. 아래 onPdfLayoutReady에서 재확정만 함).
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

  // PdfViewer가 새 배율로 실제 페이지 크기를 확정한 시점에 호출된다. 세로는
  // zoomTo에서 이미 실시간으로 보정해뒀으니 건드리지 않고, 가로만 실제
  // 콘텐츠 너비 기준으로 다시 정확히 가운데를 맞춘다.
  function onPdfLayoutReady() {
    if (!pdfScrollEl) return;
    pdfScrollEl.scrollLeft = (pdfScrollEl.scrollWidth - pdfScrollEl.clientWidth) / 2;
  }

  // Ctrl/Cmd + 스크롤(트랙패드 핀치도 대부분 브라우저에서 이걸로 들어옴)로 확대/축소.
  function onPdfWheel(e) {
    if (!paper?.hasPdf || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomTo(pdfZoom + (e.deltaY < 0 ? 0.08 : -0.08), e.clientY);
  }

  async function load() {
    loading = true;
    error = '';
    try {
      paper = await api.getPaper(itemKey);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  function saveMemo(sections) {
    return api.saveMemo(itemKey, sections);
  }

  async function confirmDelete() {
    deleteState = 'deleting';
    deleteError = '';
    try {
      await api.deletePaper(itemKey);
      onBack();
    } catch (err) {
      deleteError = err.message;
      deleteState = 'confirm';
    }
  }

  load();
</script>

<div class="reader-shell">
  <header class="reader-topbar">
    <button class="reader-back" onclick={onBack}>
      <Icon name="arrow-left" size={18} />
      <span>{backLabel}</span>
    </button>
    <div class="reader-brand"><strong>Folio</strong><span></span><em>읽기</em></div>
    {#if paper}
      {#if paper.hasPdf}
        <a class="reader-title" href={`/api/papers/${itemKey}/pdf`} target="_blank" rel="noopener" title="새 창에서 PDF 열기">
          <span class="reader-title-text">{paper.title}</span>
          <Icon name="external" size={13} />
        </a>
      {:else}
        <p class="reader-title">{paper.title}</p>
      {/if}
    {/if}
  </header>

  {#if loading}
    <div class="reader-loading"><div class="skeleton-detail"><div></div><span></span><span></span><span></span></div></div>
  {:else if error}
    <div class="reader-loading"><div class="state-card error-state"><Icon name="alert" size={25} /><strong>논문을 불러오지 못했어요</strong><p>{error}</p></div></div>
  {:else if paper}
    <div class="reader-pane-tabs" aria-label="읽기 화면 전환">
      <button class:active={mobilePane === 'pdf'} onclick={() => (mobilePane = 'pdf')}><Icon name="file" size={17} /> 원문</button>
      <button class:active={mobilePane === 'note'} onclick={() => (mobilePane = 'note')}><Icon name="note" size={17} /> 노트</button>
    </div>

    <div class="split-view" class:note-collapsed={noteCollapsed} data-mobile-pane={mobilePane}>
      <section class="split-pdf-pane" aria-label="PDF 원문">
        <div class="pdf-pane-toolbar">
          <div><span class="toolbar-icon"><Icon name="file" size={17} /></span><strong>PDF 원문</strong></div>
          {#if paper.hasPdf}
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
            onclick={() => (noteCollapsed = !noteCollapsed)}
            aria-label={noteCollapsed ? '노트 패널 펼치기' : '노트 패널 접기'}
            aria-pressed={noteCollapsed}
          >
            <Icon name="panel" size={16} />
          </button>
        </div>
        <div class="pdf-scroll" bind:this={pdfScrollEl} onwheel={onPdfWheel}>
          {#if paper.hasPdf}
            <PdfViewer
              src={`/api/papers/${itemKey}/pdf`}
              zoom={pdfZoom}
              onLayoutReady={onPdfLayoutReady}
            />
          {:else}
            <div class="pdf-empty"><Icon name="file" size={25} /><p>첨부된 PDF가 없어요.</p></div>
          {/if}
        </div>
      </section>

      <aside class="split-note-pane" aria-label="논문 정보와 노트">
        <div class="split-paper-header">
          <div class="split-paper-header-row">
            <p class="eyebrow">RESEARCH PAPER</p>
            {#if deleteState === 'idle'}
              <button class="icon-btn" onclick={() => (deleteState = 'confirm')} aria-label="논문 삭제">
                <Icon name="trash" size={16} />
              </button>
            {/if}
          </div>
          <h1>{paper.title}</h1>
          <p class="detail-authors">{paper.authors.join(', ') || '저자 미상'}</p>
          <div class="detail-meta">
            {#if paper.year}<span>{paper.year}</span>{/if}
            {#if paper.hasPdf}<span><i></i> PDF 첨부됨</span>{/if}
          </div>
          {#if deleteState !== 'idle'}
            <div class="delete-confirm">
              <p>이 논문을 삭제할까요? Zotero 휴지통으로 이동하며, 메모도 함께 삭제됩니다.</p>
              {#if deleteError}<p class="status error">{deleteError}</p>{/if}
              <div class="delete-confirm-actions">
                <button class="icon-action secondary" onclick={() => (deleteState = 'idle')} disabled={deleteState === 'deleting'}>
                  취소
                </button>
                <button class="icon-action danger" onclick={confirmDelete} disabled={deleteState === 'deleting'}>
                  {deleteState === 'deleting' ? '삭제 중…' : '삭제'}
                </button>
              </div>
            </div>
          {/if}
        </div>

        {#key itemKey}
          <StructuredNote initialSections={paper.memo?.sections ?? []} onSave={saveMemo} />
        {/key}
      </aside>
    </div>
  {/if}
</div>
