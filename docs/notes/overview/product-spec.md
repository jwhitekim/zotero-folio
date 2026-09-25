# Folio 제품 스펙

Zotero 라이브러리 위에 개인 논문 아카이브와 메모 기능을 얹는 개인용 도구.
Zotero를 대체하지 않고 보강하는 방향으로 설계.

## 1. 제품 정체성

- 저장, 메타데이터 추출, PDF(Portable Document Format) 파일 관리, 다기기
  동기화는 Zotero가 담당 — 재구현하지 않음.
- AI 요약/자동 태그 생성 기능 없음. 메모는 전적으로 사용자가 직접 작성.
- 의미 기반 검색(임베딩)은 범위 밖 — 현재는 제목 검색만 지원.
- Zotero 아이템의 title/author/PDF 등 원본 서지정보 필드는 절대 수정
  대상이 아님. Folio가 직접 만든 메모 note(태그로 식별)만 생성/수정.

## 2. 핵심 기능

### 2-1. 논문 목록/검색

- Zotero 라이브러리 최상위 아이템을 목록으로 표시(표지 그리드/리스트 보기
  전환).
- 정렬: 최근순, 년도순, 이름순.
- 제목 기준 검색.
- PDF 첨부 유무, 웹페이지 스냅샷(HTML) 유무를 카드에 표시.

### 2-2. 메모 읽고 쓰기

- 논문별 메모(child note)와 독립 메모(standalone note) 2종.
- 마크다운 전용 에디터 — 편집/미리보기 토글, `.md` 파일 업로드/다운로드
  지원.
- 자동 저장(900ms 디바운스), sessionStorage 임시 저장(draft).
- 저장 시 서버가 마크다운을 HTML(HyperText Markup Language)로 변환해
  Zotero note 형식으로 저장 — 이미 같은 태그의 note가 있으면 수정, 없으면
  신규 생성(중복 생성 방지).
- 메모 원문은 로컬 데이터베이스(database)에 캐시하지 않음 — 매 요청마다
  Zotero API에서 라이브로 읽음.

### 2-3. 컬렉션 탐색

- Zotero 컬렉션 목록과 컬렉션별 논문 필터링.

### 2-4. 웹페이지를 논문 아이템으로 추가

- URL을 입력하면 Zotero `webpage` 타입 아이템을 새로 생성.
- 제목은 대상 페이지의 `<title>`에서 추출.
- 신규 아이템 생성만 담당 — 생성 이후에는 손대지 않고 Zotero(또는
  Connector)에 관리를 맡김.

### 2-5. PDF 원문 보기

- pdf.js 기반 뷰어 — 확대/축소(커서 위치 앵커링), 참고문헌/각주 링크
  내부 점프, 점프 후 원위치 복귀(Alt+Left / Option+Left).
- 텍스트 선택, 검색.
- Windows fractional 디스플레이 배율(125%, 150%) 환경의 텍스트 선택
  가로 정렬 오차를 자체 재교정.

### 2-6. PDF 형광펜 하이라이트

- 드래그 선택 후 색상 팔레트에서 색을 골라 하이라이트 생성.
- `Alt`(맥 `Option`)를 누른 채 드래그하면 마지막 사용 색으로 즉시 적용.
- 저장소는 Zotero — 하이라이트는 Zotero 표준 annotation 아이템
  (`annotationType: highlight`)으로 저장, Zotero 클라이언트와 상호
  동기화.
- 기존 하이라이트를 다시 선택하면 삭제 확인 팝업 표시.
- 낙관적(optimistic) 업데이트 — 서버 응답 전에 화면에 즉시 반영, 실패
  시 롤백.

### 2-7. 웹페이지 스냅샷 보기

- 브라우저 커넥터가 저장한 HTML 스냅샷을 iframe으로 렌더링.
- PDF 뷰어와 동일한 확대/축소 상태 공유.

## 3. 아키텍처

```
[Zotero Web API]
      |
      | 읽기: 변경된 아이템/컬렉션 조회, PDF 다운로드, note/annotation 조회
      | 쓰기: 메모 note 생성/수정, 하이라이트 annotation 생성/삭제,
      |       웹페이지 아이템 생성 (원본 서지정보 필드는 미변경)
      v
[server/] Node.js + Express
  zotero.js  Zotero API(Application Programming Interface) 클라이언트
  db.js      SQLite 캐시(papers, sync_state) — 목록/검색/컬렉션 필터 전용
  server.js  Express 라우트 + web/dist 정적 서빙
      ^
      | fetch('/api/...')
[web/] Svelte + Vite
  탭 구성: Papers / 나만의 메모 / 컬렉션 + 검색
  빌드 결과(web/dist)를 server.js가 정적 서빙 — 서버 하나로 통합 배포
```

## 4. 데이터 모델

### 4-1. `papers` 테이블(SQLite, 로컬 캐시)

| 컬럼 | 설명 |
| --- | --- |
| `item_key` | Zotero 아이템 키(기본 키) |
| `item_version` | 증분 동기화 기준 버전 |
| `title` / `authors` / `year` | 서지정보 표시용(읽기 전용 캐시) |
| `attachment_key` / `attachment_type` | PDF/HTML 첨부 식별(`pdf`/`html`/`null`) |
| `collections` | 소속 컬렉션 키 목록(JSON(JavaScript Object Notation) 배열) |
| `synced_at` | 마지막 캐시 갱신 시각 |

메모 원문, 하이라이트 좌표 등은 papers 테이블에 저장하지 않음 — Zotero가
항상 최신 기준.

### 4-2. `sync_state` 테이블

마지막으로 동기화한 Zotero 라이브러리 버전 저장 — 다음 동기화 시
`?since=<lastVersion>`으로 변경분만 조회.

### 4-3. Zotero note 태그(메모 식별 방식)

| 태그 | 용도 |
| --- | --- |
| `zotero-insight:memo` | 논문별 메모(child note) |
| `zotero-insight:standalone-memo` | 독립 메모(standalone note) |

태그 접두사가 프로젝트 초기 이름(zotero-insight)을 유지하는 이유:
기존 라이브러리에 이미 해당 태그로 저장된 메모가 존재하기 때문 — 표시
이름이 Folio로 바뀌어도 태그 문자열 변경 시 기존 메모를 찾지 못함.

## 5. API(Application Programming Interface) 명세

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/oauth/login` | Zotero 계정 연결 시작 |
| GET | `/oauth/callback` | Zotero 계정 연결 콜백 |
| GET | `/api/auth/status` | 로그인 상태 확인 |
| POST | `/api/auth/logout` | 로그아웃 |
| POST | `/api/sync` | Zotero 라이브러리 증분 동기화 |
| GET | `/api/papers` | 논문 목록 조회(검색/정렬 지원) |
| GET | `/api/papers/:key` | 논문 상세(서지정보 + 메모) 조회 |
| POST | `/api/papers/webpage` | URL 기반 웹페이지 아이템 생성 |
| DELETE | `/api/papers/:key` | 논문 아이템 삭제 |
| PUT | `/api/papers/:key/memo` | 메모 저장(마크다운 본문 전달) |
| GET | `/api/papers/:key/pdf` | PDF 원문 스트리밍 |
| GET | `/api/papers/:key/html` | HTML 스냅샷 스트리밍 |
| GET | `/api/papers/:key/highlights` | 하이라이트 목록 조회 |
| POST | `/api/papers/:key/highlights` | 하이라이트 생성 |
| DELETE | `/api/papers/:key/highlights/:annotationKey` | 하이라이트 삭제 |
| GET | `/api/collections` | 컬렉션 목록 조회 |
| GET | `/api/collections/:key/papers` | 컬렉션별 논문 조회 |

## 6. 화면 구성

| 페이지 | 파일 | 역할 |
| --- | --- | --- |
| 로그인 | `LoginPage.svelte` | Zotero 계정 연결 |
| 홈 | `HomeDashboard.svelte` | 서재 요약, 최근 자료 |
| 논문 목록 | `PapersList.svelte` | 표지 그리드/리스트, 정렬 |
| 논문 검색 | `SearchPapers.svelte` | 제목 검색 |
| 논문 상세 | `PaperDetailSplit.svelte` | 원문 패널 + 메모 패널 분할 뷰 |
| 컬렉션 | `Collections.svelte` | 컬렉션 목록/필터 |

원문 패널은 첨부 유형에 따라 `PdfViewer.svelte` 또는 `HtmlViewer.svelte`를
`PdfPane.svelte`가 공통 확대/축소 상태로 감싸 렌더링. 메모 패널은
`MarkdownNote.svelte`가 전담.

## 7. 환경 변수(`.env`)

| 변수 | 설명 |
| --- | --- |
| `ZOTERO_API_KEY` | Zotero 개인 액세스 토큰 |
| `ZOTERO_USER_ID` | Zotero 계정 식별자 |
| `PORT` | 서버 리스닝 포트(기본값 3002) |

## 8. 범위 밖(하지 않는 것)

- Zotero 아이템의 title/author/PDF 등 원본 서지정보 필드 수정.
- Zotero 라이브러리 전체를 매번 새로 가져오는 동기화(버전 기반 증분
  동기화만 사용).
- AI 요약/자동 태그 생성.
- 메모 원문의 로컬 캐시.
- 브라우저 확장 프로그램(URL 저장은 "웹페이지 추가" 기능으로 대체).
- Papers / 나만의 메모 / 컬렉션 / 검색 이상으로의 기능 확장(추가 전
  "Zotero가 이미 하는 일인지" 우선 확인).

## 9. 코딩 컨벤션 요약

- ESM(ECMAScript Modules) 방식(`import`), Express, `better-sqlite3` —
  이전 프로젝트 스타일 유지.
- 외부 API 호출은 try/catch로 감싸 실패해도 서버가 죽지 않도록 처리.
- 코드 주석과 README, 사용자 대상 문구는 한국어. 변수/함수명은 영어.
- 커밋 메시지는 영어(2026-09-06부터 적용).
- 새 원문 뷰어 추가 시 `PdfViewer.svelte`/`HtmlViewer.svelte` 패턴
  (뷰어 하나당 컴포넌트 하나, `zoom`/`zoomStep`은 부모 컴포넌트가 단일
  소스로 보유) 준수.
