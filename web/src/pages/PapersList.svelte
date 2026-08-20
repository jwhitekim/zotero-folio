<script>
  import { api } from '../services/api.js';
  import Icon from '../components/Icon.svelte';
  import PaperCard from '../components/PaperCard.svelte';

  let { onOpenPaper } = $props();

  let papers = $state([]);
  let loading = $state(true);
  let error = $state('');
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

  load();
</script>

<header class="page-header">
  <div>
    <p class="eyebrow">FOLIO</p>
    <h1>내 라이브러리</h1>
    <p class="page-description">읽고, 생각하고, 내 언어로 남겨보세요.</p>
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
  <h2>최근 논문</h2>
  {#if !loading && !error}<span>{papers.length}편</span>{/if}
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
  <div class="paper-list">
    {#each papers as p (p.itemKey)}
      <PaperCard paper={p} onOpen={onOpenPaper} onDelete={deletePaper} />
    {/each}
  </div>
{/if}
