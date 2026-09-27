# 아키텍처

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
