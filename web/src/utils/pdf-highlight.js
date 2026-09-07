// PDF 하이라이트(형광펜)용 순수 계산 함수 모음.
// 좌표 변환/사각형 병합/텍스트 추출처럼 DOM 상태를 갖지 않는 계산만 여기 둔다 —
// 실제 렌더링과 마크업/스타일은 PdfViewer.svelte가 소유한다 (CLAUDE.md의
// "뷰어 하나당 컴포넌트 하나" 규칙 유지).

// Zotero 기본 하이라이트 팔레트. Zotero 데스크톱/모바일이 쓰는 색상값을
// 그대로 쓴다 — Folio에서 칠한 하이라이트가 Zotero 쪽 색상 필터에서도
// 같은 색으로 잡히게 하려면 임의의 색을 넣으면 안 된다.
export const HIGHLIGHT_COLORS = [
  { value: '#ffd400', label: '노랑' },
  { value: '#ff6666', label: '빨강' },
  { value: '#5fb236', label: '초록' },
  { value: '#2ea8e5', label: '파랑' },
  { value: '#a28ae5', label: '보라' },
];

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

// 선택 영역의 client rect 묶음을 "줄 단위" 사각형으로 합친다.
// pdf.js 텍스트 레이어는 한 줄을 여러 span으로 쪼개 두기 때문에 그대로 쓰면
// 사각형이 수십 개씩 나온다. 세로로 절반 이상 겹치고(같은 줄) 가로로도 붙어
// 있을 때만 합치는데, 가로 간격 조건이 있어야 2단 편집 논문에서 좌우 단의
// 같은 높이 줄이 단 사이 여백을 가로질러 하나로 이어지지 않는다.
export function mergeLineRects(rects, maxGap = 8) {
  const items = [...rects]
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }))
    .sort((a, b) => a.top - b.top || a.left - b.left);

  const merged = [];
  for (const rect of items) {
    const last = merged[merged.length - 1];
    if (last) {
      const overlap = Math.min(last.bottom, rect.bottom) - Math.max(last.top, rect.top);
      const minHeight = Math.min(last.bottom - last.top, rect.bottom - rect.top);
      if (overlap > minHeight * 0.5 && rect.left - last.right < maxGap) {
        last.left = Math.min(last.left, rect.left);
        last.right = Math.max(last.right, rect.right);
        last.top = Math.min(last.top, rect.top);
        last.bottom = Math.max(last.bottom, rect.bottom);
        continue;
      }
    }
    merged.push(rect);
  }
  return merged;
}

// Range의 텍스트를 뽑는다. pdf.js 텍스트 레이어는 줄바꿈을 <br>로 넣는데
// Range.toString()은 <br>을 무시해서 줄과 줄이 그대로 붙어버린다 — 복제한
// 조각에서 <br>을 개행 문자로 바꾼 뒤 읽어서 그 문제를 피한다.
export function extractRangeText(range) {
  const fragment = range.cloneContents();
  for (const br of fragment.querySelectorAll('br')) {
    br.replaceWith(document.createTextNode('\n'));
  }
  return fragment.textContent || '';
}

// annotationText로 저장할 형태로 다듬는다 (줄바꿈/연속 공백을 공백 하나로).
export function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// Zotero annotationSortIndex 문자열 — "페이지(5자리)|문자오프셋(6자리)|위에서부터의
// 거리(5자리)" 형식이며 Zotero 스키마가 이 자릿수를 그대로 검사한다.
// 정렬용 값이라 오프셋이 근사치여도 같은 페이지 안 순서만 맞으면 충분하다.
export function formatSortIndex(pageIndex, offset, top) {
  const clamp = (n, max) => Math.min(max, Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)));
  return [
    String(clamp(pageIndex, 99999)).padStart(5, '0'),
    String(clamp(offset, 999999)).padStart(6, '0'),
    String(clamp(top, 99999)).padStart(5, '0'),
  ].join('|');
}

// 두 PDF 좌표 사각형([minX, minY, maxX, maxY])이 겹치는지. 같은 페이지 안에서
// 새로 칠하려는 영역이 이미 칠해진 하이라이트와 조금이라도 닿는지 볼 때 쓴다
// (덧칠 대신 지우기로 바꾸는 토글 판정용).
export function rectsOverlap(a, b) {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

// 화면 좌표(DOMRect)를 PDF 사용자 좌표(좌하단 원점, pt)로 바꾼다.
// pageRect는 페이지 div의 getBoundingClientRect, scale은 "화면상 페이지 폭 /
// viewport.width" — 확대 미리보기 transform이 걸려 있는 동안에도 어긋나지
// 않도록 배율을 상수로 두지 않고 매번 실측해서 나눈다.
export function toPdfRect(rect, pageRect, viewport, scale) {
  const toPdf = (clientX, clientY) =>
    viewport.convertToPdfPoint((clientX - pageRect.left) / scale, (clientY - pageRect.top) / scale);
  const [x1, y1] = toPdf(rect.left, rect.top);
  const [x2, y2] = toPdf(rect.right, rect.bottom);
  return [
    round3(Math.min(x1, x2)),
    round3(Math.min(y1, y2)),
    round3(Math.max(x1, x2)),
    round3(Math.max(y1, y2)),
  ];
}

// 반대 방향 — 저장된 PDF 좌표 사각형을 페이지 div 안에서 쓸 CSS 박스로.
// 여기 쓰는 scale은 "레이아웃상" 배율이어야 한다 (확대 미리보기 transform은
// 페이지 div 자체에 이미 걸려 있어서, 박스까지 그 배율을 곱하면 두 번 곱해진다).
export function toPageBox(pdfRect, viewport, scale) {
  const [ax, ay] = viewport.convertToViewportPoint(pdfRect[0], pdfRect[1]);
  const [bx, by] = viewport.convertToViewportPoint(pdfRect[2], pdfRect[3]);
  return {
    left: Math.min(ax, bx) * scale,
    top: Math.min(ay, by) * scale,
    width: Math.abs(bx - ax) * scale,
    height: Math.abs(by - ay) * scale,
  };
}
