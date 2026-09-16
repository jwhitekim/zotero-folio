<script>
  import Icon from '../components/Icon.svelte';
</script>

<div class="guide-page">
  <a class="guide-back" href="/">← Folio로 돌아가기</a>

  <header class="guide-header">
    <span class="guide-logo"><Icon name="library" size={22} strokeWidth={1.7} /></span>
    <div>
      <p class="eyebrow">HOW TO USE</p>
      <h1>Folio 사용 가이드</h1>
    </div>
  </header>

  <section class="guide-section">
    <h2>Zotero와의 관계</h2>
    <p>
      Folio는 Zotero를 대체하는 도구가 아니라 그 위에서 동작하는 보조 도구입니다.
      논문 저장, 메타데이터 추출, PDF 파일 관리, 여러 기기 간 동기화는 전부 Zotero가
      담당하고, Folio는 그 위에서 <strong>읽고 메모하는 화면</strong>만 따로 제공합니다.
    </p>
    <ul>
      <li>Zotero 라이브러리에 이미 있는 논문/자료가 Folio 목록에 그대로 나타납니다.</li>
      <li>Folio에서 작성한 메모는 Zotero의 note로 저장되어, Zotero 앱에서도 그대로 보입니다.</li>
      <li>PDF 필기·형광펜도 Zotero의 annotation으로 저장되어 Zotero PDF 뷰어와 호환됩니다.</li>
      <li>논문 제목/저자/PDF 같은 원본 서지정보는 Folio가 절대 수정하지 않습니다.</li>
    </ul>
    <p class="guide-note">
      즉 Zotero 계정 연결이 먼저 되어 있어야 하고, Folio 화면에서 삭제/추가한 내용도
      결국 같은 Zotero 라이브러리에 반영됩니다.
    </p>
  </section>

  <section class="guide-section">
    <h2>Papers — 논문 목록</h2>
    <p>Zotero에 모아둔 논문과 자료를 한눈에 봅니다. 최근순/년도순/이름순 정렬과 목록/표지 보기를 전환할 수 있습니다.</p>
    <ul>
      <li><strong>동기화</strong> 버튼을 누르면 Zotero에서 바뀐 항목만 다시 불러옵니다.</li>
      <li><strong>웹페이지 추가</strong>로 URL을 입력하면 그 페이지가 새 논문처럼 목록에 추가됩니다(제목은 페이지 &lt;title&gt;에서 가져옵니다).</li>
    </ul>
  </section>

  <section class="guide-section">
    <h2>논문 상세 — 원문과 메모</h2>
    <p>논문을 열면 왼쪽에 원문(PDF 또는 저장된 웹페이지), 오른쪽에 그 논문 전용 메모가 나란히 보입니다(좁은 화면에서는 바텀시트로 전환).</p>
    <ul>
      <li>PDF는 확대/축소, 텍스트 드래그로 <strong>형광펜</strong> 하이라이트를 만들 수 있습니다.</li>
      <li>원문 툴바의 <strong>펜</strong>으로 자유롭게 필기하고, <strong>형광펜(프리핸드)</strong>으로 드래그하면 곧은 직선 막대 하이라이트가 그려집니다(굵기 선택 가능).</li>
      <li><strong>지우개</strong>를 켜고 드래그하면 닿는 필기/프리핸드 형광펜 획을 확인 없이 바로 지웁니다.</li>
      <li>메모는 이 논문에 딸린 note로 저장되며, 작성할 때마다 새로 쌓이지 않고 같은 note를 계속 수정합니다.</li>
    </ul>
  </section>

  <section class="guide-section">
    <h2>나만의 메모 — 독립 메모</h2>
    <p>특정 논문에 속하지 않는 메모를 따로 쓰는 공간입니다. Zotero에서도 독립 note로 저장됩니다.</p>
  </section>

  <section class="guide-section">
    <h2>컬렉션</h2>
    <p>Zotero에서 만든 컬렉션(폴더) 구조를 그대로 따라가며 논문을 탐색할 수 있습니다.</p>
  </section>

  <section class="guide-section">
    <h2>검색</h2>
    <p>상단 검색 아이콘(또는 Ctrl/Cmd+K)으로 제목 기준 검색을 바로 열 수 있습니다. 의미 기반(임베딩) 검색은 아직 지원하지 않습니다.</p>
  </section>
</div>

<style>
  .guide-page {
    max-width: 720px;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 4rem;
    color: var(--text);
  }

  .guide-back {
    display: inline-block;
    margin-bottom: 1.5rem;
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.85rem;
  }

  .guide-back:hover {
    color: var(--accent);
  }

  .guide-header {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    margin-bottom: 2.2rem;
  }

  .guide-logo {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: var(--accent-pale);
    color: var(--accent);
    flex: 0 0 auto;
  }

  .eyebrow {
    margin: 0 0 0.15rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .guide-header h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .guide-section {
    margin-bottom: 2rem;
    padding-bottom: 2rem;
    border-bottom: 1px solid var(--border);
  }

  .guide-section:last-child {
    border-bottom: 0;
  }

  .guide-section h2 {
    margin: 0 0 0.7rem;
    font-size: 1.1rem;
    color: var(--accent-strong);
  }

  .guide-section p {
    margin: 0 0 0.7rem;
    color: var(--text-soft);
    line-height: 1.7;
  }

  .guide-section ul {
    margin: 0 0 0.7rem;
    padding-left: 1.2rem;
    color: var(--text-soft);
    line-height: 1.7;
  }

  .guide-section li {
    margin-bottom: 0.3rem;
  }

  .guide-note {
    padding: 0.8rem 1rem;
    background: var(--surface-subtle);
    border-radius: 10px;
    font-size: 0.85rem;
  }
</style>
