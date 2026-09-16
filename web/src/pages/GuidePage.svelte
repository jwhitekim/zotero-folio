<script>import Icon from '../components/Icon.svelte';</script>

<article class="journal">
  <nav class="journal-nav"><a class="brand" href="/"><Icon name="library" size={18}/> Folio</a><span>FIELD GUIDE · 01</span><a href="/">라이브러리로 돌아가기 ↗</a></nav>

  <header class="cover">
    <div class="cover-copy"><p class="kicker">READ · MARK · KEEP</p><h1>당신의 연구가<br/>한 편의 기록이<br/>되는 과정.</h1><p class="lede">Zotero에 모은 자료를 읽고, 표시하고, 자신의 언어로 남기는 방법.</p></div>
    <figure><img src="/images/guide-editorial.png" alt="노트와 펜이 놓인 연구 책상"/><figcaption>FIG. 01 — A quiet place for close reading</figcaption></figure>
    <ol class="index">
      <li><a href="#connect"><b>01</b><span>Connect</span><em>Zotero 연결</em></a></li><li><a href="#explore"><b>02</b><span>Explore</span><em>자료 탐색</em></a></li><li><a href="#read"><b>03</b><span>Read</span><em>읽고 표시하기</em></a></li><li><a href="#keep"><b>04</b><span>Keep</span><em>생각 기록하기</em></a></li><li><a href="#find"><b>05</b><span>Find</span><em>정리하고 찾기</em></a></li>
    </ol>
  </header>

  <section id="connect" class="connect scene">
    <span class="num">01</span><div class="copy"><p class="kicker">CONNECT / 시작하기</p><h2>Zotero는 보관하고,<br/>Folio는 읽게 합니다.</h2><p>기존 라이브러리를 그대로 연결합니다. 논문, 메모와 PDF 필기는 다시 옮길 필요 없이 같은 Zotero 계정에 남습니다.</p><small>원본 제목·저자·PDF는 Folio가 수정하지 않습니다.</small></div>
    <figure><img src="/images/guide-sync.png" alt="Zotero와 Folio 연결"/><figcaption>LIBRARY ↔ READING SPACE</figcaption></figure>
  </section>

  <section id="explore" class="explore scene">
    <div><span class="num">02</span><p class="kicker">EXPLORE / 자료 탐색</p><h2>읽을 것을 고르는 시간도<br/>연구의 일부니까.</h2></div>
    <figure><img src="/images/guide-paper.png" alt="정리된 논문과 책갈피"/><figcaption>FIG. 02 — Papers, sorted your way</figcaption></figure>
    <div class="notes"><p><b>동기화</b><span>Zotero의 변경사항을 불러옵니다.</span></p><p><b>보기 방식</b><span>정렬과 목록·표지 보기를 전환합니다.</span></p><p><b>웹페이지</b><span>URL을 연구 자료로 저장합니다.</span></p></div>
  </section>

  <section id="read" class="read scene">
    <img src="/images/guide-highlight.png" alt="논문을 읽고 하이라이트하는 모습"/>
    <div class="read-copy"><span class="num">03</span><p class="kicker">READ / 읽고 표시하기</p><h2>원문과 생각 사이의<br/>거리를 줄입니다.</h2><p>PDF 옆에 메모를 펼쳐두고 읽습니다. 텍스트 하이라이트, 자유 필기, 프리핸드 형광펜과 지우개를 한 흐름 안에서 사용하세요.</p><blockquote>표시한 문장과 떠오른 생각이 같은 화면에 머뭅니다.</blockquote></div>
  </section>

  <section id="keep" class="keep scene">
    <div><span class="num">04</span><p class="kicker">KEEP / 생각 기록하기</p><h2>논문 밖의 생각도<br/>놓치지 마세요.</h2></div>
    <figure><img src="/images/guide-note.png" alt="독립적인 생각을 기록한 노트"/><figcaption>FIG. 04 — Notes can stand on their own</figcaption></figure>
    <p>특정 논문에 딸린 메모는 같은 note를 계속 다듬고, 아직 어느 논문에도 속하지 않은 생각은 독립 메모로 남깁니다.</p>
  </section>

  <section id="find" class="find scene">
    <div class="find-title"><span class="num">05</span><p class="kicker">ORGANIZE & FIND</p><h2>쌓인 기록을<br/>다시 만나는 방법.</h2></div>
    <div class="tool"><img src="/images/guide-folder.png" alt="컬렉션 폴더"/><h3>컬렉션</h3><p>Zotero 폴더 구조를 그대로 따라가며 자료를 탐색합니다.</p></div>
    <div class="tool"><img src="/images/guide-search.png" alt="자료 검색"/><h3>검색</h3><p>상단 검색 또는 Ctrl/Cmd+K로 제목을 바로 찾습니다.</p></div>
  </section>

  <footer><p>YOUR LIBRARY, IN YOUR WORDS.</p><h2>이제 첫 논문을 펼쳐보세요.</h2><a href="/"><Icon name="library" size={18}/> Folio로 돌아가기</a></footer>
</article>

<style>
  .journal{max-width:1240px;margin:auto;padding:0 clamp(1rem,4vw,4rem) 5rem;color:var(--text)}.journal-nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:76px;border-bottom:1px solid var(--border-strong);font-size:.68rem;letter-spacing:.1em}.journal-nav a{color:var(--text);text-decoration:none}.journal-nav>a:last-child{justify-self:end;text-align:right}.brand{display:flex;align-items:center;gap:.5rem;font-family:var(--font-serif);font-size:1rem;letter-spacing:0}.journal-nav span{color:var(--text-muted)}
  figure{margin:0}figcaption{margin-top:.65rem;color:var(--text-muted);font-size:.62rem;letter-spacing:.1em}.kicker{margin:0 0 1rem!important;color:var(--accent)!important;font-size:.67rem!important;font-weight:800;letter-spacing:.14em}.num{display:block;color:var(--accent);font-family:var(--font-serif);font-size:clamp(3.5rem,7vw,7rem);line-height:.8}.scene{border-top:1px solid var(--border-strong)}.scene h2{margin:0 0 1.5rem;font-family:var(--font-serif);font-size:clamp(2rem,4vw,4.5rem);font-weight:500;line-height:1.18;letter-spacing:-.05em}.scene p{color:var(--text-soft);line-height:1.85}
  .cover{display:grid;grid-template-columns:minmax(0,.95fr) minmax(360px,1.05fr);min-height:calc(100dvh - 76px);padding:clamp(3rem,8vh,7rem) 0 2rem;gap:3rem clamp(3rem,6vw,6rem);align-items:center}.cover-copy,.cover figure{min-width:0}.cover-copy h1{margin:0;font-family:var(--font-serif);font-size:clamp(3rem,6vw,6rem);font-weight:500;line-height:1.04;letter-spacing:-.07em}.lede{max-width:450px;margin-top:2rem;color:var(--text-soft);line-height:1.9}.cover figure img{display:block;width:100%;height:clamp(350px,56vh,620px);object-fit:cover}.index{grid-column:1/-1;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));width:100%;margin:1rem 0 0;padding:0;border-top:1px solid var(--border-strong);list-style:none;align-self:end}.index a{display:grid;padding:1rem .5rem 1rem 0;color:var(--text);text-decoration:none;grid-template-columns:2rem minmax(0,1fr)}.index li+li{padding-left:1rem;border-left:1px solid var(--border)}.index b{color:var(--accent);font-size:.7rem}.index span{font-family:var(--font-serif)}.index em{grid-column:2;color:var(--text-muted);font-size:.68rem;font-style:normal}
  .connect{display:grid;grid-template-columns:90px minmax(0,1fr) minmax(300px,.9fr);gap:3rem clamp(2.5rem,5vw,5rem);padding:7rem 0;align-items:start}.connect .copy{align-self:center;min-width:0}.connect figure{min-width:0}.connect figure img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover}.connect small{display:block;margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border);color:var(--text-muted)}
  .explore{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(0,1.2fr);gap:3rem clamp(3rem,6vw,6rem);padding:7rem 0;align-items:start}.explore figure img{display:block;width:100%;height:520px;object-fit:cover}.notes{align-self:end}.notes p{display:grid;grid-template-columns:100px minmax(0,1fr);gap:1rem;margin:0;padding:1rem 0;border-top:1px solid var(--border)}.notes b{color:var(--text)}
  .read{display:grid;grid-template-columns:1.1fr .9fr;min-height:760px}.read>img{width:100%;height:100%;object-fit:cover}.read-copy{display:flex;padding:6rem 0 6rem clamp(2rem,6vw,6rem);flex-direction:column;justify-content:center}.read-copy .num,.keep .num,.find .num{margin-bottom:4rem}blockquote{margin:3rem 0 0;padding:1.5rem 0 0;border-top:1px solid var(--accent);color:var(--accent-strong);font-family:var(--font-serif);font-size:1.2rem;line-height:1.7}
  .keep{display:grid;grid-template-columns:minmax(240px,.8fr) minmax(320px,1.2fr) minmax(190px,.7fr);align-items:end;gap:3rem clamp(2rem,5vw,5rem);padding:7rem 0}.keep figure img{display:block;width:100%;height:560px;object-fit:cover}.keep>p{padding-bottom:3rem}.find{display:grid;grid-template-columns:minmax(240px,.8fr) repeat(2,minmax(0,1fr));gap:2rem clamp(2rem,4vw,4rem);padding:7rem 0}.tool{min-width:0;padding-left:1.5rem;border-left:1px solid var(--border-strong)}.tool img{display:block;width:100%;aspect-ratio:1;object-fit:cover}.tool h3{margin:1.5rem 0 .5rem;font-family:var(--font-serif);font-size:1.5rem}
  footer{display:grid;min-height:430px;place-content:center;text-align:center;border-top:1px solid var(--border-strong)}footer>p{color:var(--accent);font-size:.68rem;font-weight:800;letter-spacing:.14em}footer h2{font-family:var(--font-serif);font-size:clamp(2rem,5vw,4rem);font-weight:500}footer a{display:inline-flex;align-items:center;justify-content:center;gap:.6rem;width:max-content;margin:1.5rem auto 0;padding:.9rem 1.2rem;border-bottom:1px solid var(--text);color:var(--text);text-decoration:none}
  @media(max-width:980px){.connect{grid-template-columns:75px 1fr}.connect figure{grid-column:2}.keep{grid-template-columns:1fr 1fr}.keep>p{grid-column:2}.find{grid-template-columns:1fr 1fr}.find-title{grid-column:1/-1}.read{min-height:620px}}
  @media(max-width:760px){.journal-nav{grid-template-columns:1fr auto}.journal-nav>span{display:none}.cover{display:block;min-height:auto;padding-top:3rem}.cover figure{margin-top:2.5rem}.cover figure img{height:360px}.index{grid-template-columns:1fr;margin-top:2.5rem}.index li+li{padding-left:0;border-left:0;border-top:1px solid var(--border)}.connect,.explore,.read,.keep,.find{display:flex;padding:4.5rem 0;flex-direction:column;gap:2rem}.connect figure{order:-1}.connect figure img,.explore figure img,.keep figure img{height:340px}.read>img{height:420px}.read-copy{padding:0}.read-copy .num,.keep .num,.find .num{margin-bottom:2rem}.keep>p{padding:0}.tool{padding:1.5rem 0 0;border-left:0;border-top:1px solid var(--border-strong)}}
</style>
