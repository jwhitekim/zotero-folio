<script>
  import { onMount } from 'svelte';
  import TabBar from './components/TabBar.svelte';
  import HomeDashboard from './pages/HomeDashboard.svelte';
  import PapersList from './pages/PapersList.svelte';
  import SearchPapers from './pages/SearchPapers.svelte';
  import PaperDetailSplit from './pages/PaperDetailSplit.svelte';
  import Collections from './pages/Collections.svelte';
  import LoginPage from './pages/LoginPage.svelte';
  import { api } from './services/api.js';

  let tab = $state('home'); // 'home' | 'papers' | 'collections' | 'search'
  let detailKey = $state(null); // 논문 상세로 들어가면 itemKey, 아니면 null
  let searchQuery = $state('');
  let searchResults = $state([]);
  let searchHasSearched = $state(false);

  // Zotero 계정 연결 여부 — 연결 전까지는 나머지 화면 대신 로그인 안내만 보여준다.
  let authChecked = $state(false);
  let authConnected = $state(false);
  let authUsername = $state('');
  let authError = $state('');
  let currentPath = $state(window.location.pathname);
  let showLoginRoute = $derived(currentPath === '/login');

  async function checkAuth() {
    authChecked = false;
    authError = '';
    try {
      const status = await api.authStatus();
      authConnected = status.connected;
      authUsername = status.username || '';
      if (!status.connected && currentPath !== '/login') {
        history.replaceState({}, '', '/login');
        currentPath = '/login';
      }
    } catch (err) {
      authConnected = false;
      authError = err.message;
    } finally {
      authChecked = true;
    }
  }

  checkAuth();

  onMount(() => {
    const onPopState = () => (currentPath = window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  });

  function selectTab(t) {
    tab = t;
    detailKey = null;
  }

  function openSearch() {
    tab = 'search';
    detailKey = null;
  }

  function openPaper(key) {
    detailKey = key;
  }

  function closeDetail() {
    detailKey = null;
  }
</script>

<main
  class:reading-mode={Boolean(detailKey) && !showLoginRoute}
  class:login-mode={!authConnected || showLoginRoute}
>
  {#if !authChecked}
    <div class="auth-loading" aria-label="로그인 상태 확인 중">
      <span class="folio-loading-mark">F</span>
      <strong>Folio</strong>
      <i></i>
    </div>
  {:else if showLoginRoute || !authConnected}
    <LoginPage error={authError} onRetry={checkAuth} connected={authConnected} username={authUsername} />
  {:else if detailKey}
    <PaperDetailSplit
      itemKey={detailKey}
      onBack={closeDetail}
      backLabel={tab === 'search' ? '검색 결과' : tab === 'collections' ? '컬렉션' : '라이브러리'}
    />
  {:else if tab === 'home'}
    <HomeDashboard onOpenPaper={openPaper} username={authUsername} />
  {:else if tab === 'papers'}
    <PapersList onOpenPaper={openPaper} />
  {:else if tab === 'collections'}
    <Collections onOpenPaper={openPaper} />
  {:else if tab === 'search'}
    <SearchPapers
      onOpenPaper={openPaper}
      bind:query={searchQuery}
      bind:papers={searchResults}
      bind:hasSearched={searchHasSearched}
    />
  {/if}
</main>

{#if authConnected && !detailKey && !showLoginRoute}
  <TabBar {tab} onSelectTab={selectTab} onSearch={openSearch} />
{/if}
