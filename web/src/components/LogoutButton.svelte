<script>
  import Icon from './Icon.svelte';
  import { api } from '../services/api.js';

  let { compact = false } = $props();
  let busy = $state(false);
  let error = $state('');

  async function logout() {
    busy = true;
    error = '';
    try {
      await api.logout();
      window.location.assign('/login');
    } catch (err) {
      error = err.message;
      busy = false;
    }
  }
</script>

<div class="logout-wrap">
  <button class="logout-button" class:compact onclick={logout} disabled={busy} aria-label="로그아웃">
    <Icon name="logout" size={17} />
    {#if !compact}<span>{busy ? '로그아웃 중…' : '로그아웃'}</span>{/if}
  </button>
  {#if error}<span class="logout-error">{error}</span>{/if}
</div>
