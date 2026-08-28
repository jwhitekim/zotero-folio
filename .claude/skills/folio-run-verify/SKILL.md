---
name: folio-run-verify
description: Folio(server/ + web/)를 로컬에서 실제로 띄우고 브라우저로 동작을 검증할 때 반드시 먼저 읽는다. "로컬에서 확인", "브라우저로 검증", "실제로 돌려봐", "앱 띄워서 확인" 같은 요청이나, 코드 변경 후 완료 보고 전에 사용. 이 프로젝트 특유의 함정(스테일 Docker 컨테이너, dist 미빌드, npm install 누락)을 다룬다 — 일반적인 "앱 실행" 절차와 다르므로 건너뛰지 말 것.
---

# Folio 로컬 구동 + 검증 절차

이 저장소를 실제로 띄워서 검증할 때, 겉보기엔 정상으로 보이지만 실제로는 **바뀐 코드가 아니라 예전 빌드를 보고 있는** 사고가 나기 쉽다. 아래 순서를 건너뛰지 않는다.

## 1. 지금 3002 포트에 뭐가 떠 있는지 먼저 확인한다

```bash
lsof -i :3002
docker ps
```

`docker-compose.yml` 기준 `zotero-insight-app` 컨테이너가 이미 떠 있는 경우가 흔하다 — 이 컨테이너는 마지막으로 이미지가 빌드된 시점의 코드로 고정돼 있고, 로컬 소스를 실시간으로 반영하지 않는다. **며칠~몇 주 전 이미지일 수 있다.**

- 컨테이너가 떠 있으면 **건드리지 않는다** (사용자가 실제로 쓰고 있을 수 있는 서비스). `docker compose up --build`로 재빌드하려면 먼저 사람에게 확인받는다.
- 지금 작업 중인 코드를 검증하려면 **별도 포트로 새 로컬 프로세스**를 띄운다 (예: `PORT=3099`). 3002와 절대 혼동하지 않는다.

## 2. 로컬 프로세스 실행 전 의존성 확인

루트(`package.json`)와 `web/`은 별도 `node_modules`를 쓴다. 둘 다 설치돼 있는지 확인:

```bash
ls node_modules | grep -i "adm-zip\|better-sqlite3\|express\|dotenv"   # 루트
npm install   # 하나라도 빠졌으면
```

`adm-zip`처럼 `package.json`엔 있는데 실제 설치가 누락된 경우가 있었다 — `npm start`가 `ERR_MODULE_NOT_FOUND`로 즉시 죽는데, 백그라운드로 띄우면 이 에러를 놓치고 "떠 있다"고 착각하기 쉽다.

## 3. 프론트엔드를 고쳤다면 반드시 다시 빌드한다

`web/dist`는 `.gitignore` 대상이고, 서버는 `web/dist`를 그대로 정적 서빙한다 (`server/server.js`의 `express.static(WEB_DIST)`). **`web/src` 코드를 바꿔도 `web/dist`는 자동으로 갱신되지 않는다.**

```bash
cd web && npx vite build
```

빌드 후 `web/dist/index.html`이 참조하는 해시가 방금 빌드한 asset 파일명과 일치하는지 확인해두면, 나중에 "어느 빌드를 보고 있는지" 헷갈릴 때 대조할 수 있다.

## 4. 로컬 프로세스 기동

```bash
PORT=3099 nohup node server/server.js > /tmp/folio-server.log 2>&1 &
sleep 2
cat /tmp/folio-server.log     # 에러 없이 "Folio 서버 실행 중"이 찍혔는지 확인
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3099/
```

`.env`에 실제 `ZOTERO_API_KEY`/`ZOTERO_USER_ID`가 있으므로 사용자의 실제 Zotero 라이브러리 데이터가 뜬다 — 조회(GET)만 하고, 쓰기 동작(메모 저장, 웹페이지 추가)을 테스트할 땐 실제로 사용자 라이브러리에 기록이 남는다는 걸 인지한다.

## 5. 테스트할 논문 찾기

이 앱은 URL 라우팅이 없다 (해시 라우팅도 아님 — `#/paper/KEY` 식으로 직접 이동 불가). 논문은 반드시 UI 안에서 검색으로 찾아야 한다:

```bash
# attachmentType이 'html'인 것과 'pdf'인 것을 각각 하나씩 찾아둔다
curl -s "http://localhost:3099/api/papers" | python3 -c "
import json,sys
for p in json.load(sys.stdin):
    if p.get('attachmentType') in ('html','pdf'):
        print(p['attachmentType'], p['itemKey'], '-', p['title'])
"
```

브라우저에서: 상단 "검색" 아이콘 클릭 → 제목 일부 입력 → 검색 결과 클릭.

## 6. HTML/PDF 뷰어는 반드시 둘 다 확인한다

`HtmlViewer.svelte`와 `PdfViewer.svelte`는 `PdfPane.svelte`가 같은 `zoom`/`scrollEl` 상태를 공유하는 짝 컴포넌트다. 한쪽만 고치고 다른 쪽을 안 열어보면, 공유 로직(줌, 스크롤 보정, 패널 리사이즈 대응)이 반대쪽에서 깨진 걸 놓친다 — 실제로 한 세션에서 HTML 뷰어만 고쳤다가 PDF 뷰어도 같은 이유로 고쳐야 했던 사례가 있었다.

## 7. 마우스 드래그가 필요한 UI(분할 패널 리사이즈 등)

브라우저 자동화의 `left_click_drag`가 실제 `pointerdown`/`pointermove` 이벤트를 못 만들어내 무반응일 수 있다. 이럴 땐 `mcp__claude-in-chrome__javascript_tool`로 `PointerEvent`를 직접 dispatch해서 확인한다:

```js
const el = document.querySelector('.split-resizer'); // 대상 셀렉터로 교체
const rect = el.getBoundingClientRect();
function fire(target, type, x, y) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 }));
}
fire(el, 'pointerdown', rect.x + 3, rect.y + 200);
fire(window, 'pointermove', rect.x - 300, rect.y + 200);
fire(window, 'pointerup', rect.x - 300, rect.y + 200);
```

## 8. 스크린샷만 믿지 않는다

CSS transition(패널 리사이즈, 접기/펼치기 등)이나 debounce된 재계산(폭 맞춤 배율 등)이 걸린 화면은, 스크린샷을 찍은 타이밍이 애니메이션/디바운스 도중이면 실제로는 고쳐졌는데도 안 고쳐진 것처럼 보인다. 레이아웃이 딱 맞아떨어져야 하는 버그(잘림, 오버플로우 등)는 스크린샷 전에 `javascript_tool`로 실제 DOM 수치를 찍어서 숫자로 확인한다:

```js
const box = document.querySelector('.some-container').getBoundingClientRect();
const content = document.querySelector('.some-content').getBoundingClientRect();
JSON.stringify({ fits: content.left >= box.left && content.right <= box.right });
```

## 9. 정리

검증이 끝나면 로컬 프로세스를 정리한다 (`docker ps`로 확인했던 기존 컨테이너는 애초에 안 건드렸으므로 그대로 둔다):

```bash
pkill -f "node server/server.js"
```
