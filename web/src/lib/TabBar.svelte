<script>
  import Icon from './Icon.svelte';

  let { tab, onSelectTab, onSearch } = $props();

  const tabs = [
    { id: 'home', label: '홈', icon: 'home' },
    { id: 'papers', label: '논문', icon: 'library' },
    { id: 'collections', label: '컬렉션', icon: 'folder' },
  ];
</script>

<nav class="tabbar" aria-label="주요 메뉴">
  {#each tabs as t (t.id)}
    <button
      class="tab-btn"
      class:active={tab === t.id}
      onclick={() => onSelectTab(t.id)}
      aria-current={tab === t.id ? 'page' : undefined}
    >
      <span class="icon"><Icon name={t.icon} size={21} /></span>
      <span class="label">{t.label}</span>
    </button>
  {/each}
  <button
    class="tab-btn search-btn"
    class:active={tab === 'search'}
    onclick={onSearch}
    aria-label="검색"
    aria-current={tab === 'search' ? 'page' : undefined}
  >
    <span class="icon"><Icon name="search" size={21} /></span>
    <span class="label">검색</span>
  </button>
</nav>
