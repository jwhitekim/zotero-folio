// 터치 제스처(한 손가락 팬 + 두 손가락 핀치)를 하나의 포인터 이벤트
// 스트림에서 전부 처리하는 공용 핸들러.
//
// 왜 팬까지 직접 하나:
//   예전엔 스크롤 요소에 touch-action: pan-x pan-y를 걸어 "팬은 브라우저,
//   핀치만 우리 JS"로 절충했는데, 이 값은 스펙상 두 손가락 움직임도 팬으로
//   해석해 브라우저가 스크롤 위치를 바꾼다. 그러면 같은 프레임에 우리 zoomTo가
//   보정하는 scrollTop과 경합해 확대 방향이 뒤집히거나 위치가 튀었다
//   (docs/touch/pdf-touch-pinch-zoom.md). 표준 권장대로 touch-action: none으로 모든
//   네이티브 터치 처리를 끄고, 팬·핀치를 여기서 전부 직접 구현해 경합을 없앤다.
//
// 확대 상태(zoom 값)와 그 반영/스크롤 보정(zoomTo)은 여전히 부모(PdfPane)가
// 단일 소스로 갖는다 — 이 핸들러는 제스처 인식만 하고 넘겨받은 zoomTo를 부른다.
// 데스크탑 Ctrl/Cmd+휠 확대(onPdfWheel)는 마우스 입력이라 touch-action의 영향을
// 받지 않으므로 이 핸들러와 무관하게 그대로 동작한다.
//
// 옵션:
// - getZoom(): 핀치 시작 순간의 현재 배율(startZoom 기준값).
// - zoomTo(nextZoom, clientY): 부모의 실제 확대 함수(핀치 중심 Y를 앵커로 넘김).
// - getScrollEl(): 팬으로 스크롤할 대상 요소(마운트 이후 늦게 잡힐 수 있어 getter).
// - getSelection(): 텍스트 선택 상태를 읽을 함수. 한 손가락 드래그가 "페이지
//   스크롤(팬)"인지 "텍스트 선택(형광펜 드래그/복사)"인지 가르는 기준이다 —
//   기본은 최상위 문서의 window.getSelection. iframe 안(HTML 스냅샷)에서 온
//   이벤트는 그 iframe의 getSelection을 넘겨야 그 문서의 선택을 본다.
// - clientYOffset(): iframe에서 온 이벤트의 clientY를 바깥 문서 좌표로 옮길
//   보정값(핀치 중심 앵커용). 기본 0(같은 문서).
//
// 스타일러스(pen)/마우스는 이 모듈에 애초에 안 들어온다(down 첫 줄에서 걸러짐).
// 그래서 그리기 도구가 켜져 있어도 여기 들어오는 터치는 전부 팬/핀치/선택으로만
// 다룬다 — 그리기는 PdfViewer가 pointerType으로 직접 스타일러스만 받아 처리한다.
export function createTouchGestures({
  getZoom,
  zoomTo,
  getScrollEl,
  getSelection = () => (typeof window !== 'undefined' ? window.getSelection() : null),
  clientYOffset = () => 0,
}) {
  const pointers = new Map(); // pointerId -> { x, y }
  // null | 'pan' | 'pinch' | 'select'
  //   'select'는 "이 한 손가락 드래그는 텍스트 선택이니 우리는 손 떼고
  //   브라우저 네이티브 선택에 맡긴다"는 뜻 — 그 제스처가 끝날 때까지 유지된다.
  let mode = null;

  // 관성 스크롤 상태 — 팬 중 손가락 이동 속도(px/ms)를 추적해뒀다가, 마지막
  // 손가락이 떨어질 때 그 속도로 감속 애니메이션을 이어간다(모바일 앱 스크롤 느낌).
  let velX = 0;
  let velY = 0;
  let lastPanTime = 0; // 마지막으로 팬을 반영한 시각(속도 계산·정지 판정용)
  let inertiaId = 0;

  // 핀치 상태
  let startDist = 0;
  let startZoom = 1;

  // 팬 상태 — 마지막 접점 좌표와, 이번 프레임에 아직 반영 안 한 누적 이동량.
  let lastX = 0;
  let lastY = 0;
  let pendingDx = 0;
  let pendingDy = 0;

  // 프레임당 1회 반영. 터치 pointermove는 프레임당 여러 번 들어오는데,
  // 매번 scrollTop/zoomTo를 부르면 강제 동기 레이아웃이 프레임을 잡아먹어
  // 버벅인다 — 최신 좌표/누적 이동량만 모아뒀다가 rAF에서 한 번만 반영한다.
  let rafId = 0;

  function twoPoints() {
    const it = pointers.values();
    return [it.next().value, it.next().value];
  }

  function applyPinch() {
    const [a, b] = twoPoints();
    if (!a || !b) return;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (!(startDist > 0) || !(dist > 0)) return;
    const centerY = (a.y + b.y) / 2 + clientYOffset();
    // 시작 배율 × 거리 변화 비율 = 목표 절대 배율.
    zoomTo(startZoom * (dist / startDist), centerY);
  }

  function applyPan() {
    const el = getScrollEl?.();
    if (!el) {
      pendingDx = pendingDy = 0;
      return;
    }
    // 손가락 이동 속도(px/ms)를 지수 평활로 추적한다 — 손을 뗄 때 관성 시작
    // 속도로 쓴다. dt가 비정상(0 또는 너무 큼: 손가락이 잠깐 멈춤)이면 건너뛴다.
    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = now - lastPanTime;
    if (dt > 0 && dt < 100) {
      velX = velX * 0.7 + (pendingDx / dt) * 0.3;
      velY = velY * 0.7 + (pendingDy / dt) * 0.3;
    }
    lastPanTime = now;
    // 손가락을 아래로 끌면(dy>0) 내용이 따라 내려와야 하므로 scrollTop은 줄인다.
    el.scrollTop -= pendingDy;
    el.scrollLeft -= pendingDx;
    pendingDx = pendingDy = 0;
  }

  function cancelInertia() {
    if (inertiaId) {
      cancelAnimationFrame(inertiaId);
      inertiaId = 0;
    }
  }

  // 손을 뗀 순간의 속도로 시작해 매 프레임 지수 감쇠하며 스크롤을 이어간다.
  // 속도가 충분히 작아지면 멈춘다. 감쇠 계수는 16ms(약 60fps) 기준 프레임당
  // 0.95이며, 실제 프레임 간격(dt)에 맞춰 보정한다.
  function startInertia() {
    const el = getScrollEl?.();
    if (!el) return;
    cancelInertia();
    let last =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const step = (now) => {
      const dt = now - last;
      last = now;
      el.scrollTop -= velY * dt;
      el.scrollLeft -= velX * dt;
      const decay = Math.pow(0.95, dt / 16);
      velX *= decay;
      velY *= decay;
      if (Math.hypot(velX, velY) < 0.02) {
        inertiaId = 0;
        return;
      }
      inertiaId = requestAnimationFrame(step);
    };
    inertiaId = requestAnimationFrame(step);
  }

  function flush() {
    rafId = 0;
    if (mode === 'pinch' && pointers.size === 2) applyPinch();
    else if (mode === 'pan' && pointers.size === 1) applyPan();
  }

  function schedule() {
    if (!rafId) rafId = requestAnimationFrame(flush);
  }

  function cancelPending() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    pendingDx = pendingDy = 0;
  }

  // 남은 한 손가락 기준으로 팬을 (재)시작 — 좌표를 지금 위치로 리셋해
  // 핀치→팬 전환 시 튀지 않게 한다.
  function beginPan(p) {
    mode = 'pan';
    lastX = p.x;
    lastY = p.y;
    pendingDx = pendingDy = 0;
    // 새 팬은 속도 추적을 처음부터 다시 시작한다.
    velX = velY = 0;
    lastPanTime =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function down(e) {
    // 마우스/펜은 건드리지 않는다(데스크탑 경로 유지). 터치만 우리가 전담한다.
    if (e.pointerType !== 'touch') return;
    // 관성 스크롤 도중 다시 만지면 즉시 멈추고 새 팬으로 자연스럽게 이어받는다.
    cancelInertia();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const [a, b] = twoPoints();
      startDist = Math.hypot(a.x - b.x, a.y - b.y);
      startZoom = getZoom();
      mode = 'pinch';
    } else if (pointers.size === 1) {
      beginPan({ x: e.clientX, y: e.clientY });
    }
  }

  function move(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (mode === 'pinch' && pointers.size === 2) {
      // 네이티브 처리는 touch-action: none으로 이미 꺼져 있지만, 확실히
      // 소비한다.
      e.preventDefault();
      schedule();
      return;
    }

    if (pointers.size !== 1) return;
    if (mode === 'select') return; // 이 드래그는 텍스트 선택 — 끝까지 관여 안 함

    // 한 손가락 드래그가 텍스트 선택인지 판별한다. 태블릿에서 텍스트 선택은
    // 길게 누르기(long-press)로 시작되므로, 손가락이 실제로 움직이기 시작할
    // 때쯤이면 이미 선택 영역이 생겨 있다(non-collapsed). 그때는 팬을 하지
    // 않고 브라우저 네이티브 선택(형광펜 드래그의 기반)에 그대로 넘긴다.
    // 이 선택 상태 판정은 형광펜 저장이 pointerup에서 읽는 window.getSelection과
    // 같은 신호라, 별도 텍스트레이어 히트테스트를 새로 만들지 않고 재사용한다.
    const sel = getSelection();
    if (sel && !sel.isCollapsed) {
      mode = 'select';
      return;
    }

    // 팬: 이동량을 누적하고 다음 프레임에 스크롤에 반영한다. preventDefault로
    // 이 드래그가 실수로 텍스트 선택을 시작하지 않게 한다.
    e.preventDefault();
    pendingDx += e.clientX - lastX;
    pendingDy += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    schedule();
  }

  function up(e) {
    if (!pointers.delete(e.pointerId)) return;

    if (pointers.size === 2) {
      // 세 손가락 → 두 손가락처럼 줄어든 경우: 남은 둘로 핀치 기준을 다시 잡는다.
      const [a, b] = twoPoints();
      startDist = Math.hypot(a.x - b.x, a.y - b.y);
      startZoom = getZoom();
      mode = 'pinch';
    } else if (pointers.size === 1) {
      // 핀치 → 한 손가락: 남은 손가락으로 팬을 이어간다(튐 방지 위해 좌표 리셋).
      beginPan(twoPoints()[0]);
    } else {
      // 마지막 손가락이 떨어졌다. 방금까지 팬 중이었고 속도가 충분하면 관성
      // 스크롤을 이어간다(손을 뗀 직후여야 함 — 잠깐 멈췄다 떼면 튀지 않게).
      const now =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      const fresh = now - lastPanTime < 80;
      cancelPending();
      if (mode === 'pan' && fresh && Math.hypot(velX, velY) >= 0.02) {
        startInertia();
      } else {
        velX = velY = 0;
      }
      mode = null;
    }
  }

  return { down, move, up, cancel: up };
}
