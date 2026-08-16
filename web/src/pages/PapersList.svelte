<script>
  import { api } from '../services/api.js';
  import Icon from '../components/Icon.svelte';

  let { onOpenPaper } = $props();

  let papers = $state([]);
  let loading = $state(true);
  let error = $state('');
  let syncing = $state(false);
  let syncStatus = $state('');

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

  load();
</script>

<header class="page-header">
  <div>
    <p class="eyebrow">FOLIO</p>
    <h1>내 라이브러리</h1>
    <p class="page-description">읽고, 생각하고, 내 언어로 남겨보세요.</p>
  </div>
  <button class="icon-action" onclick={runSync} disabled={syncing} aria-label="Zotero 동기화">
    <span class:spinning={syncing}><Icon name="refresh" size={19} /></span>
    <span>{syncing ? '동기화 중' : '동기화'}</span>
  </button>
</header>
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
      <button class="paper-card" onclick={() => onOpenPaper(p.itemKey)}>
        <span class="paper-file"><Icon name="file" size={21} /></span>
        <span class="paper-content">
          <span class="title">{p.title}</span>
          <span class="paper-meta-row">
            <span class="sub">{p.authors.join(', ') || '저자 미상'}{p.year ? ` · ${p.year}` : ''}</span>
            {#if p.hasPdf}<span class="tag">PDF</span>{/if}
          </span>
        </span>
        <span class="chevron"><Icon name="chevron" size={18} /></span>
      </button>
    {/each}
  </div>
{/if}
