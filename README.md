# Folio

> Zotero 사용자를 위한 개인 논문 읽기 및 메모 공간 (포트폴리오와 무관)

Folio는 기존 Zotero 라이브러리를 그대로 유지하면서, 그 위에 "직접 읽고 정리하는 공간"을 더해주는 개인용 도구입니다. 저장, 메타데이터 추출, PDF(Portable Document Format) 동기화 등은 모두 Zotero가 처리하도록 두고, Folio는 다음 기능에 집중합니다:

1. 북마크 매니저처럼 논문 목록 표시 (제목 검색 지원)
2. 논문별 자유로운 메모 작성 (Zotero 하위 메모/child note로 저장)
3. Zotero 컬렉션 단위의 논문 탐색

AI 자동 요약 기능은 제공하지 않습니다. AI 요약은 기억에 잘 남지 않는다는 판단 아래, 직접 작성하는 메모에만 집중할 수 있도록 만들었습니다.

## 왜 이렇게 만들었나

- **Zotero의 역할:** 저장, 메타데이터 추출, PDF 관리, 다기기 동기화 등 이미 완성도 높은 영역 담당
- **Folio의 역할:** Zotero가 지원하지 않는 요소 보완 — 직관적인 목록 탐색과 직접 작성하는 메모 기능
- Zotero를 대체하는 것이 아니라 보조하는 구조이므로, Zotero가 업데이트되거나 다른 기기에서 접속해도 아무런 영향이 없습니다. 작성한 메모 역시 전부 Zotero note로 저장되어 Folio 없이 Zotero 앱에서도 그대로 확인할 수 있습니다.

## 준비물

- **Zotero OAuth 앱:** [https://www.zotero.org/oauth/apps](https://www.zotero.org/oauth/apps) 에서 등록 후 Client Key / Client Secret 발급 (로컬 실행 시 콜백 URL은 `http://localhost:3002/oauth/callback`). Client Key/Secret은 "Folio라는 앱을 Zotero에 등록"하기 위한 앱 등록 키로, 서버당 1세트만 필요하며 사용자 개개인이 발급받는 Zotero API(Application Programming Interface) 키와는 다른 개념입니다. 로그인한 사용자별 개인 토큰은 앱 등록 키를 통해 "Zotero로 로그인"할 때마다 별도로 발급되어 Supabase에 저장됩니다.
- **Supabase 프로젝트:** 논문 메타데이터 캐시 및 계정 정보 저장용. Project Settings &gt; API 메뉴에서 Project URL과 `service_role` 키를 복사합니다.

## 설치 및 실행

```bash
npm install
cp .env.example .env
# .env에 ZOTERO_CLIENT_KEY, ZOTERO_CLIENT_SECRET,
#          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET 입력
```

```bash
docker compose up --build   # http://localhost:3002 에서 API + 웹 UI 함께 서빙
```

캐시 데이터는 Supabase에 보관되므로 컨테이너에 별도의 영속 볼륨(persistent volume)을 설정할 필요가 없습니다.

웹 UI를 수정 및 개발할 때는 `cd web && npm run dev` 명령어로 Vite 개발 서버(핫 리로드 지원)를 별도 실행하세요. `/api` 요청은 3002번 포트로 자동 프록시됩니다.

`localhost` 이외의 주소로 접속하는 경우, `.env` 파일의 `APP_BASE_URL`을 실제 접속 주소로 변경해야 합니다. 또한 Zotero OAuth 앱의 콜백 URL도 `<해당 주소>/oauth/callback`으로 등록해야 로그인이 정상적으로 작동합니다.

## 기능

- **홈 탭** — 전체 논문 수 및 PDF 보관 수 통계, 최근 논문 5편 표시, 즉시 Zotero 동기화 실행 가능
- **Papers 탭** — 캐시된 전체 논문 목록 조회 및 목록에서 직접 논문 삭제 가능
- **논문 상세** — 메타데이터(제목/저자/연도/PDF 링크) 및 해당 논문에 종속된 메모(Zotero child note) 확인, pdf.js 공식 PDFViewer 엔진 기반의 내장 PDF 뷰어 제공
- **메모 에디터** — 텍스트 및 단어장(단어-뜻) 2가지 형태의 섹션을 자유롭게 구성, 입력 즉시 자동 저장(900ms 디바운스). 저장 전 상태에서 다른 논문으로 이동했다가 돌아와도 편집 내용은 세션 임시 초안(`sessionStorage`)으로 유지
- **컬렉션 탭** — Zotero 컬렉션 목록 및 컬렉션별 소속 논문 탐색
- **검색 아이콘** — 어디서나 논문 제목 검색을 통해 원하는 논문으로 즉시 이동
- `POST /api/sync` — Zotero에서 논문 메타데이터만 캐시 (AI 처리 없음)

논문에 귀속되지 않는 독립 메모(standalone note) 탭은 초기 구상에 포함되어 있었으나, AI 기능을 제거하는 과정에서 함께 제외되었습니다. 현재는 논문에 종속된 메모(child note)만 지원합니다.