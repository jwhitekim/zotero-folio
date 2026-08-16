<script>
  import Icon from '../components/Icon.svelte';

  let { error = '', onRetry, connected = false, username = '' } = $props();
</script>

<div class="login-page">
  <section class="login-story">
    <div class="login-brand">
      <span class="folio-logo"><Icon name="library" size={23} strokeWidth={1.7} /></span>
      <strong>Folio</strong>
    </div>

    <div class="login-message">
      <p class="eyebrow">YOUR RESEARCH, YOUR WORDS</p>
      <h1>읽은 것을<br />내 생각으로 남기세요.</h1>
      <p>논문 원문과 나만의 노트를 한 화면에서 연결하는 개인 연구 공간입니다.</p>
    </div>

    <div class="login-features">
      <div>
        <span><Icon name="file" size={18} /></span>
        <p><strong>집중해서 읽기</strong><small>PDF와 노트를 나란히 보세요.</small></p>
      </div>
      <div>
        <span><Icon name="note" size={18} /></span>
        <p><strong>직접 정리하기</strong><small>생각을 내 언어로 기록하세요.</small></p>
      </div>
      <div>
        <span><Icon name="refresh" size={18} /></span>
        <p><strong>Zotero와 연결</strong><small>기존 라이브러리를 그대로 사용해요.</small></p>
      </div>
    </div>

    <p class="login-quote">“요약보다 오래 남는 건, 직접 정리한 생각입니다.”</p>
  </section>

  <section class="login-action-area">
    <div class="login-card">
      <span class="login-card-icon"><Icon name="library" size={25} /></span>
      <p class="eyebrow">WELCOME TO FOLIO</p>
      <h2>연구 공간 시작하기</h2>
      <p class="login-card-description">Zotero 계정을 연결하면 저장된 논문과 컬렉션을 바로 불러옵니다.</p>

      {#if error}
        <div class="login-error" role="alert">
          <Icon name="alert" size={17} />
          <div><strong>서버에 연결하지 못했어요</strong><span>{error}</span></div>
        </div>
        <button class="login-retry" onclick={onRetry}><Icon name="refresh" size={17} /> 다시 확인</button>
      {:else if connected}
        <div class="login-connected">
          <span><Icon name="check" size={18} /></span>
          <div><strong>Zotero 연결 완료</strong><p>{username || '내 계정'} 계정으로 연결되어 있습니다.</p></div>
        </div>
        <a class="zotero-login-btn home-login-btn" href="/">
          <span class="home-login-icon"><Icon name="library" size={18} /></span>
          <span>내 라이브러리로 이동</span>
          <Icon name="chevron" size={18} />
        </a>
        <a class="reconnect-link" href="/oauth/login">다른 Zotero 계정으로 연결</a>
      {:else}
        <a class="zotero-login-btn" href="/oauth/login">
          <span class="zotero-mark">Z</span>
          <span>Zotero로 계속하기</span>
          <Icon name="chevron" size={18} />
        </a>
      {/if}

      <div class="login-security">
        <Icon name="shield" size={16} />
        <p><strong>안전한 OAuth 연결</strong><span>Folio는 Zotero 비밀번호를 저장하거나 확인하지 않습니다.</span></p>
      </div>

      <p class="login-terms">계속하면 Folio가 내 Zotero 라이브러리에 접근하는 것을 허용하게 됩니다.</p>
    </div>
  </section>
</div>
