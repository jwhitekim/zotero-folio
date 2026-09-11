<script>
  // 모바일(폰 + 세로모드 태블릿) 전용 노트 바텀시트.
  // 원문(PDF/HTML)은 항상 화면에 남겨둔 채, 노트를 화면 하단에서 위로
  // 끌어올려 겹쳐 보는 UI다 — "원문을 보면서 메모"라는 핵심 가치를 지키기
  // 위해 완전 풀스크린 모달로 만들지 않고, 완전히 펼쳐도 위쪽 원문 일부가
  // 보이도록 최대 높이를 뷰포트의 88%로 제한한다.
  //
  // 데스크톱/가로 태블릿의 분할뷰(.split-view)와는 완전히 별개다 — 이
  // 컴포넌트는 PaperDetailSplit이 모바일이라고 판단할 때만 마운트된다.
  //
  // 상태(zoom 등)를 부모가 단일 소스로 갖는 뷰어 패턴과 마찬가지로, 노트
  // 자체(MarkdownNote)는 children으로 받아 렌더링만 하고, 이 컴포넌트는
  // 시트의 펼침/접힘 위치와 드래그 제스처만 책임진다.
  import Icon from './Icon.svelte';

  let { children, label = '이 논문의 노트' } = $props();

  // 접힘 상태에서 화면에 남기는 손잡이 영역의 높이(px). 이만큼만 원문 위로
  // 걸쳐 있고 나머지는 화면 아래로 내려가 있다.
  const COLLAPSED_PX = 72;
  // 스냅 지점을 "화면에 보이는 시트 높이"의 뷰포트 대비 비율로 정의한다.
  // 완전 펼침을 0.88로 두어 위쪽 12%에 원문이 항상 보이게 한다.
  const HALF_RATIO = 0.5;
  const FULL_RATIO = 0.88;
  // 탭(대충 제자리 클릭)과 드래그를 가르는 이동량 임계값(px).
  const TAP_THRESHOLD = 6;

  let vh = $state(typeof window !== 'undefined' ? window.innerHeight : 800);

  // 시트 전체 높이 = 완전 펼침 시 보이는 높이. translateY로 아래로 내려
  // 접힘/중간 상태를 만든다.
  let sheetHeight = $derived(Math.round(vh * FULL_RATIO));

  // 각 스냅에서 "보이는 높이"(px). [접힘, 중간, 펼침] 순서.
  let snapVisible = $derived([COLLAPSED_PX, Math.round(vh * HALF_RATIO), sheetHeight]);
  // 각 스냅의 translateY(px) = 시트높이 - 보이는높이. 접힘이 가장 크고 펼침은 0.
  let snapTranslate = $derived(snapVisible.map((v) => sheetHeight - v));

  // 0=접힘, 1=중간, 2=펼침. 기본은 접힘.
  let snapIndex = $state(0);
  // 현재 시트의 translateY(px). 드래그 중에는 손가락을 따라 실시간으로,
  // 손을 떼면 가장 가까운 스냅으로 transition을 통해 안착한다.
  let translate = $state(0);
  let dragging = $state(false);

  // vh나 스냅이 바뀌면(회전/리사이즈) 현재 스냅 위치를 다시 계산해 맞춘다.
  // 드래그 중에는 손가락 위치를 방해하지 않도록 건드리지 않는다.
  $effect(() => {
    if (!dragging) translate = snapTranslate[snapIndex];
  });

  $effect(() => {
    const onResize = () => (vh = window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  // --- 드래그 제스처(포인터 이벤트) ---
  // touch-gestures.js의 rAF 쓰로틀 패턴과 톤을 맞춘다: pointermove는 프레임당
  // 여러 번 들어오므로 최신 위치만 모아뒀다가 rAF에서 한 번만 반영한다.
  let startY = 0;
  let startTranslate = 0;
  let pointerId = null;
  let pendingY = 0;
  let moved = false;
  let rafId = 0;

  const minTranslate = 0; // 완전 펼침
  let maxTranslate = $derived(snapTranslate[0]); // 완전 접힘

  function flush() {
    rafId = 0;
    const next = startTranslate + (pendingY - startY);
    translate = Math.min(maxTranslate, Math.max(minTranslate, next));
  }

  function onPointerDown(e) {
    pointerId = e.pointerId;
    dragging = true;
    moved = false;
    startY = e.clientY;
    pendingY = e.clientY;
    startTranslate = translate;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    if (Math.abs(e.clientY - startY) > TAP_THRESHOLD) moved = true;
    pendingY = e.clientY;
    if (!rafId) rafId = requestAnimationFrame(flush);
  }

  function endDrag(e) {
    if (!dragging || (e && e.pointerId !== pointerId)) return;
    dragging = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    pointerId = null;

    if (!moved) {
      // 탭: 접혀 있으면 중간으로 펼치고, 아니면 접는다.
      snapIndex = snapIndex === 0 ? 1 : 0;
      translate = snapTranslate[snapIndex];
      return;
    }
    // 드래그 종료: 현재 위치에서 가장 가까운 스냅으로 안착한다.
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < snapTranslate.length; i++) {
      const d = Math.abs(snapTranslate[i] - translate);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    snapIndex = best;
    translate = snapTranslate[best];
  }

  function onHandleKeydown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      snapIndex = snapIndex === 0 ? 1 : 0;
      translate = snapTranslate[snapIndex];
    }
  }

  let expanded = $derived(snapIndex > 0);
</script>

<div
  class="note-sheet"
  class:dragging
  style:height={`${sheetHeight}px`}
  style:transform={`translateY(${translate}px)`}
  aria-label={label}
>
  <div
    class="note-sheet-handle"
    role="button"
    tabindex="0"
    aria-expanded={expanded}
    aria-label={expanded ? '노트 접기' : '노트 펼치기'}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    onkeydown={onHandleKeydown}
  >
    <span class="note-sheet-grip" aria-hidden="true"></span>
    <div class="note-sheet-heading">
      <Icon name="note" size={16} />
      <span>{label}</span>
      <span class="note-sheet-chevron" class:expanded><Icon name="chevron" size={16} /></span>
    </div>
  </div>

  <div class="note-sheet-body">
    {@render children()}
  </div>
</div>

<style>
  /* 시트는 화면 하단에 고정되고 transform으로 위아래로 움직인다. 원문 위에
     겹치되(z-index), 완전 펼쳐도 상단 일부는 원문이 보이도록 높이를 부모가
     인라인으로 제한한다. */
  .note-sheet {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 16px 16px 0 0;
    background: var(--surface);
    box-shadow: 0 -8px 28px rgb(0 0 0 / 18%);
    transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
    /* 시트 안에서의 터치는 우리가 제어하므로 손잡이의 네이티브 제스처를 끈다
       (본문 스크롤은 note-sheet-body가 따로 허용한다). */
    touch-action: none;
  }

  /* 드래그 중에는 손가락을 즉시 따라가도록 transition을 끈다(리사이저와 동일한
     이유 — 이징이 걸리면 한 박자 늦게 따라와 뻑뻑하다). */
  .note-sheet.dragging {
    transition: none;
  }

  .note-sheet-handle {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 1rem 0.6rem;
    border-bottom: 1px solid var(--border);
    cursor: grab;
    user-select: none;
    touch-action: none;
  }

  .note-sheet-handle:active {
    cursor: grabbing;
  }

  .note-sheet-grip {
    width: 40px;
    height: 4px;
    border-radius: 999px;
    background: var(--border-strong);
  }

  .note-sheet-heading {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--text-soft);
    font-size: 0.78rem;
    font-weight: 650;
  }

  /* chevron 아이콘은 오른쪽을 가리키므로 접힘 상태는 위(펼치기 유도),
     펼침 상태는 아래(접기 유도)를 향하게 회전시킨다. */
  .note-sheet-chevron {
    display: inline-flex;
    color: var(--text-muted);
    transform: rotate(-90deg);
    transition: transform 200ms ease;
  }

  .note-sheet-chevron.expanded {
    transform: rotate(90deg);
  }

  /* 본문은 남은 높이를 채우고, 그 안에서 MarkdownNote가 자기 스크롤을 갖는다.
     여기서는 세로 플렉스 컨테이너 역할만 한다(.split-note-pane과 대응). */
  .note-sheet-body {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    touch-action: auto;
  }
</style>
