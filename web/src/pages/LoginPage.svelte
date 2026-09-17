<script>
  import Icon from '../components/Icon.svelte';
  let { error = '', onRetry, connected = false, username = '' } = $props();
</script>

<div class="folio-cover">
  <nav class="cover-nav">
    <a class="wordmark" href="/"><Icon name="library" size={20} /> <b>Folio</b></a>
    <span>PERSONAL RESEARCH JOURNAL · VOL. 01</span>
    <a href="/guide">사용 가이드 ↗</a>
  </nav>

  <section class="cover-spread">
    <div class="cover-main">
      <div class="cover-copy">
        <p class="issue">YOUR RESEARCH, YOUR WORDS</p>
        <h1>읽은 것을<br />내 생각으로<br />남기세요.</h1>
        <p class="dek">논문 원문과 나만의 노트를 한 흐름으로 연결하는 개인 연구 공간.</p>
      </div>

      <figure class="research-figure">
        <img src="/images/login-research-journal.png" alt="사용 흔적이 남은 연구 노트와 논문" />
        <figcaption><span>FIG. 01</span> Close reading leaves a trace.</figcaption>
      </figure>
    </div>

    <div class="entry">
      <div class="entry-heading"><span>BEGIN HERE</span><h2>내 Zotero에서<br />계속 읽기</h2></div>
      <p>Zotero 계정을 연결하면 저장된 논문과 컬렉션을 그대로 불러옵니다.</p>
      {#if error}
        <div class="entry-status error" role="alert"><Icon name="alert" size={17} /><span><b>서버에 연결하지 못했어요</b>{error}</span></div>
        <button class="entry-button" onclick={onRetry}><Icon name="refresh" size={17} /> 다시 확인</button>
      {:else if connected}
        <div class="entry-status"><Icon name="check" size={17} /><span><b>Zotero 연결 완료</b>{username || '내 계정'}</span></div>
        <a class="entry-button" href="/"><Icon name="library" size={18} /> 내 라이브러리로 이동 <Icon name="chevron" size={18} /></a>
        <a class="entry-sub" href="/oauth/login">다른 Zotero 계정으로 연결</a>
      {:else}
        <a class="entry-button" href="/oauth/login"><b class="z-mark">Z</b> Zotero로 계속하기 <Icon name="chevron" size={18} /></a>
      {/if}
      <div class="trust"><Icon name="shield" size={15} /><span><b>OAuth로 안전하게 연결합니다.</b> Folio는 Zotero 비밀번호를 저장하거나 확인하지 않습니다.</span></div>
    </div>
  </section>
  <footer class="cover-footer"><span>READ</span><span>MARK</span><span>KEEP</span><p>Folio works with your Zotero library.</p></footer>
</div>

<style>
  .folio-cover{display:grid;width:100%;height:100%;overflow:hidden;padding:0 clamp(1.25rem,4vw,4.5rem);background:var(--surface);color:var(--text);grid-template-rows:76px minmax(0,1fr) 56px}
  .cover-nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:76px;border-bottom:1px solid var(--border-strong);font-size:.68rem;letter-spacing:.1em}.cover-nav a{color:var(--text);text-decoration:none}.cover-nav>a:last-child{justify-self:end}.cover-nav>span{color:var(--text-muted)}
  .wordmark{display:flex;align-items:center;gap:.55rem;font-family:var(--font-serif);font-size:1.1rem;letter-spacing:0}
  .cover-spread{display:grid;min-height:0;overflow:hidden;grid-template-columns:minmax(0,1.6fr) minmax(280px,.85fr);gap:clamp(2.5rem,5vw,5.5rem);align-items:stretch;padding:clamp(1.5rem,4vh,3.5rem) 0}
  .cover-main{display:grid;min-height:0;min-width:0;grid-template-rows:auto minmax(0,1fr);gap:clamp(1.5rem,3vh,2.5rem)}
  .issue{margin:0 0 1.5rem;color:var(--accent);font-size:.67rem;font-weight:800;letter-spacing:.14em}.cover-copy h1{margin:0;font-family:var(--font-serif);font-size:clamp(2.2rem,3.8vw,4rem);font-weight:500;line-height:1.15;letter-spacing:-.04em}.dek{max-width:420px;margin:1.5rem 0 0;color:var(--text-soft);line-height:1.9}
  .research-figure{display:grid;min-height:0;margin:0;grid-template-rows:minmax(0,1fr) auto}.research-figure img{display:block;width:100%;height:100%;min-height:0;object-fit:cover;object-position:center 30%;filter:saturate(.82) contrast(.96)}.research-figure figcaption{display:flex;justify-content:space-between;gap:1rem;margin-top:.6rem;color:var(--text-muted);font-size:.62rem;letter-spacing:.08em}
  .entry{display:flex;min-width:0;padding:0 0 0 clamp(1.75rem,3.5vw,3rem);border-left:1px solid var(--border-strong);flex-direction:column;justify-content:center}.entry-heading{display:flex;flex-direction:column;gap:.6rem}.entry-heading>span{color:var(--accent);font-size:.62rem;font-weight:800;letter-spacing:.12em}.entry h2{margin:0;font-family:var(--font-serif);font-size:clamp(1.55rem,2.1vw,2.15rem);font-weight:500;line-height:1.28}.entry>p{margin:1.25rem 0;color:var(--text-muted);font-size:.8rem;line-height:1.7}
  .entry-button{display:grid;width:100%;min-height:58px;padding:.8rem 1rem;border:0;border-radius:0;background:var(--accent-strong);color:#fff;font:inherit;font-size:.82rem;font-weight:700;text-decoration:none;grid-template-columns:28px 1fr 24px;align-items:center;cursor:pointer}.entry-button:hover{background:var(--accent)}.z-mark{font-family:Georgia,serif;font-size:1.1rem}
  .trust{display:flex;gap:.7rem;margin-top:1.25rem;color:var(--text-muted);font-size:.7rem;line-height:1.55}.trust b{display:block;color:var(--text-soft)}.entry-status{display:flex;gap:.7rem;margin:1rem 0;padding:.8rem 0;border-block:1px solid var(--border);color:var(--text-soft);font-size:.75rem}.entry-status span,.entry-status b{display:block}.entry-status.error{color:var(--danger)}.entry-sub{display:block;margin-top:1rem;color:var(--text-muted);font-size:.72rem;text-align:center}
  .cover-footer{display:grid;grid-template-columns:auto auto auto 1fr;gap:1.5rem;align-items:center;min-height:56px;border-top:1px solid var(--border-strong);color:var(--accent);font-size:.65rem;font-weight:800;letter-spacing:.14em}.cover-footer p{justify-self:end;margin:0;color:var(--text-muted);font-weight:400;letter-spacing:0}
  @media(max-width:1180px){.cover-spread{grid-template-columns:1fr;gap:2.5rem;align-items:stretch}.cover-main{grid-template-columns:minmax(240px,.85fr) minmax(260px,1.15fr);grid-template-rows:none;align-items:center}.dek{max-width:none}.research-figure{height:340px}.entry{padding:1.75rem 0 0;border-left:0;border-top:1px solid var(--border-strong)}}
  @media(max-width:680px){.folio-cover{display:block;height:auto;min-height:100dvh;overflow:visible;padding:0 1rem}.cover-nav{grid-template-columns:1fr auto}.cover-nav>span{display:none}.cover-spread{display:flex;overflow:visible;padding:2.5rem 0;flex-direction:column;align-items:stretch;gap:2.75rem}.cover-main{display:flex;flex-direction:column;gap:2rem}.cover-copy h1{font-size:clamp(3.2rem,15vw,5rem)}.research-figure{height:340px}.cover-footer{grid-template-columns:auto auto auto;justify-content:space-between}.cover-footer p{display:none}}
</style>
