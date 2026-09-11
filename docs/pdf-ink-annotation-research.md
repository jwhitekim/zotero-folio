# Zotero ink(필기) annotation 형식 조사

태블릿 환경에서 펜으로 PDF에 직접 필기하는 기능을 검토하며 조사한
Zotero ink annotation 데이터 형식 기록.

## 배경

태블릿 UX 개선 논의 중 "펜으로 글을 쓰거나 형광펜을 칠할 수 있는 UX"
필요성이 제기됨. 형광펜(하이라이트)은 이미 구현 완료(`annotationType:
'highlight'`, `docs/pdf-highlight-popup.md` 참고). 자유 필기는 Zotero의
별도 annotation 타입인 ink를 활용하는 방향이 유력.

## 확인 방법

Zotero 공식 API 문서에는 ink annotation의 정확한 데이터 구조가
공개돼 있지 않음. 대신 Zotero의 PDF 뷰어 엔진 소스코드 저장소
([zotero/reader](https://github.com/zotero/reader), `src/common/types.ts`)를
직접 확인.

## 확인된 내용

```typescript
type AnnotationType =
  'highlight' | 'underline' | 'note' | 'image' | 'text' | 'ink' | 'eraser';

type PDFPosition = {
  pageIndex: number;
  rects?: number[][];        // 하이라이트가 사용
  paths?: number[][];        // ink가 사용
  nextPageRects?: number[][];
};

interface Annotation {
  id: string;
  type: AnnotationType;
  color?: string;
  sortIndex: string;
  pageLabel?: string;
  position: Position;        // PDF의 경우 PDFPosition
  text?: string;
  comment?: string;
  tags: string[];
  dateCreated: string;
  dateModified: string;
  readOnly?: boolean;
  authorName: string;
  isAuthorNameAuthoritative: boolean;
}
```

- `'ink'`가 `AnnotationType`에 공식으로 포함(지원 확인).
- 선 좌표는 하이라이트의 `rects`와 같은 위치의 필드인
  `paths: number[][]`에 저장 — 구조 대칭성 확인.

## 미확인 사항 — 선 굵기(획 두께)

`types.ts` 전체를 훑어도 `width`/`strokeWidth`류 필드를 찾지 못함.
가능성 3가지:
1. `paths`의 숫자 배열 안에 좌표와 함께 인코딩(예: [x, y, 압력] 반복).
2. 다른 소스 파일(예: 렌더러 쪽 구현체)에 별도 필드로 존재.
3. annotation 단위가 아니라 도구(ink 펜) 설정값이라 개별 annotation
   데이터엔 아예 없을 가능성.

## 다음 확인 단계

1. Zotero 데스크톱 앱에서 실제 ink annotation 하나를 직접 그려서
   생성.
2. Zotero Web API(`GET /users/<id>/items/<key>`)로 생성된 해당
   아이템의 원본 JSON을 조회해 `data.annotationPosition` 실측값 확인
   — `paths` 배열의 실제 숫자 개수/순서, 굵기 관련 필드 유무를 직접
   대조.
3. 여러 굵기로 그은 샘플을 비교해 굵기 인코딩 위치 특정.

## 리스크 요약

- 공식 문서가 없어 소스코드 기반 역추적에 의존 — 관찰 범위 밖의
  예외 케이스(회전 페이지, 압력 감지 펜 등)를 놓칠 가능성 존재.
- Folio에서 생성한 ink annotation이 Zotero 데스크톱/모바일 앱에서
  정상 렌더링되는지는 브라우저 테스트로 확인 불가 — 매번 실제 Zotero
  앱으로 대조 필요, 검증 주기가 하이라이트 기능보다 느림.
- Zotero가 내부 형식을 문서화 없이 바꾸면 조용히 깨질 가능성 존재.

## 관련 문서

- [pdf-highlight-popup.md](pdf-highlight-popup.md) — 먼저 구현된 하이라이트
  기능(같은 annotation 패턴의 선례).
- [tablet-touch-ux-ideas.md](tablet-touch-ux-ideas.md) — ink 기능이 나온
  배경 논의 전체.
