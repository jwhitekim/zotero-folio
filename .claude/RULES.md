# RULES.md

이 파일은 Claude Code가 이 프로젝트에서 작업할 때 참고하는 컨텍스트입니다.
(2026-09-22: 원래 파일명은 `CLAUDE.md`였고 그 이름이 Claude Code의 자동
로드 관례라, 루트의 `AGENTS.md`(todo-guard 운영 규칙)와 이름이 겹쳐
혼란을 주지 않도록 `RULES.md`로 바꿨다. 자동 로드가 이 이름에서도
그대로 되는지는 다음 세션에서 직접 확인 필요 — 안 되면 세션 시작마다
이 파일을 수동으로 읽게 안내하거나 이름을 되돌려야 한다.)

## 프로젝트 정체성

Folio(구 프로젝트명: Zotero Insight)는 **Zotero를 대체하는 게 아니라
보강하는 도구**입니다.
"AI가 대신 요약해주는" 방향은 폐기했다 — 요약은 머리에 남지 않는다.
지금은 **개인 논문 아카이브 + 메모 도구**다: Zotero 위에서 논문을
둘러보고, 직접 메모를 쓰는 공간.

- 저장, 메타데이터 추출, PDF 파일 관리, 다기기 동기화는 Zotero가 이미
  잘하고 있으므로 재구현하지 않는다. 단, 이건 "웬만하면 만들지 말자"는
  기본값이지 절대 규칙은 아니다 — Zotero UI로 하기엔 불편하거나 Folio
  워크플로에 자연스럽게 필요한 경우(예: 웹페이지를 논문처럼 추가) 새
  아이템 생성 정도는 만든다. 애매하면 먼저 물어본다.
- 이 프로젝트가 하는 일은 네 가지다: (1) 논문 목록/제목 검색,
  (2) 논문별 메모 (child note) / 독립 메모 (standalone note) 읽고 쓰기,
  (3) 컬렉션 기준 탐색, (4) 웹페이지 URL을 새 논문 아이템으로 추가
  (Zotero `webpage` 아이템 생성, 제목은 페이지 `<title>`에서 가져옴).
  그 이상으로 기능을 넓히지 않는다.
- Zotero 아이템의 title/author/PDF 등 **기존 아이템의 원본 서지정보
  필드**는 절대 수정하거나 덮어쓰지 않는다 — 이건 (4)와 별개로 여전히
  절대 규칙이다: 새 아이템을 만드는 것과 기존 아이템을 고치는 것은
  다르다. Folio가 만든 아이템도 생성 이후엔 안 건드리고 Zotero(또는
  Connector)가 관리하게 둔다. 단, 이 도구가 직접 만든 메모 note(태그로
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
  ├─ zotero.js    — Zotero API 클라이언트 (읽기/쓰기 래퍼). 모듈 전역
  │                 토큰 없음 — 요청마다 세션의 유저 토큰을 사용(멀티유저)
  ├─ supabase.js  — Supabase(Postgres) service_role 클라이언트
  ├─ context.js   — AsyncLocalStorage 기반 요청별 유저 컨텍스트
  ├─ db.js        — Supabase 테이블 래퍼: folio_papers(메타데이터 캐시,
  │                 목록/검색/컬렉션 필터용), folio_sync_state(유저별
  │                 lastVersion + Zotero OAuth 토큰), folio_users(유저 계정,
  │                 zotero_user_id가 유니크 키). 전부 user_id로 스코프됨.
  │                 메모 원문은 어디에도 캐시하지 않음 — 항상 Zotero에서
  │                 라이브로 읽음. 테이블은 `folio_` 접두사 — 이 Supabase
  │                 프로젝트를 다른 앱과 공유하므로 이름 충돌 방지용
  │                 (`server/supabase/schema.sql`에 DDL, 대시보드 SQL
  │                 Editor에서 수동 실행 필요 — 서버가 자동 생성 안 함)
  └─ server.js    — Express 라우트 + express-session(쿠키 기반 로그인
                    세션) + web/dist 정적 서빙
      ▲
      │ fetch('/api/...')
[web/] — Svelte + Vite (탭: Papers / 나만의 메모 / 컬렉션 + 검색 아이콘)
  빌드 결과(web/dist)를 server.js가 그대로 정적 서빙 — 서버 하나로 통합
```

기존 로컬 SQLite(`data/zotero-insight.db`)에 있던 1인용 캐시는
`server/scripts/migrate-to-supabase.mjs`로 Supabase 계정에 이관한다
(`npm run migrate:supabase`, `--dry-run` 지원).

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

## 작업 디렉터리

**셸 작업 디렉터리는 항상 프로젝트 루트(`zotero-folio/`)로 유지한다.**
`.claude/hooks/*.sh`(Stop/SessionStart 훅)가 상대경로로 실행되기 때문에,
`cd web && ...`처럼 작업 디렉터리를 바꾼 채로 두면 다음 훅 실행 시
`.claude/hooks/check-todo.sh` 같은 경로를 `web/.claude/hooks/...`에서
찾아 "No such file or directory"로 실패한다(실제로 겪은 사고).
`web/` 안에서 명령이 필요하면 `cd web && <명령>` 대신 서브셸
`(cd web && <명령>)`을 쓰거나, 명령 종료 후 바로 루트로 돌아온다.
PDF 뷰어 등을 빌드 확인할 때는 아래 "빌드"의 루트 스크립트를 쓴다.

## 빌드

프론트엔드(`web/`) 빌드는 루트에서 `cd` 없이 실행한다:

```bash
npm run build       # web/dist만 재생성 (평소 확인용, 빠름)
npm run build:web   # web 의존성 설치 + 빌드 (npm install 필요할 때)
```

## 코딩 컨벤션

- 이전 프로젝트(my-dictionary)와 동일한 스타일 유지: ESM(`import`),
  Express, `better-sqlite3`.
- 외부 API 호출(Zotero)은 항상 try/catch로 감싸고, 실패해도 서버가
  죽지 않게 한다.
- 코드 주석, README/사용자 대상 문구는 한국어로 작성한다. 변수명/함수명은
  영어로 작성한다. **커밋 메시지는 영어로 작성한다** (2026-09-06부터 —
  그 이전 커밋들도 히스토리 재작성으로 전부 영어로 번역함).
- 새 기능을 추가하기 전에 "이게 Zotero가 이미 하는 일은 아닌지"부터
  확인한다. 애매하면 만들지 않고 사용자에게 먼저 물어본다.
- **원문 뷰어를 새로 추가할 때는 기존 뷰어와 같은 구조를 따른다.**
  `PdfViewer.svelte`/`HtmlViewer.svelte`가 기준 패턴이다: (1) 뷰어 하나당
  컴포넌트 하나, 자기 마크업과 스타일(`<style>`)은 자기가 소유한다 —
  전역 `app.css`에 그 뷰어만 쓰는 클래스를 흩어놓지 않는다. (2) 확대/축소
  상태(`zoom`)와 스텝 계산(`zoomStep`)은 부모(`PdfPane.svelte`)가 단일
  소스로 갖고 각 뷰어에 prop으로 내려준다 — 뷰어마다 확대 로직을 따로
  구현하지 않는다. (3) prop 인터페이스도 맞춘다(`src`, `zoom` 등). 새
  뷰어 타입(예: 이미지, 마크다운 등)을 추가하게 되면 이 패턴을 그대로
  따르고, 벗어나야 하면 왜 벗어나는지 먼저 설명한다.

## 하지 말아야 할 것

- Zotero 아이템의 title/author/PDF 등 원본 서지정보 필드를 수정하는 코드
- Zotero 라이브러리 전체를 매번 새로 가져오는 로직 (버전 기반 증분
  동기화를 반드시 사용)
- AI 요약/태그 생성 — 이 방향은 폐기됨, 되살리지 않는다
- 메모 원문을 로컬 DB에 캐시하는 코드 — Zotero가 항상 최신 기준
- 브라우저 확장은 만들지 않는다 (URL 저장은 Papers 목록의 "웹페이지
  추가"로 충분). 웹 UI(web/)는 Papers(+ 웹페이지 추가)/나만의 메모/
  컬렉션 + 검색 아이콘 이상으로 기능을 넓히지 않는다.

## 하네스: 기능 개발 워크플로

**목표:** 여러 파일에 걸치거나 실제 동작 확인이 필요한 기능 추가/버그 수정을,
구현(folio-builder)과 실행 기반 독립 검증(folio-verifier)을 분리해서 처리한다.

**트리거:** 기능 추가·버그 수정 요청(및 그 재수정/재검증 요청) 시 `folio-feature-team`
스킬을 사용하라. 오탈자 수정처럼 결과를 눈으로 바로 판단 가능한 사소한 변경은
직접 처리한다.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-08-28 | 초기 구성 (folio-builder, folio-verifier, folio-run-verify, folio-feature-team) | 전체 | 사용자 요청 — 기능 개발 워크플로 자동화 |

## 문서 체계

문서 배치는 `docs/docs-rules.md`를 따른다 — `docs/`는 SDD(contract/
proposal/design/tasks/specs) 구조이고, SDD 도입 전 조사·결정 기록은
`docs/notes/`에 있다.
