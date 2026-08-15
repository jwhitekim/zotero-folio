# Zotero Insight

Zotero 라이브러리는 그대로 두고, 그 위에 "AI 요약 + 의미 검색" 레이어만
얹는 개인용 도구입니다. 저장/메타데이터/PDF 동기화는 전부 Zotero가
하던 대로 하고, 이 도구는 새 논문이 들어오면:

1. PDF 텍스트를 추출해서
2. Gemini로 3줄 요약 + 키워드 태그를 생성하고
3. 그 요약을 Zotero 아이템의 노트로 다시 써넣고 (Zotero 앱에서 바로 보임)
4. 임베딩을 로컬에 저장해서 "이 주제 관련 논문 찾아줘" 같은 의미 검색을 지원합니다

## 왜 이렇게 만들었나

- Zotero: 저장, 메타데이터 추출, PDF 관리, 다기기 동기화 — 이미 잘 되어 있는 부분
- 이 도구: Zotero가 안 해주는 것만 보강 — "왜 저장했는지" 맥락, 의미 기반 검색
- Zotero를 대체하지 않고 옆에서 보강하는 구조라, Zotero가 업데이트되거나
  다른 기기에서 접속해도 안 깨집니다.

## 준비물

- Zotero API 키: https://www.zotero.org/settings/keys 에서 발급
  (본인 라이브러리만 쓸 거라 OAuth 앱 등록 불필요, 개인 키로 충분)
- Zotero User ID: 같은 페이지에서 확인 가능
- Gemini API 키: https://aistudio.google.com/apikey 에서 발급
- Voyage AI API 키: https://www.voyageai.com 에서 발급 (임베딩 기반 의미 검색에 사용)

## 설치 및 실행

```bash
npm install
cp .env.example .env
# .env에 ZOTERO_API_KEY, ZOTERO_USER_ID, GEMINI_API_KEY, VOYAGE_API_KEY 입력
npm start
```

## 기능

- `POST /api/sync` — Zotero 라이브러리에서 새 아이템 확인, 요약/태그 생성,
  Zotero에 노트로 저장, 로컬에 임베딩 저장
- `GET /api/search?q=검색어` — 저장된 논문 중 의미상 가까운 것 반환
- `GET /api/papers` — 지금까지 처리한 논문 목록 (요약 포함)

## 다음에 추가하면 좋은 것

- 주기적 자동 동기화 (cron)
- 저장 시 자동 알림 (새 논문 요약 완료되면 알려주기)
- 웹 UI (지금은 API만 있음)
