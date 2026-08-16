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

  let deleteState = $state('idle'); // 'idle' | 'confirm' | 'deleting'
  let deleteError = $state('');

  const MIN_ZOOM = 0.7;
  const MAX_ZOOM = 2;

  function changeZoom(delta) {
    pdfZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((pdfZoom + delta) * 100) / 100));
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
      <p class="reader-title">{paper.title}</p>
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
              <button class="zoom-value" onclick={() => (pdfZoom = 1)} aria-label="화면 너비에 맞추기">
                {Math.round(pdfZoom * 100)}%
              </button>
              <button onclick={() => changeZoom(0.15)} disabled={pdfZoom >= MAX_ZOOM} aria-label="PDF 확대">
                <Icon name="plus" size={14} />
              </button>
            </div>
          {/if}
          {#if paper.hasPdf}
            <a href={`/api/papers/${itemKey}/pdf`} target="_blank" rel="noopener">
              새 창에서 열기 <Icon name="external" size={15} />
            </a>
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
        <div class="pdf-scroll">
          {#if paper.hasPdf}
            <PdfViewer src={`/api/papers/${itemKey}/pdf`} zoom={pdfZoom} />
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

        <section class="detail-memo">
          <div class="detail-memo-header">
            <span><Icon name="note" size={19} /></span>
            <div>
              <h2>이 논문의 노트</h2>
              <p>읽으면서 발견한 주장과 질문을 직접 정리해 보세요.</p>
            </div>
          </div>
          {#key itemKey}
            <StructuredNote initialSections={paper.memo?.sections ?? []} onSave={saveMemo} />
          {/key}
        </section>
      </aside>
    </div>
  {/if}
</div>
