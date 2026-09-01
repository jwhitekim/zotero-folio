<script>
  import Icon from './Icon.svelte';
  import LogoutButton from './LogoutButton.svelte';
  import { onMount } from 'svelte';

  let { tab, username = '', onSelectTab, onSearch } = $props();

  const tabs = [
    { id: 'home', label: '홈', icon: 'home' },
    { id: 'papers', label: '논문', icon: 'library' },
    { id: 'collections', label: '컬렉션', icon: 'folder' },
  ];

  // 모바일 캡슐 안에서 활성 탭 뒤로 슬라이드하는 유리 인디케이터 — 탭 버튼
  // 자신의 실측 폭(offsetWidth)을 그대로 따라간다("검색"은 캡슐 밖 원형
  // 버튼이라 셋 중 아무것도 활성이 아니면 인디케이터를 숨긴다).
  let navEl = $state();
  let buttonEls = {};
  let indicatorLeft = $state(0);
  let indicatorWidth = $state(0);
  let indicatorVisible = $state(false);

  function measureIndicator() {
    const btn = buttonEls[tab];
    indicatorVisible = Boolean(btn);
    if (!btn) return;
    indicatorLeft = btn.offsetLeft;
    indicatorWidth = btn.offsetWidth;
  }

  $effect(() => {
    tab;
    measureIndicator();
  });

  onMount(() => {
    measureIndicator();
    // 웹폰트(Pretendard)가 늦게 로드되면 라벨 폭이 바뀌어 인디케이터가
    // 살짝 어긋날 수 있어, 폰트 준비 후 한 번 더 맞춘다.
    document.fonts?.ready?.then(measureIndicator);

    const ro = new ResizeObserver(measureIndicator);
    if (navEl) ro.observe(navEl);
    window.addEventListener('resize', measureIndicator);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measureIndicator);
    };
  });
</script>

<aside class="library-sidebar">
  <div class="sidebar-brand">
    <span class="sidebar-brand-mark"><Icon name="library" size={22} strokeWidth={1.65} /></span>
    <span><strong>Folio</strong><small>Research library</small></span>
  </div>

  <button class="sidebar-search" class:active={tab === 'search'} onclick={onSearch}>
    <Icon name="search" size={17} />
    <span>서재에서 검색</span>
    <kbd>⌘ K</kbd>
  </button>

  <nav class="tabbar-desktop" aria-label="주요 메뉴">
    <p>MY LIBRARY</p>
    {#each tabs as t (t.id)}
      <button
        class="tab-btn-desktop"
        class:active={tab === t.id}
        onclick={() => onSelectTab(t.id)}
        aria-current={tab === t.id ? 'page' : undefined}
      >
        <Icon name={t.icon} size={18} />
        <span>{t.label}</span>
        {#if tab === t.id}<i></i>{/if}
      </button>
    {/each}
  </nav>

  <div class="sidebar-quote">
    <Icon name="spark" size={16} />
    <p>읽고, 생각하고,<br />내 언어로 남기세요.</p>
  </div>

  <div class="sidebar-account">
    <span class="account-avatar">{(username || 'F').slice(0, 1).toUpperCase()}</span>
    <span class="account-copy"><strong>{username || '내 서재'}</strong><small>Zotero 연결됨</small></span>
    <LogoutButton compact />
  </div>
</aside>

<!-- 모바일: 엄지로 닿기 쉬운 하단에 떠 있는 캡슐 + 원형 검색 버튼. -->
<div class="tabbar-row">
  <nav class="tabbar" aria-label="주요 메뉴" bind:this={navEl}>
    <div
      class="tab-indicator"
      class:visible={indicatorVisible}
      style="transform: translateX({indicatorLeft}px); width: {indicatorWidth}px;"
    ></div>
    {#each tabs as t (t.id)}
      <button
        class="tab-btn"
        class:active={tab === t.id}
        onclick={() => onSelectTab(t.id)}
        aria-current={tab === t.id ? 'page' : undefined}
        bind:this={buttonEls[t.id]}
      >
        <span class="icon"><Icon name={t.icon} size={21} /></span>
        <span class="label">{t.label}</span>
      </button>
    {/each}
  </nav>
  <button
    class="search-fab"
    class:active={tab === 'search'}
    onclick={onSearch}
    aria-label="검색"
    aria-current={tab === 'search' ? 'page' : undefined}
  >
    <Icon name="search" size={21} />
  </button>
</div>
