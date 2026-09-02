<script>
  // PDF 렌더링/확대·축소/중앙 정렬/텍스트·주석 레이어는 전부 pdf.js가 자기
  // 공식 웹 뷰어(Chrome 내장 뷰어 등도 같은 계열)에 쓰는 PDFViewer 엔진에
  // 맡긴다 — 예전엔 캔버스를 직접 그리고 스크롤 위치로 중앙 정렬을 손수
  // 계산했는데, 그 수식이 확대 시 비대칭하게 밀리는 등 버그가 반복돼서
  // pdfjs-dist에 이미 포함된 검증된 엔진으로 갈아탔다.
  import '../utils/safari-polyfills.js';
  import * as pdfjsLib from 'pdfjs-dist';
  import { EventBus, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
  import 'pdfjs-dist/web/pdf_viewer.css';
  import pdfWorkerUrl from '../utils/pdf-worker-entry.js?worker&url';

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  // scrollContainer: 실제로 스크롤되는 요소(PdfPane.svelte의 .viewer-scroll) —
  // PDFViewer가 스크롤 위치/가시 영역을 직접 읽고 쓰는 대상이라, 우리 것과
  // 같은 요소를 넘겨줘야 확대 시 커서 고정 스크롤 보정(PdfPane.svelte의
  // zoomTo)이 계속 같은 스크롤 위치 기준으로 동작한다.
  let { src, zoom = 1, scrollContainer } = $props();

  let viewerEl = $state();
  let loading = $state(true);
  let error = $state('');
  let errorDetail = $state('');

  let eventBus;
  let linkService;
  let pdfViewer;
  let pdfDocument;
  let loadedSrc = '';

  // 컨테이너 폭 기준 "페이지가 폭에 딱 맞는" 절대 배율. zoom prop(1 = 그
  // 배율)과 곱해서 PDFViewer에 넘길 실제 절대 배율을 만든다 — PDFViewer의
  // currentScale은 PDF 좌표계 기준 절대값이라 우리 쪽 "폭 맞춤 대비 %"
  // 개념과 다르기 때문.
  let fitWidthScale = $state(null);
  // CSS로 즉시 미리보기 확대를 보여주는 배율 기준값 — 실제 재렌더(고비용)는
  // 아래에서 debounce하고, 그 사이엔 이 값 대비 zoom 비율만큼 transform:
  // scale로 즉시 반응하는 느낌을 준다.
  let renderedZoom = $state(1);
  let zoomTimer;

  // 참고문헌 링크로 점프하기 직전의 스크롤 위치. null이면 되돌아갈 위치가
  // 없다는 뜻. 화면에 떠 있는 버튼은 없고, Alt+← 단축키나 브라우저
  // 뒤로가기로 조용히 원위치로 돌아간다.
  let jumpBackTop = $state(null);

  function jumpBack() {
    if (jumpBackTop == null || !scrollContainer) return;
    scrollContainer.scrollTo({ top: jumpBackTop, behavior: 'auto' });
    jumpBackTop = null;
  }

  // 실제 점프(스크롤 이동)는 PDFLinkService가 표준 방식으로 처리하므로, 여기서는
  // 그 직전에 "돌아갈 위치"만 옆에서 가로채 기록한다. capture 단계라 실제
  // 링크 클릭 핸들링보다 먼저 실행된다.
  function onLinkClickCapture(e) {
    if (!scrollContainer) return;
    const link = e.target.closest?.('.annotationLayer .linkAnnotation a');
    if (!link) return;
    // "돌아갈 위치"는 지금 보고 있는(=점프 직전) 히스토리 엔트리에 저장해야
    // 네이티브 뒤로가기 시 popstate가 그 값을 그대로 돌려준다. pushState만
    // 하면 스크롤 값이 "앞으로 갈 새 엔트리"에 들어가 버려서, 뒤로가기 때는
    // 이전 엔트리의(값 없는) state가 와 복원이 안 됐다(off-by-one). 그래서
    // 현재 엔트리에 replaceState로 먼저 심고, 점프한 뷰용으로 빈 엔트리를
    // 새로 push한다.
    history.replaceState(
      { ...history.state, pdfScrollTop: scrollContainer.scrollTop },
      '',
      location.href
    );
    history.pushState({}, '', location.href);
    jumpBackTop = scrollContainer.scrollTop;
  }

  async function loadDocument(url) {
    if (pdfDocument && loadedSrc === url) return pdfDocument;
    pdfDocument = await pdfjsLib.getDocument({ url }).promise;
    loadedSrc = url;
    return pdfDocument;
  }

  // 컨테이너 폭이 유효할 때만(탭 전환 등으로 숨겨져 폭이 0이면 건너뜀) "폭
  // 맞춤" 절대 배율을 다시 잰다. PDFViewer 자신의 named-scale 계산을
  // 그대로 활용 — 우리가 폭/여백 수식을 따로 들고 있지 않는다.
  function measureFitWidthScale() {
    if (!pdfViewer || !scrollContainer || scrollContainer.clientWidth === 0) return null;
    pdfViewer.currentScaleValue = 'page-width';
    return pdfViewer.currentScale;
  }

  function commitScale() {
    if (fitWidthScale == null || !pdfViewer) return;
    pdfViewer.currentScale = fitWidthScale * zoom;
    renderedZoom = zoom;
  }

  async function loadAndShow(url) {
    if (!pdfViewer) return;
    loading = true;
    error = '';
    try {
      const doc = await loadDocument(url);
      linkService.setDocument(doc);
      pdfViewer.setDocument(doc);
      // 나머지(배율 계산/loading 해제)는 pagesinit 이벤트에서 처리한다.
    } catch (err) {
      error = err.message;
      errorDetail = [
        `${err.name || 'Error'}: ${err.message}`,
        err.stack || '(스택 정보 없음)',
        navigator.userAgent,
      ].join('\n');
      console.error('[PdfViewer]', err);
      loading = false;
    }
  }

  let prevSrc;
  let prevZoom;

  $effect(() => {
    const s = src;
    const z = zoom;
    if (!pdfViewer) return; // 아래 초기화 effect가 아직 못 끝냈으면 여기선 아무것도 안 함

    if (s !== prevSrc) {
      prevSrc = s;
      prevZoom = z;
      clearTimeout(zoomTimer);
      loadAndShow(s);
      return;
    }

    if (z === prevZoom) return;
    prevZoom = z;
    // 배율만 바뀐 경우(휠/버튼 연타)엔 실제 재렌더를 잠깐 미룬다 — 매번
    // 다시 그리면 번쩍이고 무겁다. CSS 미리보기(아래 style:transform)가
    // 그 사이 즉시 반응하는 느낌을 대신 준다.
    clearTimeout(zoomTimer);
    zoomTimer = setTimeout(commitScale, 150);
  });

  // scrollContainer는 부모(PdfPane.svelte)가 bind:this로 넘겨주는 값이라,
  // 이 컴포넌트가 마운트되는 시점엔 아직 안 들어와 있을 수 있다(onMount에서
  // 곧바로 확인하면 "아직 없음"으로 오판할 수 있었던 버그) — $effect로
  // 두면 값이 나중에 들어와도 자동으로 다시 실행되니, 준비될 때까지
  // 기다렸다가 한 번만 초기화한다.
  let setupDone = false;
  $effect(() => {
    if (setupDone || !scrollContainer || !viewerEl) return;
    setupDone = true;

    eventBus = new EventBus();
    linkService = new PDFLinkService({ eventBus, ignoreDestinationZoom: true });
    pdfViewer = new PDFViewer({
      container: scrollContainer,
      viewer: viewerEl,
      eventBus,
      linkService,
      removePageBorders: true,
    });
    linkService.setViewer(pdfViewer);

    // 참고문헌/각주 링크를 클릭해도 조용히 아무 반응이 없던 버그의 원인: pdf.js의
    // 내부 scrollIntoView 유틸은 대상 페이지 div에서 offsetParent를 타고 올라가며
    // "실제 스크롤 컨테이너"를 자기가 알아서 찾는데, .pdfViewer에 확대 미리보기용
    // transform이 걸려 있으면(scale(1)이어도 마찬가지 — transform 유무 자체가
    // 기준) 그 탐색이 .pdfViewer 자신에서 멈춰버린다. .pdfViewer는 overflow:visible
    // 이라 스크롤이 안 되는 요소라서, scrollTop을 대입해도 조용히 무시되고 실제
    // 스크롤 컨테이너(.viewer-scroll)까지는 못 올라간다.
    // goToDestination 안에서만 보정한다 — pdfViewer.scrollPageIntoView 자체를
    // 덮어쓰면 확대/축소 시 pdf.js가 내부적으로 호출하는 재중심 로직까지 건드리게
    // 되는데, 그건 PdfPane.svelte가 이미 커서 기준으로 직접 스크롤을 보정하고
    // 있어서 손대면 오히려 그 보정과 충돌한다.
    // 아래 보정은 _origGoToDestination이 내부적으로 스크롤에 성공했든 실패했든
    // 상관없이, pageDiv.getBoundingClientRect()로 "지금 실제로 어디 있는지"를
    // 다시 재서 scrollTop을 절대값으로 다시 맞춘다 — 그래서 .pdfViewer에 transform이
    // 걸려있는지 여부와 무관하게 항상 정확하다(아래 style:transform을 휴지
    // 상태에서 없애도 이 보정 로직은 그대로 안전하다).
    const _origGoToDestination = linkService.goToDestination.bind(linkService);
    linkService.goToDestination = async (dest) => {
      await _origGoToDestination(dest);
      const pageView = pdfViewer._pages?.[pdfViewer.currentPageNumber - 1];
      const pageDiv = pageView?.div;
      if (!pageDiv || !scrollContainer) return;

      // 페이지 최상단이 아니라 "목적지 지점 자체"가 화면 맨 위에 오도록,
      // 페이지 안에서 목적지의 세로 위치(destTop, 페이지 상단 기준 CSS px)를
      // 구해서 더한다 — 참고문헌이 페이지 중간/아래쪽에 있으면 페이지
      // 최상단만 맞춰서는 그 위치가 화면 밖에 걸친다. pdf.js의
      // scrollPageIntoView가 XYZ 목적지에 내부적으로 쓰는 것과 동일한 좌표
      // 변환(pageView.viewport.convertToViewportPoint)을 그대로 가져다 쓴다 —
      // XYZ가 아니거나(Fit 계열) y값이 없거나 계산이 실패하면 기존과 같이
      // destTop=0(페이지 최상단)으로 안전하게 폴백한다.
      let destTop = 0;
      try {
        const explicitDest = Array.isArray(dest) ? dest : await pdfDocument?.getDestination(dest);
        const y = explicitDest?.[3];
        if (explicitDest?.[1]?.name === 'XYZ' && y != null && pageView.viewport) {
          const [, viewportY] = pageView.viewport.convertToViewportPoint(explicitDest[2] ?? 0, y);
          destTop = Math.max(0, viewportY);
        }
      } catch {
        destTop = 0;
      }

      const target =
        scrollContainer.scrollTop +
        (pageDiv.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top) +
        destTop;
      scrollContainer.scrollTop = Math.max(0, target);
    };

    const eventAbort = new AbortController();
    eventBus.on(
      'pagesinit',
      () => {
        fitWidthScale = measureFitWidthScale();
        commitScale();
        loading = false;
      },
      { signal: eventAbort.signal }
    );

    // 브라우저 창 크기뿐 아니라, 원문/노트 패널 사이 구분선을 드래그해서
    // 이 컨테이너 자체의 폭이 바뀌는 경우에도 폭 맞춤을 다시 재야 한다 —
    // 그건 window resize 이벤트로는 안 잡히므로, 컨테이너 자신의 크기를
    // 직접 관찰한다.
    let resizeTimer;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const nextFit = measureFitWidthScale();
        if (nextFit == null) return; // 탭 전환 등으로 숨겨진 동안엔 아예 건너뜀
        fitWidthScale = nextFit;
        commitScale();
      }, 180);
    });
    resizeObserver.observe(scrollContainer);

    // 참고문헌 링크로 점프하기 전 위치를 history state에 남겨두므로
    // (onLinkClickCapture 참고), 뒤로가기 시 그 위치로 돌아간다.
    const onPopState = (e) => {
      if (typeof e.state?.pdfScrollTop !== 'number') return;
      scrollContainer?.scrollTo({ top: e.state.pdfScrollTop, behavior: 'auto' });
      jumpBackTop = null;
    };
    // Alt+← : 브라우저 전체 이동이 아니라 이 PDF 안에서 참고문헌 점프 전
    // 위치로 돌아가는 전용 단축키. 맥(Option+←)/Windows/Linux 구분 없이 전
    // 플랫폼에서 동일하게 동작한다. Windows/Linux에서 Alt+←는 브라우저
    // 네이티브 뒤로가기 기본 동작이기도 한데, keydown의 기본 동작이라
    // preventDefault()로 취소할 수 있다 — 아래에서 preventDefault()와
    // stopPropagation()을 함께 걸고, 리스너도 capture 단계에 등록해서 앱의
    // 다른 keydown 핸들러보다 먼저 이 이벤트를 소비한다.
    // e.key로 판별한다 — 메인 키보드 화살표와, NumLock이 꺼진 넘패드 4가
    // 둘 다 'ArrowLeft'로 들어와 어느 쪽으로 눌러도 같게 동작한다.
    // 입력창/메모 에디터에 포커스가 있을 때는 가로채지 않는다(타이핑을
    // 방해하면 안 되므로). 돌아갈 위치가 없으면(jumpBackTop == null)
    // 가로채지 않고 그대로 흘려보내, 브라우저 네이티브 뒤로가기가 평소대로
    // 동작하게 둔다.
    const onKeyDown = (e) => {
      if (e.key !== 'ArrowLeft' || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (jumpBackTop == null) return;
      e.preventDefault();
      e.stopPropagation();
      jumpBack();
    };

    window.addEventListener('popstate', onPopState);
    // 예전엔 맥에서만 Option+←를 등록했지만(Windows/Linux의 Alt+←가 브라우저
    // 네이티브 뒤로가기와 겹쳐서), 이제 플랫폼 구분 없이 항상 등록한다 —
    // 네이티브 뒤로가기는 위 onKeyDown의 preventDefault()로 억제한다.
    // capture(true) 단계로 등록해서 앱의 다른 keydown 핸들러보다 먼저 잡는다.
    // 브라우저 뒤로가기로 돌아가는 경로(위 popstate)도 그대로 함께 살아 있다.
    window.addEventListener('keydown', onKeyDown, true);
    scrollContainer?.addEventListener('click', onLinkClickCapture, true);

    prevSrc = src;
    prevZoom = zoom;
    loadAndShow(src);

    return () => {
      clearTimeout(resizeTimer);
      clearTimeout(zoomTimer);
      resizeObserver.disconnect();
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKeyDown, true);
      scrollContainer?.removeEventListener('click', onLinkClickCapture, true);
      eventAbort.abort();
    };
  });
</script>

{#if loading}<p class="pdf-status">PDF 페이지를 준비하는 중…</p>{/if}
{#if error}
  <div class="pdf-status error">
    <p>PDF를 불러오지 못했어요: {error}</p>
    <details class="pdf-error-detail">
      <summary>기술 정보 (스크린샷으로 공유해주세요)</summary>
      <pre>{errorDetail}</pre>
    </details>
  </div>
{/if}
<!-- 확대율이 막 바뀐 직후(재렌더 debounce 150ms 동안)에만 CSS 미리보기용
     transform을 걸고, 재렌더가 끝나 zoom === renderedZoom이 되면(=대부분의
     시간) transform 자체를 아예 없앤다(scale(1)도 안 남긴다). transform이
     걸려 있으면 값이 1이어도 그 자체로 별도 합성 레이어로 승격되는데, 이게
     텍스트 레이어(--scale-x 기반 span 배치)와 캔버스가 서로 다른 레이어에서
     독립적으로 기기 픽셀에 스냅되게 만들어 fractional 배율(Windows 125%/150%)
     에서 텍스트 선택 하이라이트가 캔버스 글자와 미세하게 어긋나는 걸 키우는
     원인으로 의심된다. 공식 pdf.js 데모 뷰어엔 이런 상시 transform 래퍼가
     없어서 같은 문제가 덜 보인다 — 그래서 휴지 상태에선 우리도 transform을
     완전히 없애 그 데모와 같은 조건으로 맞춘다. -->
<div
  class="pdfViewer"
  bind:this={viewerEl}
  style:transform={zoom === renderedZoom ? undefined : `scale(${zoom / renderedZoom})`}
></div>

<style>
  .pdfViewer {
    /* 세로 앵커링은 부모(PdfPane.svelte)가 scrollTop을 직접 보정하는
       방식으로 처리한다. origin이 여기서 움직이면 스케일이 걸린 상태에서
       기준점이 바뀌어 화면이 튀므로, 항상 상단 중앙으로 고정해둔다. */
    transform-origin: 50% 0;
  }

  /* 페이지 낱장의 테두리/그림자는 pdf.js 기본값(투명 9px 보더) 대신
     Folio 팔레트에 맞춘 우리 것으로 — removePageBorders 옵션으로 기본값은
     꺼두고 여기서만 얇게 덧입힌다. */
  :global(.pdfViewer .page) {
    border-radius: 3px;
    box-shadow: 0 4px 18px rgba(77, 47, 33, 0.15);
  }

  /* pdf.js는 여러 글자로 된 텍스트 span의 목표 폭을 hidden canvas의
     measureText()로 잰 뒤, 인라인 --scale-x로 실제 DOM 텍스트를 보정한다.
     Windows fractional DPI에서는 이 측정값과 화면에 그려진 글자의 폭이
     달라 선택 영역이 오른쪽으로 누적해서 밀릴 수 있으므로, 측정 보정이
     실제로 들어간 span에 한해서 scaleX를 끈다. pdf.js의 인라인 custom
     property보다 우선해야 해서 !important가 필요하다. */
  :global(.pdfViewer .textLayer span[style*='--scale-x']) {
    --scale-x: 1 !important;
  }

  .pdf-error-detail {
    max-width: 420px;
    margin: 0.75rem auto 0;
    text-align: left;
  }

  .pdf-error-detail summary {
    cursor: pointer;
    font-size: 0.72rem;
  }

  .pdf-error-detail pre {
    margin-top: 0.5rem;
    padding: 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-subtle);
    color: var(--text-soft);
    font-size: 0.68rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    user-select: text;
  }
</style>
