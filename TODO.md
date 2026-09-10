# TODO

## 진행 중

## 완료
- [x] Alt+← 리스너가 재등록 안 되는 버그 수정 — `popstate`/`keydown`(Alt+←) 리스너를 `setupDone` effect에서 분리해, scrollContainer/viewerEl 변경과 무관하게 마운트 시 1회만 등록·언마운트 시만 해제되는 별도 `$effect`로 옮김(형광펜 리스너와 동일 패턴). `web/src/components/PdfViewer.svelte`, 빌드 통과 확인. 실제 앱 구동 검증은 아직 안 함
- [x] 맥 환경에서 PDF 참고문헌 뒤로가기 단축키(Alt+←/Option+←)가 안 먹는 문제 진단·수정 — 원인: 클릭된 참고문헌 링크(`<a>`)에 포커스가 남으면 맥이 ArrowLeft 키다운 자체를 페이지 JS로 안 보냄(사용자 실기기 콘솔 로그로 확인). 점프 직후 링크 blur 처리로 수정, 로컬 재현 테스트로 확인, `0afa3f4` 푸시 완료
- [x] Alt+← 단축키 리스너가 쓰다가 꺼지는 버그 원인 파악 — `PdfViewer.svelte`의 `setupDone` 게이트 `$effect`(874~1048줄) 안에 `popstate`/`keydown`(Alt+←) 리스너가 등록돼 있는데, 이 effect가 읽는 `scrollContainer`/`viewerEl`이 나중에 바뀌면 Svelte가 cleanup만 실행하고 본문은 `setupDone` 때문에 early return 해 리스너가 재등록되지 않음. 형광펜 리스너는 이미 같은 이유로 별도 effect로 분리돼 있으나(1059줄 근처) Alt+← 리스너는 아직 그대로 남아 같은 버그를 가짐. 수정 여부는 사용자 확인 대기

## 보류 (사용자 확인 필요)
