# Folio

Folio는 Zotero 라이브러리는 그대로 두고, 그 위에 "직접 읽고 정리하는 공간"만
얹는 개인용 도구입니다. 저장/메타데이터/PDF 동기화는 전부 Zotero가
하던 대로 하고, 이 도구는:

1. 논문 목록을 북마크 매니저처럼 보여주고 (제목 검색 지원)
2. 논문마다 자유롭게 메모를 쓸 수 있게 하고 (Zotero child note로 저장)
3. Zotero 컬렉션 기준으로 논문을 탐색할 수 있게 합니다

AI가 대신 요약해주지 않습니다 — 요약은 머리에 남지 않는다는 판단으로,
이 도구는 순전히 "직접 쓰는 메모" 공간입니다.

## 왜 이렇게 만들었나

- Zotero: 저장, 메타데이터 추출, PDF 관리, 다기기 동기화 — 이미 잘 되어 있는 부분
- 이 도구: Zotero가 안 해주는 것만 보강 — 목록 탐색 + 직접 쓰는 메모
- Zotero를 대체하지 않고 옆에서 보강하는 구조라, Zotero가 업데이트되거나
  다른 기기에서 접속해도 안 깨집니다. 메모도 전부 Zotero note로 저장되므로
  이 도구 없이도 Zotero 앱에서 그대로 보입니다.

## 준비물

- Zotero OAuth 앱: https://www.zotero.org/oauth/apps 에서 등록 후
  Client Key / Client Secret 발급 (콜백 URL은 로컬 실행 시
  `http://localhost:3002/oauth/callback`)

## 설치 및 실행

```bash
npm install
cp .env.example .env
# .env에 ZOTERO_CLIENT_KEY, ZOTERO_CLIENT_SECRET 입력
npm run build:web   # web/ 의존성 설치 + Svelte 앱 빌드 (최초 1회, 또는 web/ 수정 후)
npm start           # http://localhost:3002 에서 API + 웹 UI 함께 서빙
```

처음 접속하면 로그인 화면이 뜬다 — "Zotero로 로그인"을 누르면 Zotero
사이트에서 인가한 뒤 자동으로 돌아온다. 이후로는 서버가 발급받은 토큰을
`data/`에 저장해두고 재사용하므로 다시 로그인할 필요 없다.

웹 UI를 수정하며 개발할 때는 `cd web && npm run dev`로 Vite 개발 서버(핫
리로드)를 따로 띄우면 됩니다 — `/api` 요청은 자동으로 3002번 포트로
프록시됩니다.

### Docker로 실행

```bash
cp .env.example .env   # 키 채워넣기
docker compose up --build
```

`web/` 빌드(Vite)와 서버 의존성 설치가 이미지 안에서 처리됩니다.
SQLite 캐시는 `./data`에 볼륨으로 영속화됩니다.

localhost가 아닌 주소로 접속한다면 `.env`의 `APP_BASE_URL`을 실제
접속 주소로 설정하고, Zotero OAuth 앱의 콜백 URL도 `<그 주소>/oauth/callback`으로
등록해야 로그인이 정상 동작합니다.

## 기능

- **홈 탭** — 전체 논문 수 / PDF 보관 수 통계, 최근 논문 5편, 여기서
  바로 Zotero 동기화 실행
- **Papers 탭** — 캐시된 논문 목록 전체, 목록에서 바로 논문 삭제
- **논문 상세** — 메타데이터(제목/저자/연도/PDF 링크) + 이 논문에만
  귀속된 메모 (Zotero child note), pdf.js 공식 PDFViewer 엔진 기반
  내장 PDF 뷰어
- **메모 에디터** — 텍스트/단어장(단어-뜻) 두 종류의 섹션을 자유롭게
  구성, 입력하는 대로 자동 저장(900ms debounce). 다른 논문으로
  넘어갔다 돌아와도 저장 전 편집 내용은 세션 임시 초안(sessionStorage)으로
  남아 유지됨
- **컬렉션 탭** — Zotero 컬렉션 목록과 소속 논문 탐색
- **검색 아이콘** — 어디서든 논문 제목 검색으로 바로 진입
- `POST /api/sync` — Zotero에서 논문 메타데이터만 캐시 (AI 처리 없음)

논문에 안 묶인 독립 메모(standalone note) 탭은 초기 구상에는 있었지만
AI 기능을 걷어내는 과정에서 함께 빠졌습니다 — 지금은 논문에 귀속된
메모(child note)만 지원합니다.

## 다음에 추가하면 좋은 것

- 의미 기반 검색 (임베딩) — 지금은 제목 검색만 지원, 나중에
  `GET /api/search?q=`로 얹을 수 있게 구조는 열어둠
- 주기적 자동 동기화 (cron)
- 읽음/읽는 중/읽을 예정 같은 상태 관리
