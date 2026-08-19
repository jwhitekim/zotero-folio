<script>
  import { api } from '../services/api.js';
  import Icon from '../components/Icon.svelte';
  import PaperCard from '../components/PaperCard.svelte';

  let { onOpenPaper } = $props();

  let collections = $state([]);
  let loading = $state(true);
  let error = $state('');

  let selected = $state(null); // { key, name }
  let papers = $state([]);
  let papersLoading = $state(false);

  async function load() {
    loading = true;
    error = '';
    try {
      collections = await api.listCollections();
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function selectCollection(c) {
    selected = c;
    papersLoading = true;
    try {
      papers = await api.listCollectionPapers(c.key);
    } finally {
      papersLoading = false;
    }
  }

  async function deletePaper(itemKey) {
    await api.deletePaper(itemKey);
    papers = papers.filter((p) => p.itemKey !== itemKey);
  }

  load();
</script>

{#if selected}
  <button class="back-btn" onclick={() => (selected = null)}><Icon name="arrow-left" size={18} /> 컬렉션 목록</button>
  <header class="detail-heading collection-heading">
    <span class="collection-hero-icon"><Icon name="folder" size={28} /></span>
    <div><p class="eyebrow">COLLECTION</p><h1>{selected.name}</h1></div>
  </header>
  {#if papersLoading}
    <div class="skeleton-list"><div class="skeleton-card"><i></i><span></span><span></span></div></div>
  {:else if papers.length === 0}
    <div class="state-card"><span class="state-icon"><Icon name="library" size={27} /></span><strong>빈 컬렉션이에요</strong><p>이 컬렉션에는 아직 논문이 없습니다.</p></div>
  {:else}
    <div class="content-heading"><h2>논문</h2><span>{papers.length}편</span></div>
    <div class="paper-list">
      {#each papers as p (p.itemKey)}
        <PaperCard paper={p} onOpen={onOpenPaper} onDelete={deletePaper} />
      {/each}
    </div>
  {/if}
{:else}
  <header class="page-header compact">
    <div><p class="eyebrow">ORGANIZE</p><h1>컬렉션</h1><p class="page-description">주제별로 정리한 논문을 빠르게 찾아보세요.</p></div>
  </header>
  {#if loading}
    <div class="skeleton-list"><div class="skeleton-card"><i></i><span></span></div><div class="skeleton-card"><i></i><span></span></div></div>
  {:else if error}
    <div class="state-card error-state"><Icon name="alert" size={25} /><strong>컬렉션을 불러오지 못했어요</strong><p>{error}</p></div>
  {:else if collections.length === 0}
    <div class="state-card"><span class="state-icon"><Icon name="folder" size={27} /></span><strong>컬렉션이 없어요</strong><p>Zotero에서 컬렉션을 만들면 이곳에 표시됩니다.</p></div>
  {:else}
    <div class="content-heading"><h2>모든 컬렉션</h2><span>{collections.length}개</span></div>
    <div class="collection-grid">
      {#each collections as c (c.key)}
        <button class="collection-card" onclick={() => selectCollection(c)}>
          <span class="folder-icon"><Icon name="folder" size={23} /></span>
          <span class="title">{c.name}</span>
          <span class="chevron"><Icon name="chevron" size={18} /></span>
        </button>
      {/each}
    </div>
  {/if}
{/if}
