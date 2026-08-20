<script>
  import { api } from '../services/api.js';
  import Icon from '../components/Icon.svelte';
  import LogoutButton from '../components/LogoutButton.svelte';
  import PaperCard from '../components/PaperCard.svelte';

  let { onOpenPaper, username = '' } = $props();

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

  async function deletePaper(itemKey) {
    await api.deletePaper(itemKey);
    papers = papers.filter((p) => p.itemKey !== itemKey);
  }

  load();
</script>

<header class="page-header home-header">
  <div>
    <p class="eyebrow">FOLIO / HOME</p>
    <h1>{username ? `${username}님의 서재` : '나의 서재'}</h1>
    <p class="page-description">읽고, 생각하고, 내 언어로 남겨보세요.</p>
  </div>
  <div class="home-actions">
    <LogoutButton compact />
    <button class="icon-action" onclick={runSync} disabled={syncing} aria-label="Zotero 동기화">
      <span class:spinning={syncing}><Icon name="refresh" size={19} /></span>
      <span>{syncing ? '동기화 중' : '동기화'}</span>
    </button>
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
    <div class="stat-card"><span>전체 논문</span><strong>{papers.length}</strong><small>편</small></div>
    <div class="stat-card"><span>PDF 보관</span><strong>{papers.filter((paper) => paper.hasPdf).length}</strong><small>편</small></div>
    <div class="stat-card accent-stat"><span>최근 추가</span><strong>{papers.length ? '최근' : '—'}</strong><small>{papers.length ? '업데이트됨' : '아직 없음'}</small></div>
  </div>

  <div class="content-heading home-section-heading"><h2>최근 논문</h2><span>{Math.min(papers.length, 5)}편</span></div>
  {#if papers.length === 0}
    <div class="state-card"><span class="state-icon"><Icon name="library" size={27} /></span><strong>라이브러리가 비어 있어요</strong><p>Zotero와 동기화하면 최근 논문이 여기에 표시됩니다.</p></div>
  {:else}
    <div class="paper-list">
      {#each papers.slice(0, 5) as p (p.itemKey)}
        <PaperCard paper={p} onOpen={onOpenPaper} onDelete={deletePaper} />
      {/each}
    </div>
  {/if}
{/if}
