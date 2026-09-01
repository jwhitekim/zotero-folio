<script>
  import { api } from '../services/api.js';
  import Icon from '../components/Icon.svelte';
  import PaperCard from '../components/PaperCard.svelte';

  let { onOpenPaper, onOpenLibrary, onOpenCollections, username = '' } = $props();

  let papers = $state([]);
  let collections = $state([]);
  let loading = $state(true);
  let error = $state('');
  let syncing = $state(false);
  let syncStatus = $state('');

  async function load() {
    loading = true;
    error = '';
    try {
      [papers, collections] = await Promise.all([api.listPapers(''), api.listCollections()]);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function runSync() {
    syncing = true;
    syncStatus = '';
    try {
      const result = await api.sync();
      syncStatus = `확인 ${result.checked}건 · 캐시 ${result.cached}건`;
      await load();
    } catch (err) {
      syncStatus = err.message;
    } finally {
      syncing = false;
    }
  }

  async function deletePaper(itemKey) {
    await api.deletePaper(itemKey);
    papers = papers.filter((p) => p.itemKey !== itemKey);
  }

  load();
</script>

<header class="library-hero">
  <div class="library-hero-copy">
    <p class="eyebrow">PRIVATE RESEARCH LIBRARY</p>
    <h1>{username ? `${username}님의 서재` : '나의 서재'}</h1>
    <p>읽어야 할 자료와 기록한 생각이 한곳에 머무는<br class="desktop-break" /> 조용한 연구 공간입니다.</p>
    <div class="hero-actions">
      <button class="hero-primary" onclick={onOpenLibrary}><Icon name="library" size={17} /> 라이브러리 둘러보기</button>
      <button class="hero-secondary" onclick={runSync} disabled={syncing}>
        <span class:spinning={syncing}><Icon name="refresh" size={17} /></span>
        {syncing ? '동기화 중' : 'Zotero 동기화'}
      </button>
    </div>
  </div>
  <div class="hero-book-stack" aria-hidden="true">
    <span class="hero-book book-one"><i>FOLIO</i><b>Research<br />Archive</b></span>
    <span class="hero-book book-two"><i>NOTES</i><b>Ideas &amp;<br />Fragments</b></span>
    <span class="hero-book book-three"><i>PAPERS</i><b>Selected<br />Readings</b></span>
  </div>
</header>

{#if syncStatus}<p class="notice"><Icon name="check" size={15} /> {syncStatus}</p>{/if}

{#if loading}
  <div class="skeleton-list" aria-label="홈을 불러오는 중">
    {#each Array(3) as _}<div class="skeleton-card"><i></i><span></span><span></span></div>{/each}
  </div>
{:else if error}
  <div class="state-card error-state"><Icon name="alert" size={25} /><strong>라이브러리를 불러오지 못했어요</strong><p>{error}</p></div>
{:else}
  <div class="home-stats">
    <div class="stat-card"><span><Icon name="library" size={17} /> 전체 자료</span><p><strong>{papers.length}</strong><small>편</small></p></div>
    <div class="stat-card"><span><Icon name="file" size={17} /> 원문 보관</span><p><strong>{papers.filter((paper) => paper.hasPdf).length}</strong><small>PDF</small></p></div>
    <div class="stat-card"><span><Icon name="folder" size={17} /> 컬렉션</span><p><strong>{collections.length}</strong><small>개의 선반</small></p></div>
  </div>

  <div class="section-heading home-section-heading">
    <div><p class="eyebrow">RECENTLY ADDED</p><h2>최근 들어온 책</h2></div>
    <button onclick={onOpenLibrary}>전체 보기 <Icon name="chevron" size={15} /></button>
  </div>
  {#if papers.length === 0}
    <div class="state-card"><span class="state-icon"><Icon name="library" size={27} /></span><strong>라이브러리가 비어 있어요</strong><p>Zotero와 동기화하면 최근 논문이 여기에 표시됩니다.</p></div>
  {:else}
    <div class="book-shelf">
      {#each papers.slice(0, 5) as p (p.itemKey)}
        <PaperCard paper={p} onOpen={onOpenPaper} onDelete={deletePaper} variant="cover" />
      {/each}
    </div>
  {/if}

  {#if collections.length > 0}
    <div class="section-heading collection-preview-heading">
      <div><p class="eyebrow">YOUR SHELVES</p><h2>컬렉션</h2></div>
      <button onclick={onOpenCollections}>모두 보기 <Icon name="chevron" size={15} /></button>
    </div>
    <div class="home-collection-grid">
      {#each collections.slice(0, 4) as collection, index (collection.key)}
        <button class="home-collection-card" onclick={onOpenCollections}>
          <span class="collection-index">{String(index + 1).padStart(2, '0')}</span>
          <span class="home-folder-icon"><Icon name="folder" size={22} /></span>
          <span><strong>{collection.name}</strong><small>Zotero 컬렉션</small></span>
          <Icon name="chevron" size={17} />
        </button>
      {/each}
    </div>
  {/if}
{/if}
