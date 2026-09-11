# TODO

## 진행 중

## 완료
- [x] 3번-2: 하이라이트 팝업 터치 타겟 점검 — `@media (pointer: coarse)`로 터치 환경에서만 스와치 25→44px, 삭제 버튼 min-height 44px 등으로 확대, 데스크톱 마우스 크기는 그대로 유지. 빌드 통과, `3b61a60` 푸시 완료
- [x] 3번-1: 태블릿 가로모드 분할뷰 브레이크포인트 조정 — `orientation: portrait` 조건 추가해 아이패드 Pro 12.9" 세로(폭 1024px) 사각지대 해결, 가로 태블릿/데스크톱은 분할뷰 그대로 유지. 빌드 통과, `da28bbb` 푸시 완료
- [x] 태블릿 PDF 핀치 확대/축소 + 한 손가락 팬 구현 — `touch-action: none`으로 전환해 네이티브 팬과 JS 확대 보정이 경합하던 근본 원인 제거(`docs/pdf-touch-pinch-zoom.md`), 손가락 1개/2개를 하나의 핸들러(`touch-gestures.js`)로 통합 처리, 형광펜 드래그는 `window.getSelection()` 재사용으로 구분. 실기기(태블릿)에서 사용자 확인 완료, `4faf9d7` 푸시 완료
- [x] 로그인 페이지에 Folio 부연설명 추가, README 서브타이틀 추가, package.json(들)에 description 추가 — `LoginPage.svelte`에 "Zotero용 개인 논문 읽기·메모 공간" 서브타이틀(`login-brand-sub`, `app.css` 스타일 추가), `README.md` 제목 아래 같은 문구 + "포트폴리오 아님" 명시, `web/package.json`에 description 필드 추가(루트 `package.json`은 기존에 이미 있어 유지). 빌드 통과 확인
- [x] Alt+← 리스너가 재등록 안 되는 버그 수정 — `popstate`/`keydown`(Alt+←) 리스너를 `setupDone` effect에서 분리해, scrollContainer/viewerEl 변경과 무관하게 마운트 시 1회만 등록·언마운트 시만 해제되는 별도 `$effect`로 옮김(형광펜 리스너와 동일 패턴). `web/src/components/PdfViewer.svelte`, 빌드 통과 확인. 실제 앱 구동 검증은 아직 안 함
- [x] 맥 환경에서 PDF 참고문헌 뒤로가기 단축키(Alt+←/Option+←)가 안 먹는 문제 진단·수정 — 원인: 클릭된 참고문헌 링크(`<a>`)에 포커스가 남으면 맥이 ArrowLeft 키다운 자체를 페이지 JS로 안 보냄(사용자 실기기 콘솔 로그로 확인). 점프 직후 링크 blur 처리로 수정, 로컬 재현 테스트로 확인, `0afa3f4` 푸시 완료
- [x] Alt+← 단축키 리스너가 쓰다가 꺼지는 버그 원인 파악 — `PdfViewer.svelte`의 `setupDone` 게이트 `$effect`(874~1048줄) 안에 `popstate`/`keydown`(Alt+←) 리스너가 등록돼 있는데, 이 effect가 읽는 `scrollContainer`/`viewerEl`이 나중에 바뀌면 Svelte가 cleanup만 실행하고 본문은 `setupDone` 때문에 early return 해 리스너가 재등록되지 않음. 형광펜 리스너는 이미 같은 이유로 별도 effect로 분리돼 있으나(1059줄 근처) Alt+← 리스너는 아직 그대로 남아 같은 버그를 가짐. 수정 여부는 사용자 확인 대기

## 보류 (사용자 확인 필요)
- [?] 3번-3: 노트 바텀시트 전환 (범위/방식 확인 대기 — 사용자에게 질문함)
- [?] Zotero ink annotation 실제 데이터 형식 확인 (사용자가 Zotero 데스크톱에서 샘플 ink 생성해줄 때까지 대기)
