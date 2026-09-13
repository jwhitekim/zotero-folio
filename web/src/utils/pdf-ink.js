// PDF 필기(ink)용 순수 계산 함수 모음.
// 좌표 변환/경로 문자열 생성/히트테스트처럼 DOM 상태를 갖지 않는 계산만 여기
// 둔다 — 실제 렌더링과 마크업/스타일은 PdfViewer.svelte가 소유한다 (CLAUDE.md의
// "뷰어 하나당 컴포넌트 하나" 규칙 유지). pdf-highlight.js와 같은 역할/톤.

// 펜 색은 고정이다(1차 범위 — 색 선택 UI 없음). Zotero ink annotation의
// annotationColor에 그대로 들어가므로, 앱 텍스트색과 무관하게 실제 색상값을 쓴다.
export const INK_COLOR = '#1a1a1a';

// 굵기 3단계(얇음/보통/굵음). 값은 Zotero ink annotationPosition.width에 그대로
// 저장되는 PDF 좌표(pt) 기준 굵기다 — Zotero 실측 샘플의 기본값이 2였다.
export const INK_WIDTHS = [
  { value: 1, label: '얇음' },
  { value: 2, label: '보통' },
  { value: 4, label: '굵음' },
];

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

// 화면(client) 좌표 한 점을 PDF 사용자 좌표(좌하단 원점, pt)로 바꾼다.
// pageRect는 페이지 div의 getBoundingClientRect, scale은 "화면상 페이지 폭 /
// viewport.width"(pdf-highlight.js의 toPdfRect와 동일한 기준).
export function toPdfPoint(clientX, clientY, pageRect, viewport, scale) {
  const [x, y] = viewport.convertToPdfPoint((clientX - pageRect.left) / scale, (clientY - pageRect.top) / scale);
  return [round3(x), round3(y)];
}

// 반대 방향 — 저장된 PDF 좌표 한 점을 페이지 div 안에서 쓸 CSS 좌표로.
// 여기 쓰는 scale은 toPageBox와 같은 "레이아웃상" 배율이어야 한다.
export function toPagePoint(x, y, viewport, scale) {
  const [vx, vy] = viewport.convertToViewportPoint(x, y);
  return { x: vx * scale, y: vy * scale };
}

// 평탄화된 스트로크 좌표([x1,y1,x2,y2,...])를 페이지 CSS 좌표로 변환해 SVG path의
// d 문자열로 만든다. 점이 하나뿐이면(탭에 가까운 짧은 스트로크) 아주 짧은 선을
// 그어 점처럼 보이게 한다.
export function strokeToPagePath(flatCoords, viewport, scale) {
  const pts = [];
  for (let i = 0; i + 1 < flatCoords.length; i += 2) {
    pts.push(toPagePoint(flatCoords[i], flatCoords[i + 1], viewport, scale));
  }
  if (!pts.length) return '';
  if (pts.length === 1) {
    const { x, y } = pts[0];
    return `M ${x.toFixed(2)} ${y.toFixed(2)} L ${(x + 0.1).toFixed(2)} ${y.toFixed(2)}`;
  }
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
}

// 점 p(client)에서 선분 a-b(client)까지의 최단 거리.
function pointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// 화면 좌표 점이 스트로크(client 좌표 점 목록)의 어느 선분에든 tolerance px
// 이내로 닿는지. 필기 스트로크를 탭해서 지울 때의 히트테스트에 쓴다.
export function isPointNearStroke(px, py, clientPoints, tolerance) {
  if (clientPoints.length === 1) {
    return Math.hypot(px - clientPoints[0].x, py - clientPoints[0].y) <= tolerance;
  }
  for (let i = 0; i + 1 < clientPoints.length; i += 1) {
    const a = clientPoints[i];
    const b = clientPoints[i + 1];
    if (pointToSegment(px, py, a.x, a.y, b.x, b.y) <= tolerance) return true;
  }
  return false;
}

// 저장된 스트로크 좌표([x,y,x,y,...])를 화면(client) 좌표 점 목록으로.
// pageRect는 페이지 div의 getBoundingClientRect, scale은 "화면상 페이지 폭 /
// viewport.width"(히트테스트는 실제 화면 배율 기준이어야 하므로 previewFactor를
// 나누지 않은 값).
export function strokeToClientPoints(flatCoords, pageRect, viewport, scale) {
  const pts = [];
  for (let i = 0; i + 1 < flatCoords.length; i += 2) {
    const [vx, vy] = viewport.convertToViewportPoint(flatCoords[i], flatCoords[i + 1]);
    pts.push({ x: pageRect.left + vx * scale, y: pageRect.top + vy * scale });
  }
  return pts;
}

// 스트로크의 최대 y(PDF 좌표) — sortIndex의 "위에서부터 거리" 계산용
// (viewBox 높이에서 빼서 위쪽 기준 거리로 만든다).
export function strokeMaxY(flatCoords) {
  let maxY = 0;
  for (let i = 1; i < flatCoords.length; i += 2) {
    if (flatCoords[i] > maxY) maxY = flatCoords[i];
  }
  return maxY;
}
