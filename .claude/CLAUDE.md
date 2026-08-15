# CLAUDE.md

이 파일은 Claude Code가 이 프로젝트에서 작업할 때 참고하는 컨텍스트입니다.

## 프로젝트 정체성

Zotero Insight는 **Zotero를 대체하는 게 아니라 보강하는 도구**입니다.
이 원칙이 모든 설계 결정의 기준입니다:

- 저장, 메타데이터 추출, PDF 파일 관리, 다기기 동기화는 Zotero가 이미
  잘하고 있으므로 절대 재구현하지 않는다.
- 이 프로젝트가 하는 일은 딱 두 가지뿐이다: (1) AI 요약/태그 생성,
  (2) 의미 기반 검색. 그 이상으로 기능을 넓히지 않는다.
- Zotero 라이브러리의 기존 데이터(제목/저자/PDF 원본)는 절대 수정하거나
  덮어쓰지 않는다. 오직 새 노트를 "추가"만 한다.

## 아키텍처

```
[Zotero Web API]
      │ (읽기: 새/변경된 아이템 조회, PDF 첨부파일 다운로드)
      │ (쓰기: 요약 노트 추가만, 그 외 수정 없음)
      ▼
[server/] — Node.js + Express
  ├─ zotero.js     — Zotero API 클라이언트 (읽기/쓰기 래퍼)
  ├─ summarize.js  — PDF 텍스트 추출 + Gemini API 요약/태그 생성
  ├─ embeddings.js — 임베딩 생성 + 저장/검색
  ├─ db.js         — SQLite: 처리된 아이템 캐시, 임베딩 저장
  └─ server.js     — Express 라우트
```

## 핵심 흐름 (sync)

1. Zotero API에서 `library version`을 이용해 마지막 동기화 이후 바뀐
   아이템만 가져온다 (`?since=<lastVersion>`) — 매번 전체를 훑지 않는다.
2. PDF 첨부파일이 있는 아이템만 처리 대상으로 삼는다.
3. 이미 로컬 DB(`processed_items` 테이블)에 있는 아이템(zotero item key +
   version)은 건너뛴다 — 중복 요약 생성 방지.
4. 새 아이템: PDF 다운로드 → 텍스트 추출 → Gemini로 요약(3줄)+키워드
   태그(3~5개) 생성 → Zotero에 자식 노트(child note)로 POST →
   로컬 DB에 임베딩과 함께 저장.
5. 실패한 아이템(텍스트 추출 실패, PDF 없음, 스캔본 등)은 건너뛰고
   로그만 남긴다. 전체 sync가 하나의 실패로 중단되면 안 된다.

## 환경 변수 (.env)

```
ZOTERO_API_KEY=
ZOTERO_USER_ID=
GEMINI_API_KEY=
VOYAGE_API_KEY=
PORT=3002
```

## 코딩 컨벤션

- 이전 프로젝트(my-dictionary)와 동일한 스타일 유지: ESM(`import`),
  Express, `better-sqlite3`.
- 외부 API 호출(Zotero, Gemini, Voyage)은 항상 try/catch로 감싸고, 실패해도
  서버가 죽지 않게 한다.
- 코드 주석과 커밋 메시지, README/사용자 대상 문구는 한국어로 작성한다.
  변수명/함수명은 영어로 작성한다.
- 새 기능을 추가하기 전에 "이게 Zotero가 이미 하는 일은 아닌지"부터
  확인한다. 애매하면 만들지 않고 사용자에게 먼저 물어본다.

## 하지 말아야 할 것

- Zotero 아이템의 title/author/PDF 등 기존 필드를 수정하는 코드
- Zotero 라이브러리 전체를 매번 새로 가져오는 로직 (버전 기반 증분
  동기화를 반드시 사용)
- 브라우저 확장이나 별도 UI 없이도 동작해야 함 — 지금 단계는 API 서버로
  충분하고, UI는 요청받기 전까지 만들지 않는다.
