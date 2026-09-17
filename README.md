# Folio

> Zotero용 개인 논문 읽기·메모 공간 (포트폴리오와 무관)

Folio는 Zotero 라이브러리는 그대로 두고, 위에 "직접 읽고 정리하는 공간"만
얹는 개인용 도구. 저장/메타데이터/PDF(Portable Document Format) 동기화는
전부 Zotero가 하던 대로 두고, Folio가 하는 일:

1. 논문 목록을 북마크 매니저처럼 표시(제목 검색 지원)
2. 논문마다 자유로운 메모 작성(Zotero child note로 저장)
3. Zotero 컬렉션 기준 논문 탐색

AI 대신 요약 생성 없음 — 요약은 기억에 남지 않는다는 판단, 직접 쓰는 메모
전용 공간.

## 왜 이렇게 만들었나

- Zotero 담당: 저장, 메타데이터 추출, PDF 관리, 다기기 동기화 — 이미
  잘 되어 있는 영역
- Folio 담당: Zotero가 안 해주는 것만 보강 — 목록 탐색 + 직접 쓰는 메모
- Zotero를 대체하지 않고 옆에서 보강하는 구조라, Zotero가 업데이트되거나
  다른 기기에서 접속해도 영향 없음. 메모도 전부 Zotero note로 저장되므로
  Folio 없이도 Zotero 앱에서 그대로 확인 가능.

## 준비물

- Zotero OAuth 앱: https://www.zotero.org/oauth/apps 에서 등록 후
  Client Key / Client Secret 발급(콜백 URL은 로컬 실행 시
  `http://localhost:3002/oauth/callback`). Client Key/Secret은 "Folio라는
  앱을 Zotero에 등록"하는 앱 등록 키 — 서버 하나에 1세트만 필요, 사용자
  개개인이 발급받는 Zotero API(Application Programming Interface) 키와는
  별개 개념. 로그인한 사용자별 개인 토큰은 앱 등록 키를 이용해 "Zotero로
  로그인"을 누를 때마다 따로 발급되어 Supabase에 저장.
- Supabase 프로젝트: 논문 메타데이터 캐시와 계정 정보 저장용.
  Project Settings, API 메뉴에서 Project URL과 `service_role` 키 복사.

## 설치 및 실행

```bash
npm install
cp .env.example .env
# .env에 ZOTERO_CLIENT_KEY, ZOTERO_CLIENT_SECRET,
#          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET 입력
```

**DB(Database) 스키마 선행 필수.** `server/supabase/schema.sql` 내용을
Supabase 대시보드, SQL(Structured Query Language) Editor에 붙여넣고 실행
(`users` / `papers` / `sync_state` 테이블 생성). 서버는 런타임에 테이블을
자동 생성하지 않으므로, 스키마 생성 단계 누락 시 로그인 직후 500 오류.

```bash
npm run build:web   # web/ 의존성 설치 + Svelte 앱 빌드 (최초 1회, 또는 web/ 수정 후)
npm start           # http://localhost:3002 에서 API + 웹 UI 함께 서빙
```

처음 접속 시 로그인 화면 표시 — "Zotero로 로그인" 클릭 시 Zotero
사이트에서 인가 후 자동 복귀. 인가 완료 시점에 Zotero 계정(`zotero_user_id`)마다
`users` 행 하나씩 생성, 브라우저에는 세션 쿠키(`folio.sid`) 발급.
논문 캐시·동기화 버전·Zotero 토큰 전부 해당 계정에 귀속 — 여러 사람이
같은 서버에 각자 로그인해도 서로의 라이브러리는 비공개.

> 세션은 서버 메모리에 보관 — 서버 재시작 시 로그아웃 상태로 전환,
> 재로그인 필요("Zotero로 로그인" 재클릭). Zotero 토큰과 논문 캐시는
> Supabase에 남아 있어 재동기화 없이 라이브러리 즉시 복원.

### 기존 로컬 SQLite(SQL의 경량 파일 기반 구현체) 캐시 이관(1회성)

예전 버전 사용 중 `data/zotero-insight.db` 존재 시, 해당 캐시를 폐기하지
않고 현재 계정으로 이관 가능. **`schema.sql` 실행을 반드시 선행한 뒤**
프로젝트 루트에서 실행:

```bash
npm run migrate:supabase             # 이관 대상 사전 확인은 -- --dry-run
```

논문 메타데이터, 마지막 동기화 버전, Zotero 토큰을 로컬 DB에 기록된
`zotero_user_id` 계정으로 이관. 반복 실행해도 안전(전부 upsert 방식).
Node 22.5 이상 필요(내장 `node:sqlite` 모듈 사용).

웹 UI 수정 개발 시 `cd web && npm run dev`로 Vite 개발 서버(핫 리로드)를
별도 실행 — `/api` 요청은 3002번 포트로 자동 프록시.

### Docker로 실행

```bash
cp .env.example .env   # 키 입력
docker compose up --build
```

`web/` 빌드(Vite)와 서버 의존성 설치는 이미지 내부에서 자동 처리.
캐시는 Supabase 보관이라 컨테이너에 영속 볼륨 불필요.

localhost 이외 주소로 접속 시 `.env`의 `APP_BASE_URL`을 실제 접속
주소로 설정, Zotero OAuth 앱 콜백 URL도 `<해당 주소>/oauth/callback`으로
등록 필요(미등록 시 로그인 비정상 동작).

## 기능

- **홈 탭** — 전체 논문 수 / PDF 보관 수 통계, 최근 논문 5편, 즉시
  Zotero 동기화 실행 가능
- **Papers 탭** — 캐시된 논문 목록 전체, 목록에서 바로 논문 삭제 가능
- **논문 상세** — 메타데이터(제목/저자/연도/PDF 링크) + 해당 논문
  귀속 메모(Zotero child note), pdf.js 공식 PDFViewer 엔진 기반 내장
  PDF 뷰어
- **메모 에디터** — 텍스트/단어장(단어-뜻) 2종 섹션 자유 구성, 입력
  즉시 자동 저장(900ms debounce). 다른 논문 이동 후 복귀해도 저장 전
  편집 내용은 세션 임시 초안(sessionStorage)으로 유지
- **컬렉션 탭** — Zotero 컬렉션 목록과 소속 논문 탐색
- **검색 아이콘** — 어디서든 논문 제목 검색으로 즉시 진입
- `POST /api/sync` — Zotero에서 논문 메타데이터만 캐시(AI 처리 없음)

논문에 안 묶인 독립 메모(standalone note) 탭은 초기 구상에는 포함,
AI 기능 제거 과정에서 함께 제외. 현재는 논문 귀속 메모(child note)만
지원.

## 다음에 추가하면 좋은 것

- 의미 기반 검색(임베딩) — 현재는 제목 검색만 지원, 추후
  `GET /api/search?q=`로 확장 가능한 구조로 개방
- 주기적 자동 동기화(cron)
- 읽음/읽는 중/읽을 예정 같은 상태 관리
