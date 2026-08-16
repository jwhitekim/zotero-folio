import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  worker: {
    // pdf.js가 워커를 { type: "module" }로 띄우므로 번들도 ES 모듈이어야 함
    format: 'es',
  },
  server: {
    // 개발 중에는 API 요청을 Express 서버(3002)로 프록시
    proxy: {
      '/api': 'http://localhost:3002',
      '/oauth': 'http://localhost:3002',
    },
  },
  build: {
    // 빌드 결과를 server.js가 정적 파일로 서빙 (서버 하나로 API+UI 통합)
    outDir: 'dist',
  },
})
