<script>
  // 논문별 메모(child note) 에디터. 단일 마크다운 텍스트 영역이며, 입력하는
  // 대로 자동 저장한다(서버가 마크다운→HTML로 변환해 Zotero note에 저장).
  // 로컬 .md 파일을 불러오거나, 편집 중인 내용을 .md로 내려받을 수 있다.
  import Icon from './Icon.svelte';

  // 마크다운 textarea가 고정 높이 안에서 스크롤되면 긴 글을 한눈에 못 보고
  // 가독성이 떨어지므로, 글자 수에 맞춰 높이를 계속 늘려준다(줄이지는
  // 않음 — CSS min-height가 바닥값). 새 줄을 넣거나 지울 때, 그리고 처음
  // 마운트될 때(기존에 저장된 긴 글을 불러왔을 때) 둘 다 다시 잰다.
  function autosize(node) {
    // 높이를 다시 잴 때 'auto'로 잠깐 축소시키는데, 그 순간 스크롤 조상의
    // scrollHeight가 급감해 브라우저가 scrollTop을 0으로 클램프한다 — 높이를
    // 복원해도 스크롤 위치가 맨 위로 튀어버려서, 긴 메모 중간에서 엔터/타이핑을
    // 하면 편집 중이던 줄이 화면에서 사라지는 버그가 있었다. 리셋 앞뒤로 스크롤
    // 조상의 위치를 보존/복원해 막는다. (부모 클래스명에 결합되지 않도록 조상을
    // overflow-y가 auto/scroll인 요소로 일반 탐색한다.)
    function findScroller(el) {
      let p = el.parentElement;
      while (p) {
        const oy = getComputedStyle(p).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
        p = p.parentElement;
      }
      return null;
    }
    function resize() {
      const scroller = findScroller(node);
      const prevScrollTop = scroller ? scroller.scrollTop : 0;
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight}px`;
      if (scroller) scroller.scrollTop = prevScrollTop;
    }
    // 액션은 노드가 DOM에 붙자마자 실행되는데, bind:value의 초기값(기존에
    // 저장된 긴 글)은 그 시점엔 아직 안 들어가 있을 수 있어 — 빈 textarea
    // 기준으로 재서 낮은 높이로 굳어버리는 버그가 있었다. 다음 프레임에
    // 한 번 더 재서, 값이 다 채워진 뒤 기준으로 확실히 맞춘다.
    resize();
    requestAnimationFrame(resize);
    node.addEventListener('input', resize);

    // 모바일에서 처음에 "노트"가 아니라 "원문" 탭으로 열리면 이 textarea는
    // 조상(.split-note-pane)이 display:none인 채로 마운트된다 — 그 상태에서
    // 잰 scrollHeight는 0이라 위 두 측정이 무의미해지고, 이후 탭을 옮겨도
    // input 이벤트가 없어 재측정이 안 돼 min-height에 눌린 채로 굳는다.
    // ResizeObserver는 조상의 display:none이 풀려 실제로 다시 보이는 순간도
    // "크기 변화"로 잡아내므로 그 시점에 다시 잰다. 우리가 맞춘 높이를
    // 재적용해도 크기가 안 바뀌어 알림이 다시 발생하지 않으니 안전하다.
    const observer = new ResizeObserver(resize);
    observer.observe(node);

    return {
      destroy() {
        node.removeEventListener('input', resize);
        observer.disconnect();
      },
    };
  }

  // 자동 저장 사이에도, 다른 논문으로 넘어갔다가 돌아왔을 때 편집 중이던
  // 내용이 잠깐이라도 사라지지 않도록 sessionStorage에 초안을 같이 넣어둔다.
  // Zotero에는 아래 자동 저장 로직이 반영하고, 이 초안은 그 사이의 로컬
  // 임시 보관일 뿐이다(저장 성공 시 지움).
  let { initialMarkdown = '', onSave, draftKey, paperTitle = '' } = $props();

  function draftStorageKey() {
    return draftKey ? `zotero-insight:memo-draft:${draftKey}` : null;
  }

  function loadDraft() {
    const key = draftStorageKey();
    if (!key) return null;
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function clearDraft() {
    const key = draftStorageKey();
    if (!key) return;
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* sessionStorage 접근이 막혀 있어도(시크릿 모드 등) 기능은 계속 동작해야 함 */
    }
  }

  const draft = loadDraft();
  // svelte-ignore state_referenced_locally -- 마운트 시점 값만 편집 상태의
  // 초기값으로 쓰고, 이후 initialMarkdown이 바뀌어도 편집 중인 내용은 유지한다.
  let markdown = $state(draft ?? initialMarkdown);
  // svelte-ignore state_referenced_locally -- 최초 로드 때 기존 노트가 있었는지만 기억한다.
  let hasPersisted = $state(initialMarkdown.trim() !== '');

  let saveState = $state('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  let saveError = $state('');
  let savedAt = $state(null);
  let saveInFlight = false;
  let saveQueued = false;

  let fileInput;

  async function doSave() {
    if (saveInFlight) {
      // 저장이 이미 진행 중일 때 또 예약되면, 지금 요청이 끝난 뒤 최신
      // 내용으로 한 번 더 저장한다 — 겹쳐서 두 요청이 동시에 나가는 걸 막음.
      saveQueued = true;
      return;
    }
    saveInFlight = true;
    saveState = 'saving';
    saveError = '';
    try {
      await onSave(markdown);
      hasPersisted = markdown.trim() !== '';
      saveState = 'saved';
      savedAt = new Date();
      clearDraft();
    } catch (err) {
      saveState = 'error';
      saveError = err.message;
    } finally {
      saveInFlight = false;
      if (saveQueued) {
        saveQueued = false;
        doSave();
      }
    }
  }

  // 내용이 바뀔 때마다(입력 중에도) 초안을 갱신하고, 잠깐 멈추면 자동 저장을
  // 예약한다. 매 키 입력마다 바로 서버로 보내지 않도록 살짝 debounce.
  // draft가 있던 상태로 열렸으면(이전에 저장 못 하고 나간 상태) 첫 실행부터
  // 바로 저장해서 복구한 내용을 Zotero에 반영하고, 그게 아니면 사용자가
  // 실제로 뭔가 바꾸기 전까지는(=이 effect의 두 번째 실행부터) 저장하지 않는다.
  let firstRun = true;
  $effect(() => {
    const snapshot = markdown;
    const key = draftStorageKey();
    if (key) {
      try {
        sessionStorage.setItem(key, snapshot);
      } catch {
        /* 초안 저장은 있으면 좋은 기능이라 조용히 무시 */
      }
    }

    const skip = firstRun && draft == null;
    firstRun = false;
    if (skip) return;

    const timer = setTimeout(doSave, 900);
    return () => clearTimeout(timer);
  });

  // 로컬 .md 파일을 열어 편집 영역에 채운다 (클라이언트 FileReader만 사용,
  // 서버 왕복 없음). 값이 바뀌면 위 $effect가 자동 저장을 이어서 처리한다.
  function onFilePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      markdown = String(reader.result ?? '');
    };
    reader.readAsText(file);
    // 같은 파일을 연달아 다시 골라도 change 이벤트가 나도록 값을 비운다.
    e.target.value = '';
  }

  // 파일명으로 안전하지 않은 문자를 걸러 논문 제목 기반 .md 파일명을 만든다.
  function downloadFilename() {
    const base = (paperTitle || '메모').trim().replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
    return `${base || '메모'}.md`;
  }

  function download() {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
</script>

<div class="detail-memo markdown-note">
  <div class="note-strip">
    <Icon name="note" size={15} />
    <span class="note-strip-label">이 논문의 노트</span>
    {#if saveState === 'saving'}
      <span class="note-strip-status">저장 중…</span>
    {:else if saveState === 'error'}
      <span class="note-strip-status error"
        >저장 실패 · {saveError} · <button onclick={doSave}>다시 시도</button></span
      >
    {:else if saveState === 'saved'}
      <span class="note-strip-status"
        >모두 저장됨 · {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span
      >
    {:else if hasPersisted}
      <span class="note-strip-status">모두 저장됨</span>
    {/if}
  </div>

  <div class="md-toolbar">
    <button class="md-tool-btn" onclick={() => fileInput.click()}>
      <Icon name="file" size={13} /> .md 불러오기
    </button>
    <button class="md-tool-btn" onclick={download}>
      <Icon name="external" size={13} /> .md 내려받기
    </button>
    <input
      bind:this={fileInput}
      class="md-file-input"
      type="file"
      accept=".md,.markdown,text/markdown,text/plain"
      onchange={onFilePick}
    />
  </div>

  <textarea
    class="md-editor"
    use:autosize
    placeholder="마크다운으로 메모를 작성하세요...&#10;&#10;# 제목&#10;- 목록&#10;**굵게** _기울임_"
    rows="6"
    bind:value={markdown}
  ></textarea>
</div>

<style>
  /* 이 컴포넌트 자기 마크업의 기본 모양. 페이지가 바깥에서 이 컴포넌트 내부
     클래스명을 CSS로 다시 찍어 조정할 필요 없이, 여기서 다 결정한다. */
  .detail-memo {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }

  .note-strip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.2rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
    color: var(--accent);
  }

  .note-strip-label {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .note-strip-status {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 0.65rem;
    white-space: nowrap;
  }

  .note-strip-status.error {
    color: var(--danger);
  }

  .note-strip-status.error button {
    padding: 0;
    border: 0;
    background: none;
    color: var(--danger);
    font: inherit;
    font-weight: 700;
    text-decoration: underline;
  }

  .md-toolbar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 1rem;
  }

  .md-tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 0.75rem;
    font-weight: 650;
  }

  .md-tool-btn:hover {
    color: var(--accent-strong);
  }

  .md-file-input {
    display: none;
  }

  .md-editor {
    display: block;
    /* 자동 높이 조절(use:autosize)이 내용만큼 늘어나므로 평소엔 스크롤이
       날 일이 없다 — hidden으로 둬서 스크롤바가 뜨는 경우 자체를 없앤다.
       다만 autosize가 한 프레임 늦게 붙는 순간(JS 초기화 타이밍)엔 이
       hidden 때문에 글이 잠깐 잘려 보일 수 있다 — 스크롤바가 반짝이는
       것보다 이쪽이 낫다고 보고 감수한 트레이드오프다. */
    overflow-x: hidden;
    overflow-y: hidden;
    width: 100%;
    min-height: 240px;
    resize: none;
    padding: 0;
    border: 0;
    outline: 0;
    background: none;
    color: var(--text);
    /* 16px(1rem) 미만이면 iOS Safari가 포커스 시 화면을 확대해버린다 — 그 문턱 값. */
    font-size: 0.9rem;
    line-height: 1.85;
    /* 마크다운 원문 편집이라 고정폭 글꼴이 문법 정렬에 유리하다. */
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    tab-size: 2;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
