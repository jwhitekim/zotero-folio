<script>
  import { api } from '../services/api.js';
  import Icon from '../components/Icon.svelte';
  import PaperCard from '../components/PaperCard.svelte';

  let { onOpenPaper } = $props();

  let papers = $state([]);
  let loading = $state(true);
  let error = $state('');
  // 정렬 모드: 'recent'(최근순, 서버 순서 유지) | 'year'(년도순) | 'title'(이름순)
  let sortMode = $state('recent');
  let viewMode = $state('list');
  let syncing = $state(false);
  let syncStatus = $state('');

  let showAddForm = $state(false);
  let webpageUrl = $state('');
  let adding = $state(false);
  let addError = $state('');
  let addUrlInput = $state();

  async function load() {
    loading = true;
    error = '';
    try {
      papers = await api.listPapers('');
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

  function toggleAddForm() {
    showAddForm = !showAddForm;
    addError = '';
    if (showAddForm) queueMicrotask(() => addUrlInput?.focus());
  }

  async function submitWebpage() {
    const url = webpageUrl.trim();
    if (!url) return;
    adding = true;
    addError = '';
    try {
      await api.addWebpage(url);
      webpageUrl = '';
      showAddForm = false;
      await load();
    } catch (err) {
      addError = err.message;
    } finally {
      adding = false;
    }
  }

  // 년도 파싱: 없거나(빈문자열/null) 숫자로 못 읽으면 null → 맨 뒤로 보냄
  function parseYear(year) {
    if (!year || String(year).trim() === '') return null;
    const n = Number(year);
    return Number.isNaN(n) ? null : n;
  }

  // 제목 비교: 로케일 기준, 대소문자 무시
  function compareTitle(a, b) {
    return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
  }

  // 원본 papers를 mutate하지 않는 파생 정렬 뷰. 최근순은 서버 순서 그대로 반환.
  const sortedPapers = $derived.by(() => {
    if (sortMode === 'recent') return papers;
    const list = [...papers];
    if (sortMode === 'title') {
      list.sort(compareTitle);
      return list;
    }
    // 년도순: 오름차순(과거→최신), 무년도는 맨 뒤, 동률은 제목순
    list.sort((a, b) => {
      const ya = parseYear(a.year);
      const yb = parseYear(b.year);
      if (ya === null && yb === null) return compareTitle(a, b);
      if (ya === null) return 1;
      if (yb === null) return -1;
      if (ya !== yb) return ya - yb;
      return compareTitle(a, b);
    });
    return list;
  });

  load();
</script>

<header class="page-header">
  <div>
    <p class="eyebrow">MY LIBRARY</p>
    <h1>모든 자료</h1>
    <p class="page-description">Zotero에 모아둔 논문과 웹 자료를 한눈에 둘러보세요.</p>
  </div>
  <div class="home-actions">
    <button class="icon-action secondary" onclick={toggleAddForm} aria-pressed={showAddForm} aria-label="웹페이지 추가">
      <Icon name="plus" size={16} />
      <span>웹페이지 추가</span>
    </button>
    <button class="icon-action" onclick={runSync} disabled={syncing} aria-label="Zotero 동기화">
      <span class:spinning={syncing}><Icon name="refresh" size={19} /></span>
      <span>{syncing ? '동기화 중' : '동기화'}</span>
    </button>
  </div>
</header>
{#if showAddForm}
  <form class="search-field" onsubmit={(e) => { e.preventDefault(); submitWebpage(); }}>
    <Icon name="external" size={19} />
    <input
      bind:this={addUrlInput}
      type="url"
      class="search-input"
      placeholder="https://example.com/article"
      aria-label="추가할 웹페이지 URL"
      bind:value={webpageUrl}
      disabled={adding}
    />
    <button class="icon-action" type="submit" disabled={adding || !webpageUrl.trim()}>
      {adding ? '추가 중' : '추가'}
    </button>
  </form>
  {#if addError}
    <p class="notice error-state"><Icon name="alert" size={15} /> {addError}</p>
  {/if}
{/if}
{#if syncStatus}
  <p class="notice"><Icon name="check" size={15} /> {syncStatus}</p>
{/if}

<div class="content-heading">
  <h2>서가</h2>
  {#if !loading && !error}<span>{papers.length}편</span>{/if}
  {#if !loading && !error && papers.length > 0}
    <div class="sort-toggle" role="group" aria-label="정렬 방식">
      <button class="sort-option" class:active={sortMode === 'recent'} aria-pressed={sortMode === 'recent'} onclick={() => (sortMode = 'recent')}>최근순</button>
      <button class="sort-option" class:active={sortMode === 'year'} aria-pressed={sortMode === 'year'} onclick={() => (sortMode = 'year')}>년도순</button>
      <button class="sort-option" class:active={sortMode === 'title'} aria-pressed={sortMode === 'title'} onclick={() => (sortMode = 'title')}>이름순</button>
    </div>
    <div class="view-toggle" role="group" aria-label="보기 방식">
      <button class:active={viewMode === 'list'} onclick={() => (viewMode = 'list')} aria-label="목록 보기" aria-pressed={viewMode === 'list'}><Icon name="list" size={16} /></button>
      <button class:active={viewMode === 'grid'} onclick={() => (viewMode = 'grid')} aria-label="표지 보기" aria-pressed={viewMode === 'grid'}><Icon name="grid" size={15} /></button>
    </div>
  {/if}
</div>

{#if loading}
  <div class="skeleton-list" aria-label="논문을 불러오는 중">
    {#each Array(4) as _}
      <div class="skeleton-card"><i></i><span></span><span></span></div>
    {/each}
  </div>
{:else if error}
  <div class="state-card error-state"><Icon name="alert" size={25} /><strong>불러오지 못했어요</strong><p>{error}</p></div>
{:else if papers.length === 0}
  <div class="state-card">
    <span class="state-icon"><Icon name="library" size={27} /></span>
    <strong>아직 논문이 없어요</strong>
    <p>Zotero와 동기화하면 논문이 여기에 모입니다.</p>
  </div>
{:else}
  <div class="paper-list" class:cover-grid={viewMode === 'grid'}>
    {#each sortedPapers as p (p.itemKey)}
      <PaperCard paper={p} onOpen={onOpenPaper} onDelete={deletePaper} variant={viewMode === 'grid' ? 'cover' : 'list'} />
    {/each}
  </div>
{/if}

<style>
  /* 정렬 토글을 헤딩 오른쪽에 붙이고, 제목/개수는 왼쪽에 그대로 둔다 */
  .content-heading :global(h2) {
    margin-right: auto;
  }

  .sort-toggle {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface-subtle);
  }

  .sort-option {
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.3rem 0.7rem;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .sort-option:hover {
    color: var(--text-soft);
  }

  .sort-option.active {
    background: var(--accent);
    color: #fffdf9;
  }

  .view-toggle {
    display: inline-flex;
    flex: 0 0 auto;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface-subtle);
  }

  .view-toggle button {
    display: grid;
    width: 30px;
    height: 28px;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--text-muted);
  }

  .view-toggle button.active {
    background: var(--surface);
    box-shadow: 0 1px 4px rgba(66, 43, 29, 0.12);
    color: var(--accent);
  }

  .cover-grid {
    grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
    gap: 2rem 1.35rem;
    padding: 1rem 0 2rem;
  }

  @media (max-width: 620px) {
    .content-heading {
      flex-wrap: wrap;
    }

    .sort-toggle {
      order: 3;
      width: 100%;
      margin-top: 0.3rem;
    }

    .sort-option {
      flex: 1;
    }

    .cover-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1.6rem 1rem;
    }
  }
</style>
