<script>
  // 논문 상세의 구조화 노트 에디터. 항목을 자유롭게 추가/삭제하고, 입력하는
  // 대로 자동 저장한다. 항목은 두 종류 — 텍스트(제목+자유 서술)와 단어장
  // (제목+단어/뜻 목록). AI는 이 "틀"만 제공할 뿐 — 항목 내용은 전부
  // 사용자가 직접 입력한다.
  import Icon from './Icon.svelte';

  // 내용 textarea가 고정 높이 안에서 스크롤되면 긴 글을 한눈에 못 보고
  // 가독성이 떨어지므로, 글자 수에 맞춰 높이를 계속 늘려준다(줄이지는
  // 않음 — CSS min-height가 바닥값). 새 줄을 넣거나 지울 때, 그리고 처음
  // 마운트될 때(기존에 저장된 긴 글을 불러왔을 때) 둘 다 다시 잰다.
  function autosize(node) {
    function resize() {
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight}px`;
    }
    // 액션은 노드가 DOM에 붙자마자 실행되는데, bind:value의 초기값(기존에
    // 저장된 긴 글)은 그 시점엔 아직 안 들어가 있을 수 있어 — 빈 textarea
    // 기준으로 재서 4줄 높이로 굳어버리는 버그가 있었다. 다음 프레임에
    // 한 번 더 재서, 값이 다 채워진 뒤 기준으로 확실히 맞춘다.
    resize();
    requestAnimationFrame(resize);
    node.addEventListener('input', resize);

    // 모바일에서 처음에 "노트" 탭이 아니라 "원문" 탭으로 열리면, 이
    // textarea는 조상(.split-note-pane)이 display:none인 채로 마운트된다
    // — 그 상태에서 잰 scrollHeight는 항상 0이라 위 두 번의 측정이 다
    // 무의미해지고, 이후 사용자가 탭을 "노트"로 옮겨도(=글자 입력 없이
    // 다시 보이기만 함) input 이벤트가 없어 재측정이 안 돼 CSS
    // min-height(90px)에 눌린 채로 굳어버렸다. ResizeObserver는 조상의
    // display:none이 풀려 이 요소가 실제로 다시 보이게 되는 순간도 "크기
    // 변화"로 잡아내므로, 그 시점에 다시 재본다. 우리가 직접 맞춘 높이는
    // 재적용해도 크기가 안 바뀌어 알림이 다시 발생하지 않으니 별도의
    // 무한루프 방지 로직 없이도 안전하다.
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
  let { initialSections = [], onSave, draftKey } = $props();

  function draftStorageKey() {
    return draftKey ? `zotero-insight:memo-draft:${draftKey}` : null;
  }

  function loadDraft() {
    const key = draftStorageKey();
    if (!key) return null;
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
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

  // 저장 요청에 실제로 보낼 형태로 정리 — 편집용으로만 쓰는 id는 뺀다.
  // 자동 저장과 초안 저장 모두 같은 모양을 쓴다.
  function toPlainSections(list) {
    return list.map(({ type, title, content, words }) =>
      type === 'vocab'
        ? { type, title, words: words.map(({ word, meaning }) => ({ word, meaning })) }
        : { type: 'text', title, content }
    );
  }

  const draft = loadDraft();
  // svelte-ignore state_referenced_locally -- 마운트 시점 값만 편집 상태의
  // 초기값으로 쓰고, 이후 initialSections가 바뀌어도 편집 중인 목록은 유지한다.
  let sections = $state(
    (draft ?? initialSections).map((s) => ({
      id: crypto.randomUUID(),
      type: s.type ?? 'text',
      ...s,
      ...(s.type === 'vocab'
        ? { words: (s.words ?? []).map((w) => ({ id: crypto.randomUUID(), ...w })) }
        : {}),
    }))
  );
  // svelte-ignore state_referenced_locally -- 최초 로드 때 기존 노트가 있었는지만 기억한다.
  let hasPersistedSections = $state(initialSections.length > 0);

  let saveState = $state('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  let saveError = $state('');
  let savedAt = $state(null);
  let saveInFlight = false;
  let saveQueued = false;

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
      await onSave(toPlainSections(sections));
      hasPersistedSections = sections.length > 0;
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

  // 항목이 바뀔 때마다(입력 중에도) 초안을 갱신하고, 잠깐 멈추면 자동
  // 저장을 예약한다. 매 키 입력마다 바로 서버로 보내지 않도록 살짝 debounce.
  // draft가 있던 상태로 열렸으면(이전에 저장 못 하고 나간 상태) 첫 실행부터
  // 바로 저장해서 복구한 내용을 Zotero에 반영하고, 그게 아니면 사용자가
  // 실제로 뭔가 바꾸기 전까지는(=이 effect의 두 번째 실행부터) 저장하지 않는다.
  let firstRun = true;
  $effect(() => {
    const snapshot = toPlainSections(sections);
    const key = draftStorageKey();
    if (key) {
      try {
        sessionStorage.setItem(key, JSON.stringify(snapshot));
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

  function addSection() {
    sections = [...sections, { id: crypto.randomUUID(), type: 'text', title: '', content: '' }];
  }

  function addVocabSection() {
    sections = [...sections, { id: crypto.randomUUID(), type: 'vocab', title: '', words: [] }];
  }

  function removeSection(id) {
    sections = sections.filter((s) => s.id !== id);
  }

  function addWord(sectionId) {
    sections = sections.map((s) =>
      s.id === sectionId
        ? { ...s, words: [...s.words, { id: crypto.randomUUID(), word: '', meaning: '' }] }
        : s
    );
  }

  function removeWord(sectionId, wordId) {
    sections = sections.map((s) =>
      s.id === sectionId ? { ...s, words: s.words.filter((w) => w.id !== wordId) } : s
    );
  }
</script>

<div class="detail-memo structured-note">
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
    {:else if hasPersistedSections}
      <span class="note-strip-status">모두 저장됨</span>
    {/if}
  </div>

  {#each sections as section (section.id)}
    <div class="note-item">
      {#if section.type === 'vocab'}
        <div class="section-row">
          <input
            class="section-title-input"
            type="text"
            placeholder="단어장 제목 (예: Chapter 3 단어)"
            bind:value={section.title}
          />
          <button class="ghost-x" onclick={() => removeSection(section.id)} aria-label="항목 삭제">
            <Icon name="close" size={13} />
          </button>
        </div>

        {#each section.words as w (w.id)}
          <div class="vocab-row">
            <input class="vocab-word-input" type="text" placeholder="단어" bind:value={w.word} />
            <span class="vocab-leader"></span>
            <input class="vocab-meaning-input" type="text" placeholder="뜻" bind:value={w.meaning} />
            <button class="ghost-x" onclick={() => removeWord(section.id, w.id)} aria-label="단어 삭제">
              <Icon name="close" size={11} />
            </button>
          </div>
        {/each}

        {#if section.words.length === 0}
          <p class="hint">아직 단어가 없어요.</p>
        {/if}

        <button class="add-word-btn" onclick={() => addWord(section.id)}>+ 단어 추가</button>
      {:else}
        <div class="section-row">
          <input
            class="section-title-input"
            type="text"
            placeholder="항목 제목 (예: 주장, 한계점, 이론)"
            bind:value={section.title}
          />
          <button class="ghost-x" onclick={() => removeSection(section.id)} aria-label="항목 삭제">
            <Icon name="close" size={13} />
          </button>
        </div>
        <textarea
          use:autosize
          placeholder="내용을 입력하세요..."
          rows="4"
          bind:value={section.content}
        ></textarea>
      {/if}
    </div>
  {/each}

  {#if sections.length === 0}
    <p class="hint">아직 항목이 없어요. 아래에서 첫 항목을 추가해 보세요.</p>
  {/if}

  <div class="add-buttons-row">
    <button class="add-section-btn" onclick={addSection}>+ 텍스트 항목 추가</button>
    <span class="add-buttons-divider"></span>
    <button class="add-section-btn" onclick={addVocabSection}>+ 단어장 추가</button>
  </div>
</div>

<style>
  /* 이 컴포넌트 자기 마크업의 기본 모양. 페이지가 바깥에서 이 컴포넌트 내부
     클래스명을 CSS로 다시 찍어 조정할 필요 없이, 여기서 다 결정한다.
     박스/카드 대신 얇은 구분선으로만 항목을 나누는 "노트 한 장" 톤. */
  .detail-memo {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }

  .note-strip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.6rem;
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

  .note-item {
    padding-bottom: 1.4rem;
    margin-bottom: 1.4rem;
    border-bottom: 1px solid var(--border);
  }

  .section-row {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    margin-bottom: 0.55rem;
  }

  .section-title-input {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: 0;
    background: none;
    color: var(--text);
    /* 16px(1rem) 미만이면 iOS Safari가 포커스 시 화면을 확대해버린다 — 그 문턱 값. */
    font-size: 1rem;
    font-weight: 700;
  }

  .ghost-x {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    padding: 0.2rem;
    background: none;
    color: var(--border-strong);
    transition: color 160ms ease;
  }

  .ghost-x:hover {
    color: var(--danger);
  }

  .hint {
    color: var(--text-muted);
    font-size: 0.72rem;
  }

  .vocab-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0;
  }

  .vocab-word-input,
  .vocab-meaning-input {
    min-width: 0;
    padding: 0;
    border: 0;
    outline: 0;
    background: none;
    color: var(--text);
    /* 16px(1rem) 미만이면 iOS Safari가 포커스 시 화면을 확대해버린다 — 그 문턱 값. */
    font-size: 0.85rem;
  }

  .vocab-word-input {
    flex: 0 1 auto;
    min-width: 60px;
    max-width: 40%;
    font-weight: 700;
  }

  .vocab-leader {
    flex: 1;
    min-width: 8px;
    height: 0;
    border-bottom: 1px dotted var(--border-strong);
    transform: translateY(-2px);
  }

  .vocab-meaning-input {
    flex: 1 1 50%;
    color: var(--text-soft);
    text-align: right;
  }

  .add-word-btn {
    padding: 0.3rem 0;
    border: 0;
    background: none;
    color: var(--text-soft);
    font-size: 0.72rem;
    font-weight: 650;
  }

  .add-word-btn:hover {
    color: var(--accent);
  }

  .structured-note textarea {
    display: block;
    /* 자동 높이 조절(use:autosize)이 정상 동작하면 내용이 다 보이게 늘어나서
       스크롤이 나타날 일이 없다 — 그래도 혹시 못 따라잡는 경우(예: JS가
       한 프레임 늦게 붙는 순간)를 대비해 세로 스크롤은 열어둔다. 이게
       hidden이면 그 순간 글이 통째로 안 보이게 잘려서 훨씬 나쁜 상태가 됨. */
    overflow-x: hidden;
    overflow-y: auto;
    width: 100%;
    min-height: 90px;
    resize: none;
    padding: 0;
    border: 0;
    outline: 0;
    background: none;
    color: var(--text);
    /* 16px(1rem) 미만이면 iOS Safari가 포커스 시 화면을 확대해버린다 — 그 문턱 값. */
    font-size: 0.9rem;
    line-height: 1.85;
  }

  .add-buttons-row {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }

  .add-buttons-divider {
    width: 1px;
    height: 12px;
    background: var(--border-strong);
  }

  .add-section-btn {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 0.78rem;
    font-weight: 650;
  }

  .add-section-btn:hover {
    color: var(--accent-strong);
  }
</style>
