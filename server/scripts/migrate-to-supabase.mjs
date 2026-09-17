// 기존 로컬 SQLite 캐시(data/zotero-insight.db)를 Supabase로 옮기는 1회성 스크립트.
//
// ── 실행 순서 ────────────────────────────────────────────────────────────────
//  (1) 먼저 server/supabase/schema.sql 의 내용을 Supabase 대시보드 → SQL Editor에
//      붙여넣고 실행한다 (folio_users / folio_papers / folio_sync_state 생성).
//  (2) 그다음 프로젝트 루트에서 이 스크립트를 실행한다:
//
//        npm run migrate:supabase
//        (또는: node server/scripts/migrate-to-supabase.mjs)
//
//      옵션:
//        --db=<경로>              읽어올 SQLite 파일 (기본: data/zotero-insight.db)
//        --zotero-user-id=<숫자>  SQLite에 토큰이 없을 때 대상 계정을 직접 지정
//        --dry-run                실제로 쓰지 않고 무엇을 옮길지만 출력
// ────────────────────────────────────────────────────────────────────────────
//
// 이 스크립트는 여러 번 돌려도 안전하다 (전부 upsert). 옮기는 대상은
// "논문 메타데이터 캐시 + 마지막 동기화 버전 + Zotero 계정 토큰"뿐이다 —
// 메모 note 원문은 원래 로컬에 캐시하지 않으므로 옮길 것도 없다 (Zotero가 원본).
//
// SQLite는 Node 내장 모듈(node:sqlite)로 읽는다 — 이 전환으로 better-sqlite3
// 의존성을 걷어냈기 때문이다. 따라서 Node 22.5 이상이 필요하다.

import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { supabase, unwrap } from '../supabase.js';
// 테이블 이름은 db.js와 한 곳에서 관리한다 (folio_ 접두사 이유는 schema.sql 참고).
import { USERS, PAPERS, SYNC_STATE } from '../db.js';

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const DRY_RUN = process.argv.includes('--dry-run');

const dbPath = path.resolve(arg('db', path.join('data', 'zotero-insight.db')));
if (!fs.existsSync(dbPath)) {
  console.error(`[migrate] SQLite 파일을 찾을 수 없습니다: ${dbPath}`);
  process.exit(1);
}

const sqlite = new DatabaseSync(dbPath, { readOnly: true });

// --- 1. 기존 sync_state에서 계정 정보와 마지막 동기화 버전을 읽는다 ---------
const state = Object.fromEntries(
  sqlite.prepare('SELECT key, value FROM sync_state').all().map((r) => [r.key, r.value])
);

const zoteroUserId = arg('zotero-user-id', state.zoteroUserId);
if (!zoteroUserId) {
  console.error(
    '[migrate] 대상 zotero_user_id를 찾지 못했습니다.\n' +
      '          로컬 DB에 로그인 기록이 없다면 --zotero-user-id=<숫자>로 직접 지정해주세요.'
  );
  process.exit(1);
}
if (!state.zoteroToken) {
  console.error(
    '[migrate] 로컬 DB에 Zotero API 토큰이 없습니다.\n' +
      '          이 경우 papers 캐시만 옮길 수 없습니다 — 서버를 띄우고 한 번 Zotero로\n' +
      '          로그인해서 users 행을 만든 뒤 이 스크립트를 다시 실행해주세요.'
  );
  process.exit(1);
}

const papers = sqlite.prepare('SELECT * FROM papers').all();

// attachment_type이 비어 있는 행이 남아 있으면(이 컬럼이 생기기 전에 캐시된 논문)
// 증분 동기화로는 영영 안 채워진다 — lastVersion을 0으로 두어 다음 sync가
// 전체를 다시 읽게 한다. 기존 SQLite db.js가 하던 보정을 여기로 옮긴 것이다.
const hasStaleAttachmentType = papers.some((p) => p.attachment_key && !p.attachment_type);
const lastVersion = hasStaleAttachmentType ? 0 : Number(state.lastVersion) || 0;

console.log(`[migrate] SQLite: ${dbPath}`);
console.log(`[migrate] 대상 Zotero 계정: ${zoteroUserId} (${state.zoteroUsername || '이름 없음'})`);
console.log(`[migrate] 옮길 논문: ${papers.length}건, lastVersion: ${lastVersion}${hasStaleAttachmentType ? ' (attachment_type 미채움 행이 있어 0으로 초기화 — 다음 sync가 전체 재조회)' : ''}`);

if (DRY_RUN) {
  console.log('[migrate] --dry-run 이므로 여기서 종료합니다 (아무것도 쓰지 않음).');
  process.exit(0);
}

// --- 2. users 행 생성/갱신 --------------------------------------------------
const user = unwrap(
  await supabase
    .from(USERS)
    .upsert(
      {
        zotero_user_id: String(zoteroUserId),
        zotero_username: state.zoteroUsername || '',
        zotero_api_key: state.zoteroToken,
      },
      { onConflict: 'zotero_user_id' }
    )
    .select()
    .single(),
  'users upsert'
);
console.log(`[migrate] users 준비 완료: ${user.id}`);

// --- 3. papers 이관 ---------------------------------------------------------
// SQLite에서는 authors/collections가 JSON 문자열이었다 — Postgres jsonb로 넣는다.
function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// synced_at은 SQLite datetime('now')가 남긴 UTC 문자열("YYYY-MM-DD HH:MM:SS")이라
// 타임존 표기가 없다 — 그대로 넣으면 로컬 시간으로 오해될 수 있어 UTC로 명시한다.
function toTimestamptz(value) {
  if (!value) return new Date().toISOString();
  return value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
}

const rows = papers.map((p) => ({
  user_id: user.id,
  item_key: p.item_key,
  item_version: p.item_version,
  title: p.title,
  authors: parseJsonArray(p.authors),
  year: p.year,
  attachment_key: p.attachment_key,
  attachment_type: p.attachment_type,
  collections: parseJsonArray(p.collections),
  synced_at: toTimestamptz(p.synced_at),
}));

// 한 번에 전부 보내면 payload가 커질 수 있으니 나눠서 올린다.
const CHUNK = 200;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  unwrap(await supabase.from(PAPERS).upsert(chunk, { onConflict: 'user_id,item_key' }), 'papers upsert');
  console.log(`[migrate] papers ${Math.min(i + CHUNK, rows.length)}/${rows.length} 완료`);
}

// --- 4. sync_state(lastVersion) 이관 ----------------------------------------
unwrap(
  await supabase
    .from(SYNC_STATE)
    .upsert({ user_id: user.id, key: 'lastVersion', value: String(lastVersion) }, { onConflict: 'user_id,key' }),
  'sync_state upsert'
);

console.log('[migrate] 완료 — 이제 `npm start` 후 Zotero로 로그인하면 기존 라이브러리가 그대로 보입니다.');
