<script>
  // 논문 상세의 구조화 노트 에디터. 항목을 자유롭게 추가/삭제하고, 전체를
  // 한 번에 저장한다. 항목은 두 종류 — 텍스트(제목+자유 서술)와 단어장
  // (제목+단어/뜻 목록). AI는 이 "틀"만 제공할 뿐 — 항목 내용은 전부
  // 사용자가 직접 입력한다.
  import Icon from './Icon.svelte';

  // 저장 버튼을 누르지 않고 다른 논문으로 넘어갔다가 돌아와도 편집 중이던
  // 내용이 사라지지 않도록, sessionStorage에 초안을 넣어둔다. 브라우저
  // 세션(탭을 완전히 닫기 전까지) 동안만 살아있고, 저장 성공 시 지운다 —
  // Zotero(서버)에는 '저장' 버튼을 눌러야만 반영되고, 초안은 어디까지나
  // 로컬 임시 보관일 뿐이다.
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
  // save()와 초안 저장 모두 같은 모양을 쓴다.
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
  // svelte-ignore state_referenced_locally -- 마운트 시점에 초안을 복구했는지만 기억한다.
  let draftRestored = $state(draft != null);
  let saving = $state(false);
  let savedAt = $state(null);
  let error = $state('');

  // 편집 중인 내용이 바뀔 때마다 초안을 갱신한다 — 저장 버튼과 무관하게
  // 계속 최신 상태를 sessionStorage에 남겨야 나갔다 돌아왔을 때 복구된다.
  $effect(() => {
    const key = draftStorageKey();
    if (!key) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(toPlainSections(sections)));
    } catch {
      /* 초안 저장은 있으면 좋은 기능이라 조용히 무시 */
    }
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

  async function save() {
    saving = true;
    error = '';
    try {
      await onSave(toPlainSections(sections));
      hasPersistedSections = sections.length > 0;
      savedAt = new Date();
      draftRestored = false;
      clearDraft();
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="detail-memo structured-note">
  <div class="detail-memo-header">
    <span><Icon name="note" size={19} /></span>
    <div>
      <h2>이 논문의 노트</h2>
      <p>읽으면서 발견한 주장과 질문을 직접 정리해 보세요.</p>
    </div>
    {#if sections.length > 0 || hasPersistedSections}
      <div class="editor-actions">
        {#if savedAt || error || draftRestored}
          <div class="editor-meta">
            {#if savedAt}
              <span class="saved-status"
                >저장됨 · {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span
              >
            {:else if draftRestored}
              <span class="saved-status">임시 저장된 내용을 불러왔어요 · 저장 전이에요</span>
            {/if}
            {#if error}<span class="status error">{error}</span>{/if}
          </div>
        {/if}
        <button class="save-btn" onclick={save} disabled={saving}>
          {saving ? '저장 중…' : sections.length === 0 ? '노트 비우기' : '저장'}
        </button>
      </div>
    {/if}
  </div>

  {#each sections as section (section.id)}
    <div class="memo-card">
      {#if section.type === 'vocab'}
        <div class="section-row">
          <input
            class="section-title-input"
            type="text"
            placeholder="단어장 제목 (예: Chapter 3 단어)"
            bind:value={section.title}
          />
          <button
            class="icon-btn"
            onclick={() => removeSection(section.id)}
            aria-label="항목 삭제"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {#each section.words as w (w.id)}
          <div class="vocab-row">
            <input class="vocab-word-input" type="text" placeholder="단어" bind:value={w.word} />
            <input class="vocab-meaning-input" type="text" placeholder="뜻" bind:value={w.meaning} />
            <button
              class="icon-btn"
              onclick={() => removeWord(section.id, w.id)}
              aria-label="단어 삭제"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        {/each}

        {#if section.words.length === 0}
          <p class="hint">아직 단어가 없어요.</p>
        {/if}

        <button class="add-word-btn" onclick={() => addWord(section.id)}>
          <Icon name="plus" size={14} /> 단어 추가
        </button>
      {:else}
        <div class="section-row">
          <input
            class="section-title-input"
            type="text"
            placeholder="항목 제목 (예: 주장, 한계점, 이론)"
            bind:value={section.title}
          />
          <button
            class="icon-btn"
            onclick={() => removeSection(section.id)}
            aria-label="항목 삭제"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <textarea
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
    <button class="add-section-btn" onclick={addSection}>
      <Icon name="plus" size={16} /> 텍스트 항목 추가
    </button>
    <button class="add-section-btn" onclick={addVocabSection}>
      <Icon name="plus" size={16} /> 단어장 추가
    </button>
  </div>
</div>
