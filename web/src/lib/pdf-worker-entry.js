// pdf.js 워커는 메인 스레드와 별도의 글로벌 스코프에서 돌기 때문에,
// 메인 스레드에 건 폴리필이 여기엔 적용되지 않는다 — 워커 진입점에서
// 한 번 더 걸어준 다음 실제 워커 코드를 그대로 불러온다.
import './promise-with-resolvers-polyfill.js';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
