<script>
  import { api } from '../services/api.js';
  import StructuredNote from '../components/StructuredNote.svelte';
  import Icon from '../components/Icon.svelte';

  let { itemKey, onBack, backLabel = '라이브러리' } = $props();

  let paper = $state(null);
  let loading = $state(true);
  let error = $state('');

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

  load();
</script>

<button class="back-btn" onclick={onBack}><Icon name="arrow-left" size={18} /> {backLabel}</button>

{#if loading}
  <div class="skeleton-detail"><div></div><span></span><span></span><span></span></div>
{:else if error}
  <div class="state-card error-state"><Icon name="alert" size={25} /><strong>논문을 불러오지 못했어요</strong><p>{error}</p></div>
{:else if paper}
  <article class="paper-detail">
    <div class="detail-heading">
      <span class="paper-hero-icon"><Icon name="file" size={29} /></span>
      <div>
        <p class="eyebrow">RESEARCH PAPER</p>
        <h1>{paper.title}</h1>
        <p class="detail-authors">{paper.authors.join(', ') || '저자 미상'}</p>
        <div class="detail-meta">
          {#if paper.year}<span>{paper.year}</span>{/if}
          {#if paper.hasPdf}<span>PDF 첨부됨</span>{/if}
        </div>
      </div>
    </div>
    {#if paper.hasPdf}
      <a class="pdf-link" href={`/api/papers/${itemKey}/pdf`} target="_blank" rel="noopener">
        <Icon name="external" size={17} /> PDF 원문 열기
      </a>
    {/if}

    <section class="detail-memo">
      <div class="detail-memo-header">
        <span><Icon name="note" size={19} /></span>
        <div>
          <h2>이 논문의 노트</h2>
          <p>주장, 한계점, 이론처럼 원하는 이름으로 항목을 만들어 직접 정리해 보세요.</p>
        </div>
      </div>
      {#key itemKey}
        <StructuredNote initialSections={paper.memo?.sections ?? []} onSave={saveMemo} />
      {/key}
    </section>
  </article>
{/if}
