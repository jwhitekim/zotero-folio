// Supabase(Postgres) 클라이언트.
//
// service_role 키로 접속한다 — 브라우저는 Supabase에 직접 붙지 않고 항상 이
// Express 서버를 거치므로 anon 키는 쓰지 않는다. RLS 대신 서버 코드가 모든
// 쿼리에 user_id 필터를 직접 건다 (db.js 참고).
//
// 테이블은 런타임에 만들지 않는다 — server/supabase/schema.sql을 Supabase
// SQL Editor에서 먼저 실행해야 한다.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env에 없습니다 — Supabase 프로젝트 설정에서 복사해 넣어주세요'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    // 서버 전용 클라이언트라 로그인 세션을 들고 있을 필요가 없다.
    persistSession: false,
    autoRefreshToken: false,
  },
  // Realtime(구독)은 안 쓰는데, supabase-js는 생성자에서 무조건
  // RealtimeClient를 초기화하며 Node 22+ 네이티브 WebSocket을 찾는다
  // (Docker 이미지는 Node 20) — 더미 WebSocket 생성자를 넣어 실제로는
  // 연결을 열지 않으면서 생성자 에러만 피한다.
  realtime: {
    transport: class NoopWebSocket {
      constructor() {
        throw new Error('Realtime은 이 앱에서 사용하지 않습니다');
      }
    },
  },
});

// PostgREST 오류를 그대로 삼키면 "왜 비어 있는지" 알 수 없으므로 한 번 감싸서 던진다.
export function unwrap({ data, error }, what) {
  if (error) throw new Error(`Supabase ${what} 실패: ${error.message}`);
  return data;
}

export default supabase;
