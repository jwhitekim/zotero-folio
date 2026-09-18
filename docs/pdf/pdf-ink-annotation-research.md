# Zotero ink(필기) annotation 형식 조사

태블릿 환경에서 펜으로 PDF에 직접 필기하는 기능을 검토하며 조사한
Zotero ink annotation 데이터 형식 기록. 실측으로 확정 완료.

## 배경

태블릿 UX 개선 논의 중 "펜으로 글을 쓰거나 형광펜을 칠할 수 있는 UX"
필요성이 제기됨. 형광펜(하이라이트)은 이미 구현 완료(`annotationType:
'highlight'`, `docs/pdf/pdf-highlight-popup.md` 참고). 자유 필기는 Zotero의
별도 annotation 타입인 ink를 활용하는 방향.

## 확인 방법

1차로 Zotero 공식 소스코드 저장소([zotero/reader](https://github.com/zotero/reader),
`src/common/types.ts`)에서 타입 정의를 확인해 `paths` 필드 존재와
`annotationType`에 `'ink'`가 포함됨을 확인. 다만 선 굵기 필드는 그
타입 정의만으로는 확인 실패(`docs/pdf/pdf-highlight-popup-safari-callout.md`
작성 시점 기준 미확인 상태로 남아 있었음).

2차로 실측 확인: Zotero 데스크톱에서 실제 PDF에 ink 선 하나를 그은 뒤,
Zotero Web API(`GET /users/<id>/items?itemType=annotation`)로 해당
아이템의 원본 JSON을 직접 조회.

## 확정된 데이터 구조 (실측)

```json
{
  "key": "DMFJNWQH",
  "itemType": "annotation",
  "annotationType": "ink",
  "annotationComment": "",
  "annotationColor": "#2ea8e5",
  "annotationPageLabel": "1",
  "annotationSortIndex": "00000|000000|00000",
  "annotationPosition": "{\"pageIndex\":0,\"width\":2,\"paths\":[[251.813,733.35,253.127,733.669, ...]]}",
  "tags": [],
  "relations": {}
}
```

`annotationPosition`(문자열로 이중 인코딩된 JSON) 내부 구조:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `pageIndex` | number | 페이지 번호(0부터 시작) — 하이라이트와 동일 |
| `width` | number | **선 굵기.** `paths`와 같은 레벨의 독립 필드(이전까지 미확인이던 값). 이 샘플에서 2 |
| `paths` | number[][] | 선(스트로크) 목록. 안쪽 배열 하나가 스트로크 1개, `[x1, y1, x2, y2, x3, y3, ...]` 형태로 x/y 좌표가 번갈아 나열된 평탄화 배열 |

`annotationColor`/`annotationComment`/`annotationPageLabel`/
`annotationSortIndex`/`tags`/`relations` 등 나머지 최상위 필드는
하이라이트 annotation과 완전히 동일한 구조 — Folio의 기존 하이라이트
생성 코드(`server/zotero.js`, `web/src/utils/pdf-highlight.js`)를
그대로 확장할 수 있음.

## 구현 시 참고할 점

- 좌표 단위는 하이라이트의 `rects`와 같은 PDF 좌표계(포인트, 페이지
  왼쪽 아래가 원점)로 추정 — 하이라이트 좌표 변환 로직을 그대로
  재사용 가능.
- `width`는 스트로크마다가 아니라 annotation 하나당 값 하나 — 굵기를
  바꾸려면 새 annotation(새 스트로크 그룹)을 만들어야 함.
- 실측 샘플은 스트로크 1개(`paths` 배열 길이 1) 확인 — 펜을 여러 번
  떼었다 붙였다 하며 그린 필기가 스트로크 여러 개로 나뉘어 `paths`
  배열에 누적되는지는 추가 샘플로 확인 필요.

## 관련 문서

- [pdf-highlight-popup.md](pdf-highlight-popup.md) — 먼저 구현된 하이라이트
  기능(같은 annotation 패턴의 선례).
- [tablet-touch-ux-ideas.md](tablet-touch-ux-ideas.md) — ink 기능이 나온
  배경 논의 전체.
