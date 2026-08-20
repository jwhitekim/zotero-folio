<script>
  // 논문 목록 카드 — Papers/홈/컬렉션/검색 네 목록 화면이 전부 이 컴포넌트를
  // 공유한다(예전엔 화면마다 같은 마크업을 복사해서 썼다). 카드를 누르면
  // 상세로 열리고, 모서리의 휴지통 아이콘으로 상세 화면까지 안 들어가고
  // 그 자리에서 바로 삭제할 수 있다.
  import Icon from './Icon.svelte';

  let { paper, onOpen, onDelete } = $props();

  let deleteState = $state('idle'); // 'idle' | 'confirm' | 'deleting'
  let deleteError = $state('');

  async function confirmDelete() {
    deleteState = 'deleting';
    deleteError = '';
    try {
      await onDelete(paper.itemKey);
      // 성공하면 이 카드 자체가 부모의 목록에서 사라지므로 상태를 되돌릴 필요 없음
    } catch (err) {
      deleteError = err.message;
      deleteState = 'confirm';
    }
  }
</script>

<div class="paper-card-wrap">
  <div class="paper-card">
    <button class="paper-card-open" onclick={() => onOpen(paper.itemKey)}>
      <span class="paper-file"><Icon name="file" size={21} /></span>
      <span class="paper-content">
        <span class="title">{paper.title}</span>
        <span class="paper-meta-row">
          <span class="sub">{paper.authors.join(', ') || '저자 미상'}{paper.year ? ` · ${paper.year}` : ''}</span>
          {#if paper.hasPdf}<span class="tag">PDF</span>{:else if paper.attachmentType === 'html'}<span class="tag">WEB</span>{/if}
        </span>
      </span>
      <span class="chevron"><Icon name="chevron" size={18} /></span>
    </button>

    {#if deleteState === 'idle'}
      <button class="paper-card-delete" onclick={() => (deleteState = 'confirm')} aria-label="논문 삭제">
        <Icon name="trash" size={14} />
      </button>
    {/if}
  </div>

  {#if deleteState !== 'idle'}
    <div class="paper-card-confirm">
      <p>이 논문을 삭제할까요? Zotero 휴지통으로 이동하며, 메모도 함께 삭제됩니다.</p>
      {#if deleteError}<p class="status error">{deleteError}</p>{/if}
      <div class="paper-card-confirm-actions">
        <button class="icon-action secondary" onclick={() => (deleteState = 'idle')} disabled={deleteState === 'deleting'}>
          취소
        </button>
        <button class="icon-action danger" onclick={confirmDelete} disabled={deleteState === 'deleting'}>
          {deleteState === 'deleting' ? '삭제 중…' : '삭제'}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  /* .paper-card 자체의 박스 스타일(테두리/배경/hover 등)과 .paper-file,
     .paper-content, .title, .sub, .paper-meta-row, .tag, .chevron은
     app.css에 그대로 남아있다 — Collections.svelte의 .collection-card,
     .folder-icon과 디자인 토큰을 공유하는 진짜 전역 카드 스타일이라
     이 컴포넌트만의 것으로 가져올 수 없다. 여기서는 이 컴포넌트가 새로
     추가한 부분(래퍼, 열기 버튼 리셋, 삭제 버튼/확인 팝오버)만 정의한다. */
  .paper-card-wrap {
    position: relative;
    min-width: 0;
  }

  .paper-card-open {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    border: 0;
    background: none;
    padding: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .paper-card-delete {
    display: grid;
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    margin-left: 0.5rem;
    place-items: center;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    opacity: 0.55;
    transition: opacity 160ms ease, background 160ms ease, color 160ms ease;
  }

  .paper-card-delete:hover {
    opacity: 1;
    background: var(--danger-soft);
    color: var(--danger);
  }

  .paper-card-confirm {
    position: absolute;
    z-index: 6;
    top: calc(100% + 0.35rem);
    right: 0;
    width: min(260px, 100%);
    padding: 0.85rem;
    border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
    border-radius: 13px;
    background: var(--surface);
    box-shadow: var(--shadow-md);
  }

  .paper-card-confirm p {
    margin: 0;
    color: var(--text-soft);
    font-size: 0.8rem;
    line-height: 1.6;
  }

  .paper-card-confirm-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.7rem;
  }
</style>
