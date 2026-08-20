# CLAUDE.md

이 파일은 Claude Code가 이 프로젝트에서 작업할 때 참고하는 컨텍스트입니다.

## 프로젝트 정체성

Folio(구 프로젝트명: Zotero Insight)는 **Zotero를 대체하는 게 아니라
보강하는 도구**입니다.
"AI가 대신 요약해주는" 방향은 폐기했다 — 요약은 머리에 남지 않는다.
지금은 **개인 논문 아카이브 + 메모 도구**다: Zotero 위에서 논문을
둘러보고, 직접 메모를 쓰는 공간.

- 저장, 메타데이터 추출, PDF 파일 관리, 다기기 동기화는 Zotero가 이미
  잘하고 있으므로 절대 재구현하지 않는다.
- 이 프로젝트가 하는 일은 세 가지뿐이다: (1) 논문 목록/제목 검색,
  (2) 논문별 메모 (child note) / 독립 메모 (standalone note) 읽고 쓰기,
  (3) 컬렉션 기준 탐색. 그 이상으로 기능을 넓히지 않는다.
- Zotero 아이템의 title/author/PDF 등 **원본 서지정보 필드**는 절대
  수정하거나 덮어쓰지 않는다. 단, 이 도구가 직접 만든 메모 note(태그로
  식별)는 생성/수정 둘 다 한다 — 저장할 때마다 새 note가 쌓이면 안 되므로.
- AI 생성 요약/태그는 없다. 메모는 전적으로 사용자가 직접 쓴다.
- 의미 기반 검색(임베딩)은 나중 단계로 보류 — 지금은 제목 검색만.

## 아키텍처

```
[Zotero Web API]
      │ (읽기: 변경된 아이템/컬렉션 조회, PDF 다운로드, note 조회)
      │ (쓰기: 메모 note 생성/수정만 — 원본 서지정보는 절대 안 건드림)
      ▼
[server/] — Node.js + Express
  ├─ zotero.js — Zotero API 클라이언트 (읽기/쓰기 래퍼)
  ├─ db.js     — SQLite: papers 메타데이터 캐시(목록/검색/컬렉션 필터용).
  │              메모 원문은 캐시하지 않음 — 항상 Zotero에서 라이브로 읽음
  └─ server.js — Express 라우트 + web/dist 정적 서빙
      ▲
      │ fetch('/api/...')
[web/] — Svelte + Vite (탭: Papers / 나만의 메모 / 컬렉션 + 검색 아이콘)
  빌드 결과(web/dist)를 server.js가 그대로 정적 서빙 — 서버 하나로 통합
```

## 메모 note 식별 방식

Zotero note를 "이 도구가 관리하는 메모"로 구분하기 위해 태그를 쓴다:

- 논문별 메모(child note): 태그 `zotero-insight:memo`
- 독립 메모(standalone note): 태그 `zotero-insight:standalone-memo`

(태그 prefix가 `zotero-insight`인 건 프로젝트 초기 이름의 흔적이며 의도적으로
유지한다 — 이미 사용자 Zotero 라이브러리에 이 태그로 저장된 메모가 있으므로,
표시 이름이 Folio로 바뀌어도 태그 문자열은 바꾸지 않는다. 바꾸면 기존 메모를
못 찾게 된다.)

저장 시 항상 "해당 태그가 붙은 note가 이미 있는지" 먼저 확인 후,
있으면 `PATCH`(수정), 없으면 `POST`(생성)한다 — 절대 매번 새로 만들지
않는다. 메모 내용은 로컬 DB에 캐시하지 않고 매 요청마다 Zotero에서
읽는다 (source of truth는 항상 Zotero).

## 핵심 흐름 (sync)

1. Zotero API에서 `library version`을 이용해 마지막 동기화 이후 바뀐
   최상위 아이템만 가져온다 (`?since=<lastVersion>`).
2. 각 아이템의 제목/저자/연도/PDF 첨부 유무/소속 컬렉션을 로컬
   `papers` 테이블에 캐시한다 (AI 처리 없음, 순수 메타데이터 미러링).
3. 실패한 아이템은 로그만 남기고 건너뛴다 — 전체 sync가 하나의 실패로
   중단되면 안 된다.

## 환경 변수 (.env)

```
ZOTERO_API_KEY=
ZOTERO_USER_ID=
PORT=3002
```

## 코딩 컨벤션

- 이전 프로젝트(my-dictionary)와 동일한 스타일 유지: ESM(`import`),
  Express, `better-sqlite3`.
- 외부 API 호출(Zotero)은 항상 try/catch로 감싸고, 실패해도 서버가
  죽지 않게 한다.
- 코드 주석과 커밋 메시지, README/사용자 대상 문구는 한국어로 작성한다.
  변수명/함수명은 영어로 작성한다.
- 새 기능을 추가하기 전에 "이게 Zotero가 이미 하는 일은 아닌지"부터
  확인한다. 애매하면 만들지 않고 사용자에게 먼저 물어본다.

## 하지 말아야 할 것

- Zotero 아이템의 title/author/PDF 등 원본 서지정보 필드를 수정하는 코드
- Zotero 라이브러리 전체를 매번 새로 가져오는 로직 (버전 기반 증분
  동기화를 반드시 사용)
- AI 요약/태그 생성 — 이 방향은 폐기됨, 되살리지 않는다
- 메모 원문을 로컬 DB에 캐시하는 코드 — Zotero가 항상 최신 기준
- 브라우저 확장은 만들지 않는다. 웹 UI(web/)는 Papers/나만의 메모/
  컬렉션 + 검색 아이콘 이상으로 기능을 넓히지 않는다.
