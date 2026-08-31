<script>
  // 모든 논문 상세에서 사용하는 PDF 원문 + 구조화 노트 읽기 화면.
  // PDF 확대/스크롤 자체는 PdfPane이, 노트 편집 자체는 MarkdownNote가
  // 각자 책임지고, 이 페이지는 논문을 불러와서 그 둘을 배치하는 일만 한다.
  import { api } from '../services/api.js';
  import PdfPane from '../components/PdfPane.svelte';
  import MarkdownNote from '../components/MarkdownNote.svelte';
  import Icon from '../components/Icon.svelte';

  let { itemKey, onBack, backLabel = '라이브러리' } = $props();

  let paper = $state(null);
  let loading = $state(true);
  let error = $state('');
  let mobilePane = $state('pdf');
  let noteCollapsed = $state(false);

  // 원문/노트 패널 구분선 드래그로 폭 조절. splitViewEl(그리드 컨테이너)의
  // 실제 렌더 폭을 기준으로 매 드래그마다 clamp하므로, 창 크기가 좁아져도
  // 노트 패널이 원문 패널을 다 밀어내는 일이 없다.
  let splitViewEl = $state();
  let noteWidth = $state(420);
  let resizing = $state(false);

  const NOTE_WIDTH_MIN = 320;
  const NOTE_WIDTH_MAX = 720;
  const PDF_WIDTH_MIN = 360;

  function startResize(e) {
    e.preventDefault();
    resizing = true;

    const onMove = (ev) => {
      if (!splitViewEl) return;
      const rect = splitViewEl.getBoundingClientRect();
      const maxWidth = Math.min(NOTE_WIDTH_MAX, rect.width - PDF_WIDTH_MIN);
      noteWidth = Math.min(maxWidth, Math.max(NOTE_WIDTH_MIN, rect.right - ev.clientX));
    };
    const onUp = () => {
      resizing = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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

  function saveMemo(markdown) {
    return api.saveMemo(itemKey, markdown);
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
      {#if paper.attachmentType}
        <a class="reader-title" href={`/api/papers/${itemKey}/${paper.attachmentType}`} target="_blank" rel="noopener" title="새 창에서 원문 열기">
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

    <div
      class="split-view"
      class:note-collapsed={noteCollapsed}
      class:resizing
      data-mobile-pane={mobilePane}
      bind:this={splitViewEl}
      style:--split-note-width={`${noteWidth}px`}
    >
      <PdfPane
        attachmentType={paper.attachmentType}
        contentUrl={paper.attachmentType ? `/api/papers/${itemKey}/${paper.attachmentType}` : null}
        {noteCollapsed}
        onToggleNoteCollapse={() => (noteCollapsed = !noteCollapsed)}
      />

      {#if !noteCollapsed}
        <div
          class="split-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="원문/노트 패널 크기 조절"
          onpointerdown={startResize}
        ></div>
      {/if}

      <aside class="split-note-pane" aria-label="이 논문의 노트">
        {#key itemKey}
          <MarkdownNote
            initialMarkdown={paper.memo?.markdown ?? ''}
            onSave={saveMemo}
            draftKey={itemKey}
            paperTitle={paper.title}
          />
        {/key}
      </aside>
    </div>
  {/if}
</div>
