<script>
  // 논문 상세의 구조화 노트 에디터. 항목(제목+내용)을 자유롭게 추가/삭제
  // 하고, 전체를 한 번에 저장한다. AI는 이 "틀"만 제공할 뿐 — 항목의
  // 제목/내용은 전부 사용자가 직접 입력한다.
  import Icon from './Icon.svelte';

  let { initialSections = [], onSave } = $props();

  // svelte-ignore state_referenced_locally -- 마운트 시점 값만 편집 상태의
  // 초기값으로 쓰고, 이후 initialSections가 바뀌어도 편집 중인 목록은 유지한다.
  let sections = $state(initialSections.map((s) => ({ id: crypto.randomUUID(), ...s })));
  // svelte-ignore state_referenced_locally -- 최초 로드 때 기존 노트가 있었는지만 기억한다.
  let hasPersistedSections = $state(initialSections.length > 0);
  let saving = $state(false);
  let savedAt = $state(null);
  let error = $state('');

  function addSection() {
    sections = [...sections, { id: crypto.randomUUID(), title: '', content: '' }];
  }

  function removeSection(id) {
    sections = sections.filter((s) => s.id !== id);
  }

  async function save() {
    saving = true;
    error = '';
    try {
      await onSave(sections.map(({ title, content }) => ({ title, content })));
      hasPersistedSections = sections.length > 0;
      savedAt = new Date();
    } catch (err) {
      error = err.message;
    } finally {
      saving = false;
    }
  }
</script>

<div class="structured-note">
  {#each sections as section (section.id)}
    <div class="memo-card">
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
    </div>
  {/each}

  {#if sections.length === 0}
    <p class="hint">아직 항목이 없어요. 아래에서 첫 항목을 추가해 보세요.</p>
  {/if}

  <button class="add-section-btn" onclick={addSection}>
    <Icon name="plus" size={16} /> 항목 추가
  </button>

  {#if sections.length > 0 || hasPersistedSections}
    <div class="editor-actions">
      <div class="editor-meta">
        {#if savedAt}
          <span class="saved-status"
            >저장됨 · {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span
          >
        {/if}
        {#if error}<span class="status error">{error}</span>{/if}
      </div>
      <button class="save-btn" onclick={save} disabled={saving}>
        {saving ? '저장 중…' : sections.length === 0 ? '노트 비우기' : '저장'}
      </button>
    </div>
  {/if}
</div>
