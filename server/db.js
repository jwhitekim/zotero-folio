// Supabase(Postgres) 접근 계층 + 헬퍼 함수.
// folio_users:      Zotero OAuth로 로그인한 계정 (zotero_user_id가 유니크 키)
// folio_papers:     논문 목록/검색/컬렉션 필터용 메타데이터 캐시 (요약/메모 원문은 안 담음)
// folio_sync_state: 유저별 마지막 동기화 Zotero 라이브러리 버전
//
// 메모 원문은 절대 여기 캐시하지 않는다 — Zotero가 항상 최신 기준이므로
// 매 요청마다 Zotero API에서 라이브로 읽는다 (zotero.js 참고).
//
// 테이블 생성은 이 파일이 하지 않는다. server/supabase/schema.sql을 Supabase
// SQL Editor에서 먼저 실행해야 한다.
//
// 모든 조회/쓰기는 현재 로그인한 유저(context.js)로 스코프된다 — RLS를 쓰지
// 않으므로 user_id 필터를 빼먹으면 곧바로 남의 데이터가 보인다. 그래서
// user_id는 호출부에서 넘기지 않고 이 파일이 컨텍스트에서 직접 읽는다.

import { supabase, unwrap } from './supabase.js';
import { requireUser } from './context.js';

// 이 Supabase 프로젝트의 public 스키마에는 다른 앱의 users 테이블이 이미 있다.
// 이름이 부딪히지 않도록 Folio 테이블은 전부 folio_ 접두사를 쓴다
// (schema.sql의 같은 주석 참고). 마이그레이션 스크립트도 이 값을 가져다 쓴다.
export const USERS = 'folio_users';
export const PAPERS = 'folio_papers';
export const SYNC_STATE = 'folio_sync_state';

// --- users --------------------------------------------------------------

// Zotero OAuth 콜백에서 호출한다. zotero_user_id가 이미 있으면 토큰/이름만
// 갱신하고(재로그인), 없으면 새로 만든다.
export async function upsertUserByZoteroId({ zoteroUserId, zoteroUsername, zoteroApiKey }) {
  const row = unwrap(
    await supabase
      .from(USERS)
      .upsert(
        {
          zotero_user_id: String(zoteroUserId),
          zotero_username: zoteroUsername || '',
          zotero_api_key: zoteroApiKey,
        },
        { onConflict: 'zotero_user_id' }
      )
      .select()
      .single(),
    'users upsert'
  );
  return toUser(row);
}

export async function findUserById(userId) {
  const row = unwrap(
    await supabase.from(USERS).select().eq('id', userId).maybeSingle(),
    'users 조회'
  );
  return row ? toUser(row) : null;
}

function toUser(row) {
  return {
    id: row.id,
    zoteroUserId: row.zotero_user_id,
    zoteroUsername: row.zotero_username || '',
    zoteroApiKey: row.zotero_api_key,
  };
}

// --- sync_state ---------------------------------------------------------

export async function getLastVersion() {
  const { id: userId } = requireUser();
  const row = unwrap(
    await supabase
      .from(SYNC_STATE)
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'lastVersion')
      .maybeSingle(),
    'sync_state 조회'
  );
  return row ? Number(row.value) || 0 : 0;
}

export async function setLastVersion(version) {
  const { id: userId } = requireUser();
  unwrap(
    await supabase
      .from(SYNC_STATE)
      .upsert(
        { user_id: userId, key: 'lastVersion', value: String(version) },
        { onConflict: 'user_id,key' }
      ),
    'sync_state 저장'
  );
}

// --- papers ------------------------------------------------------------

export async function savePaper({
  itemKey,
  itemVersion,
  title,
  authors,
  year,
  attachmentKey,
  attachmentType,
  collections,
}) {
  const { id: userId } = requireUser();
  unwrap(
    await supabase.from(PAPERS).upsert(
      {
        user_id: userId,
        item_key: itemKey,
        item_version: itemVersion,
        title,
        authors: authors ?? [],
        year: year ?? null,
        attachment_key: attachmentKey ?? null,
        attachment_type: attachmentType ?? null,
        collections: collections ?? [],
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,item_key' }
    ),
    'papers 저장'
  );
}

function rowToPaper(row) {
  return {
    itemKey: row.item_key,
    title: row.title,
    authors: row.authors ?? [],
    year: row.year,
    hasPdf: row.attachment_type === 'pdf',
    attachmentKey: row.attachment_key,
    attachmentType: row.attachment_type,
    collections: row.collections ?? [],
    syncedAt: row.synced_at,
  };
}

// 제목 정렬은 SQLite의 COLLATE NOCASE와 같은 느낌으로 대소문자를 무시해야 하는데
// PostgREST로는 정렬 시 collation을 지정할 수 없다 — 유저 한 명의 라이브러리
// 규모(수백~수천 건)에서는 서버에서 정렬해도 부담이 없으므로 여기서 맞춘다.
function sortByTitle(papers) {
  return papers.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko', { sensitivity: 'base' }));
}

export async function listPapers(query) {
  const { id: userId } = requireUser();
  let builder = supabase.from(PAPERS).select().eq('user_id', userId);

  if (query) {
    // 검색어에 들어간 %,_ 는 LIKE 와일드카드라 그대로 두면 "a_b"가 "axb"에도
    // 걸린다 — 백슬래시로 escape해서 입력한 글자 그대로 찾게 한다.
    const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`);
    const rows = unwrap(await builder.ilike('title', `%${escaped}%`), 'papers 검색');
    return sortByTitle(rows.map(rowToPaper));
  }

  const rows = unwrap(await builder.order('synced_at', { ascending: false }), 'papers 목록 조회');
  return rows.map(rowToPaper);
}

export async function getPaper(itemKey) {
  const { id: userId } = requireUser();
  const row = unwrap(
    await supabase.from(PAPERS).select().eq('user_id', userId).eq('item_key', itemKey).maybeSingle(),
    'papers 단건 조회'
  );
  return row ? rowToPaper(row) : null;
}

export async function deletePaper(itemKey) {
  const { id: userId } = requireUser();
  unwrap(
    await supabase.from(PAPERS).delete().eq('user_id', userId).eq('item_key', itemKey),
    'papers 삭제'
  );
}

export async function listPapersByCollection(collectionKey) {
  const { id: userId } = requireUser();
  // collections는 jsonb 배열 — containment(@>)로 "이 키를 포함하는가"를 정확히 건다
  // (SQLite 시절엔 JSON 문자열에 LIKE를 걸어야 했다).
  //
  // contains()에 JS 배열을 그대로 넘기면 supabase-js가 Postgres 배열 리터럴
  // (cs.{KEY})로 직렬화하는데, 그건 jsonb 컬럼에서 유효한 JSON이 아니라 400이
  // 난다. JSON 문자열로 직접 넘겨 cs.["KEY"] 형태가 되게 한다.
  const rows = unwrap(
    await supabase
      .from(PAPERS)
      .select()
      .eq('user_id', userId)
      .contains('collections', JSON.stringify([collectionKey])),
    'papers 컬렉션 조회'
  );
  return sortByTitle(rows.map(rowToPaper));
}
