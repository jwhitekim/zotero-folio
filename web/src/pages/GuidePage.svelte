<script>
import { onMount } from 'svelte';
import Icon from '../components/Icon.svelte';
const steps=[
{eyebrow:'계정 만들기',title:'Zotero 홈페이지에서 가입을 시작해요',description:'처음이라면 Zotero 계정을 먼저 만들어야 합니다. 화면의 회원가입 메뉴를 찾아 가입 페이지로 이동하세요.',link:{url:'https://www.zotero.org/',label:'zotero.org 바로가기'},tip:'이미 Zotero 계정이 있다면 이 단계는 건너뛰어도 괜찮아요.',image:'/images/zotero-setup/1.png',alt:'Zotero 홈페이지 첫 화면'},
{eyebrow:'정보 입력',title:'계정 정보를 입력하고 가입을 마쳐요',description:'사용자 이름과 이메일, 비밀번호를 차례로 입력한 뒤 가입 버튼을 누르세요. 앞으로 Folio에 연결할 때도 같은 Zotero 계정을 사용하게 됩니다.',tip:'자주 확인하는 이메일을 사용하면 계정 인증과 복구가 쉬워요.',image:'/images/zotero-setup/2.png',alt:'Zotero 회원가입 정보 입력 화면'},
{eyebrow:'이메일 확인',title:'받은 편지함에서 인증을 완료하세요',description:'Zotero가 보낸 확인 메일을 열고 인증 링크를 눌러 주세요. 메일이 바로 오지 않으면 스팸함도 확인해 보세요.',tip:'메일 도착에는 몇 분 정도 걸릴 수 있어요.',image:'/images/zotero-setup/3.png',alt:'Zotero 이메일 인증 안내 화면'},
{eyebrow:'Zotero 앱 설치',title:'컴퓨터에 Zotero 앱을 설치하고 동기화를 설정하세요',description:'이메일 인증이 끝나면 Zotero 데스크톱 앱을 설치할 차례예요. 앱을 열고 환경설정의 동기화(Sync) 메뉴에서 방금 만든 계정으로 로그인하면, 이후 추가하는 논문이 전부 자동으로 동기화됩니다.',tip:'Folio는 이 동기화 데이터를 그대로 읽어오므로, 이 단계를 건너뛰면 Folio에도 자료가 보이지 않아요.',image:'/images/zotero-setup/4.png',alt:'Zotero 이메일 인증 완료와 데스크톱 앱 동기화 설정 안내 화면'},
{eyebrow:'브라우저 확장 프로그램',title:'Zotero Connector를 추가하면 더 편리해요',description:'Chrome에 Zotero Connector를 설치하면 웹에서 찾은 논문과 자료를 클릭 한 번으로 Zotero 라이브러리에 저장할 수 있습니다.',tip:'필수 설치는 아니지만 웹에서 논문을 자주 찾는다면 함께 사용하는 것을 권장해요.',image:'/images/zotero-setup/5.png',alt:'Chrome에 Zotero Connector 확장 프로그램을 추가하는 화면'},
{eyebrow:'Folio 연결',title:'Folio에서 Zotero 연결을 허용하세요',description:'계정 준비가 끝났다면 Folio로 돌아와 Zotero 연결 버튼을 누릅니다. Zotero의 인증 화면으로 이동하면 연결할 계정과 접근 범위를 확인한 뒤 허용해 주세요.',tip:'Folio는 Zotero 비밀번호를 직접 저장하거나 확인하지 않습니다. 허용 후에도 Zotero 계정 설정에서 언제든 권한을 해제할 수 있어요.',image:'/images/zotero-setup/6.png',alt:'Folio의 Zotero 계정 접근 권한 승인 화면'},
{eyebrow:'첫 동기화',title:'내 Zotero 라이브러리를 불러오세요',description:'연결이 끝나면 Folio 홈 화면에서 Zotero 동기화 버튼을 눌러 주세요. Zotero에 보관한 논문, 첨부 파일과 컬렉션 정보를 Folio가 차례로 불러옵니다.',tip:'자료가 많을수록 첫 동기화에는 시간이 조금 더 걸릴 수 있어요.',image:'/images/zotero-setup/7.png',alt:'Folio 홈 화면의 Zotero 동기화 버튼'},
{eyebrow:'설정 완료',title:'첫 논문을 열면 모든 준비가 끝나요',description:'읽고 싶은 논문을 선택해 PDF와 메모 화면을 열어 보세요. 이제 하이라이트와 기록을 한곳에서 이어갈 수 있습니다.',tip:'원본 논문과 서지 정보는 Zotero에 그대로 안전하게 남아 있어요.',image:'/images/zotero-setup/8.png',alt:'Folio에서 논문을 여는 화면'}];

// 등장 애니메이션: IntersectionObserver + CSS transition 조합(레퍼런스는
// docs/notes/design/guide-scroll-reveal-research.md). 각 요소를 onMount에서 한 번만
// observe하고, 화면에 처음 들어오는 순간 revealed 상태를 true로 바꿔
// unobserve — 한 번 나타난 요소는 다시 숨기지 않는 1회성 리빌.
let motionReady = $state(false);
let revealed = $state(steps.map(() => false));
let finishRevealed = $state(false);
let stepEls = [];
let finishEl;

onMount(() => {
  const targets = [...stepEls, finishEl].filter(Boolean);

  if (!('IntersectionObserver' in window)) {
    motionReady = true;
    targets.forEach((target, index) => {
      setTimeout(() => {
        if (target === finishEl) finishRevealed = true;
        else revealed[stepEls.indexOf(target)] = true;
      }, 80 + index * 45);
    });
    return;
  }

  motionReady = true;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (entry.target === finishEl) finishRevealed = true;
        else revealed[stepEls.indexOf(entry.target)] = true;
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -6% 0px' },
  );

  const raf1 = requestAnimationFrame(() => {
    targets.forEach((target) => observer.observe(target));
  });

  return () => {
    cancelAnimationFrame(raf1);
    observer.disconnect();
  };
});
</script>
<svelte:head><title>Zotero 시작 가이드 · Folio</title><meta name="description" content="Zotero 계정을 만들고 Folio에 연결하는 과정을 실제 화면으로 안내합니다."/></svelte:head>
<article class="setup-guide" class:motion-ready={motionReady}>
<nav class="guide-nav"><a class="brand" href="/"><Icon name="library" size={18}/> Folio</a><span>ZOTERO START GUIDE</span><a href="/">라이브러리로 돌아가기 ↗</a></nav>
<header class="intro"><div><p class="kicker">처음 오셨나요?</p><h1>Zotero 가입부터 Folio 연결까지</h1><p class="lede">어렵지 않아요. 아래 실제 화면을 보며 여덟 단계만 천천히 따라오세요.</p><div class="summary"><span><strong>8</strong>단계</span><span><strong>약 5분</strong>이면 완료</span><span><strong>준비물</strong>이메일 주소</span></div></div><div class="intro-card"><span>BEFORE YOU START</span><p>Zotero는 논문과 참고문헌을 보관하고, Folio는 그 자료를 편안하게 읽고 기록할 수 있게 해줘요.</p><a href="#step-1">첫 단계부터 보기 ↓</a></div></header>
<ol class="steps">{#each steps as step,index}<li id={`step-${index+1}`} bind:this={stepEls[index]} class:reverse={index%2===1} class:is-visible={revealed[index]}><div class="step-copy"><span class="step-number">{String(index+1).padStart(2,'0')}</span><p class="eyebrow">{step.eyebrow}</p><h2>{step.title}</h2><p class="description">{step.description}</p>{#if step.link}<a class="step-link" href={step.link.url} target="_blank" rel="noreferrer">{step.link.label} ↗</a>{/if}<aside><span>i</span><p><strong>잠깐 확인</strong>{step.tip}</p></aside></div><figure><a href={step.image} target="_blank" rel="noreferrer"><img src={step.image} alt={step.alt} loading={index>1?'lazy':'eager'}/><span class="zoom">크게 보기 ↗</span></a><figcaption><b>화면 {index+1}</b><span>이미지와 같은 순서로 진행하세요.</span></figcaption></figure></li>{/each}</ol>
<section class="finish" bind:this={finishEl} class:is-visible={finishRevealed}><p class="kicker">ALL SET</p><h2>이제 내 라이브러리를 Folio에서 만나보세요.</h2><p>연결 직후 자료가 보이지 않더라도 걱정하지 마세요. 라이브러리 크기에 따라 첫 동기화에 잠시 시간이 걸릴 수 있습니다.</p><div class="finish-actions"><a class="primary" href="/login">Zotero 연결하러 가기 →</a><a class="secondary" href="#step-1">처음부터 다시 보기</a></div></section>
</article>
<style>
:global(html){scroll-behavior:smooth}.setup-guide{max-width:1280px;margin:auto;padding:0 clamp(1rem,4vw,4rem) 5rem;color:var(--text)}h1,h2{word-break:keep-all;overflow-wrap:break-word;text-wrap:balance}.guide-nav{display:grid;min-height:76px;border-bottom:1px solid var(--border-strong);grid-template-columns:1fr auto 1fr;align-items:center;font-size:.68rem;letter-spacing:.1em}.guide-nav a{color:var(--text);text-decoration:none}.guide-nav>a:last-child{justify-self:end}.guide-nav>span{color:var(--text-muted)}.brand{display:flex;align-items:center;gap:.5rem;font-family:var(--font-serif);font-size:1rem;letter-spacing:0}.intro{display:grid;min-height:650px;padding:clamp(4rem,9vw,8rem) 0;grid-template-columns:minmax(0,1.25fr) minmax(300px,.75fr);align-items:center;gap:clamp(3rem,8vw,8rem)}.kicker,.eyebrow{margin:0 0 1rem;color:var(--accent);font-size:.68rem;font-weight:800;letter-spacing:.13em}.intro h1{max-width:9.5em;margin:0;font-family:var(--font-serif);font-size:clamp(2.8rem,5.2vw,5rem);font-weight:500;line-height:1.12;letter-spacing:-.055em}.lede{max-width:580px;margin:2rem 0 0;color:var(--text-soft);font-size:1.05rem;line-height:1.85}.summary{display:flex;margin-top:2.5rem;padding-top:1.25rem;border-top:1px solid var(--border);gap:2.5rem}.summary span{display:flex;color:var(--text-muted);font-size:.72rem;flex-direction:column}.summary strong{color:var(--text);font-size:.9rem}.intro-card{padding:2rem;border:1px solid var(--border-strong);background:var(--surface-subtle)}.intro-card>span{color:var(--accent);font-size:.62rem;font-weight:800}.intro-card p{color:var(--text-soft);line-height:1.85}.intro-card a{display:flex;padding-top:1rem;border-top:1px solid var(--border);color:var(--text);text-decoration:none;justify-content:space-between}.steps{margin:0;padding:0;list-style:none}.steps>li{display:grid;padding:clamp(4.5rem,9vw,8rem) 0;border-top:1px solid var(--border-strong);grid-template-columns:minmax(300px,.8fr) minmax(0,1.2fr);align-items:center;gap:clamp(3rem,7vw,7rem)}.steps>li.reverse{grid-template-columns:minmax(0,1.2fr) minmax(300px,.8fr)}.reverse figure{grid-column:1;grid-row:1}.reverse .step-copy{grid-column:2}.step-number{display:block;margin-bottom:3.5rem;color:var(--accent);font-family:var(--font-serif);font-size:clamp(4.5rem,8vw,8rem);line-height:.75}.step-copy h2{max-width:12em;margin:0;font-family:var(--font-serif);font-size:clamp(1.9rem,3vw,3.2rem);font-weight:500;line-height:1.24}.description{color:var(--text-soft);line-height:1.9}.step-link{display:inline-flex;margin-top:.75rem;color:var(--accent);font-size:.78rem;font-weight:700;text-decoration:none}.step-link:hover{text-decoration:underline}.step-copy aside{display:flex;margin-top:2rem;padding:1rem 0;border-top:1px solid var(--border);gap:.75rem}.step-copy aside>span{display:grid;width:24px;height:24px;border-radius:50%;background:var(--accent-pale);color:var(--accent);place-items:center;flex:none}.step-copy aside p{margin:0;color:var(--text-muted);font-size:.76rem}.step-copy aside strong{display:block;color:var(--text)}figure{min-width:0;margin:0}figure>a{position:relative;display:block;overflow:hidden;border:1px solid var(--border-strong);border-radius:12px;background:#fff;box-shadow:0 24px 70px rgba(51,43,31,.14)}figure img{display:block;width:100%;max-height:760px;object-fit:contain}.zoom{position:absolute;right:1rem;bottom:1rem;padding:.55rem .75rem;border-radius:999px;background:#20262bc7;color:#fff;font-size:.65rem}figcaption{display:flex;margin-top:.9rem;color:var(--text-muted);font-size:.65rem;justify-content:space-between}.finish{display:grid;min-height:560px;padding:6rem 1rem;border-top:1px solid var(--border-strong);text-align:center;place-content:center}.finish h2{max-width:14em;margin:auto;font-family:var(--font-serif);font-size:clamp(2.2rem,4.5vw,4rem);font-weight:500}.finish>p:not(.kicker){max-width:600px;color:var(--text-soft)}.finish-actions{display:flex;margin-top:2.5rem;justify-content:center;gap:.75rem}.finish-actions a{padding:1rem;text-decoration:none}.primary{background:var(--accent-strong);color:#fff}.secondary{border:1px solid var(--border-strong);color:var(--text)}
@media(max-width:800px){.guide-nav{grid-template-columns:1fr auto}.guide-nav>span{display:none}.intro{display:block;min-height:0}.intro-card{margin-top:3rem}.steps>li,.steps>li.reverse{display:flex;padding:4.5rem 0;flex-direction:column;align-items:stretch;gap:2.5rem}.steps>li figure{order:-1}.finish-actions{flex-direction:column}}
@media(max-width:480px){.guide-nav>a:last-child{font-size:.7rem}.intro h1{font-size:clamp(2.25rem,11vw,2.8rem)}.step-copy h2{font-size:clamp(1.75rem,8vw,2.2rem)}.finish h2{font-size:clamp(2rem,9vw,2.65rem)}.summary{display:grid;grid-template-columns:1fr 1fr}.steps>li{padding:3.5rem 0}.step-number{font-size:4.2rem}}
</style>
