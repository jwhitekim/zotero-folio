<script>
  import Icon from './Icon.svelte';
  import { onMount } from 'svelte';

  let { tab, onSelectTab, onSearch } = $props();

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

<!-- 데스크톱: 칼럼(#app, 최대 760px) 상단에 고정된 평평한 탭바. 화면이 넓어서
     떠 있는 캡슐 대신 늘 보이는 일반 헤더 형태가 자연스럽고, 검색도 라벨을
     가릴 이유가 없어 다른 탭과 동일하게 보여준다. -->
<nav class="tabbar-desktop" aria-label="주요 메뉴">
  {#each tabs as t (t.id)}
    <button
      class="tab-btn-desktop"
      class:active={tab === t.id}
      onclick={() => onSelectTab(t.id)}
      aria-current={tab === t.id ? 'page' : undefined}
    >
      <Icon name={t.icon} size={17} />
      <span>{t.label}</span>
    </button>
  {/each}
  <button
    class="tab-btn-desktop"
    class:active={tab === 'search'}
    onclick={onSearch}
    aria-current={tab === 'search' ? 'page' : undefined}
  >
    <Icon name="search" size={17} />
    <span>검색</span>
  </button>
</nav>

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
