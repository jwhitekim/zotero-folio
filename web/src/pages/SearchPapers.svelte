<script>
  import { api } from '../services/api.js';
  import Icon from '../components/Icon.svelte';

  let {
    onOpenPaper,
    query = $bindable(''),
    papers = $bindable([]),
    hasSearched = $bindable(false),
  } = $props();

  let loading = $state(false);
  let error = $state('');
  let inputEl = $state();
  let debounceTimer;
  let requestId = 0;

  async function search() {
    const keyword = query.trim();
    const currentRequest = ++requestId;

    if (!keyword) {
      papers = [];
      hasSearched = false;
      loading = false;
      error = '';
      return;
    }

    loading = true;
    error = '';
    try {
      const result = await api.listPapers(keyword);
      if (currentRequest === requestId) {
        papers = result;
        hasSearched = true;
      }
    } catch (err) {
      if (currentRequest === requestId) error = err.message;
    } finally {
      if (currentRequest === requestId) loading = false;
    }
  }

  function onInput() {
    clearTimeout(debounceTimer);
    if (!query.trim()) {
      search();
      return;
    }
    debounceTimer = setTimeout(search, 280);
  }

  function clearSearch() {
    clearTimeout(debounceTimer);
    query = '';
    search();
    inputEl?.focus();
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && query) clearSearch();
    if (event.key === 'Enter') {
      clearTimeout(debounceTimer);
      search();
    }
  }

  $effect(() => {
    inputEl?.focus();
  });
</script>

<header class="search-page-header">
  <p class="eyebrow">DISCOVER</p>
  <h1>논문 검색</h1>
  <p class="page-description">라이브러리에서 필요한 논문을 빠르게 찾아보세요.</p>
</header>

<div class="search-panel">
  <div class="search-field search-field-large">
    <Icon name="search" size={21} />
    <input
      bind:this={inputEl}
      type="search"
      class="search-input"
      placeholder="찾고 싶은 논문 제목을 입력하세요"
      aria-label="논문 제목으로 검색"
      bind:value={query}
      oninput={onInput}
      onkeydown={onKeydown}
    />
    {#if query}
      <button class="clear-search" onclick={clearSearch} aria-label="검색어 지우기">
        <Icon name="close" size={17} />
      </button>
    {/if}
  </div>
  <p class="search-help"><span>TIP</span> 제목의 일부만 입력해도 검색할 수 있어요.</p>
</div>

{#if loading}
  <div class="content-heading"><h2>검색 중</h2></div>
  <div class="skeleton-list" aria-label="검색 결과를 불러오는 중">
    {#each Array(3) as _}<div class="skeleton-card"><i></i><span></span><span></span></div>{/each}
  </div>
{:else if error}
  <div class="state-card error-state"><Icon name="alert" size={25} /><strong>검색하지 못했어요</strong><p>{error}</p></div>
{:else if hasSearched}
  <div class="content-heading search-results-heading">
    <h2>검색 결과</h2>
    <span>{papers.length}편</span>
  </div>
  {#if papers.length === 0}
    <div class="state-card search-empty">
      <span class="state-icon"><Icon name="search" size={27} /></span>
      <strong>일치하는 논문이 없어요</strong>
      <p>검색어를 더 짧게 입력하거나 다른 제목으로 찾아보세요.</p>
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
{:else}
  <div class="search-start">
    <div class="search-orbit"><span><Icon name="search" size={30} /></span></div>
    <strong>어떤 논문을 찾고 있나요?</strong>
    <p>저자명이나 키워드가 아닌 논문 제목을 기준으로 검색합니다.</p>
  </div>
{/if}
