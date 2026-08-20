// SQLite 스키마 + 헬퍼 함수.
// papers: 논문 목록/검색/컬렉션 필터용 메타데이터 캐시 (요약/메모 원문은 안 담음)
// sync_state: 마지막으로 동기화한 Zotero 라이브러리 버전
//
// 메모 원문은 절대 여기 캐시하지 않는다 — Zotero가 항상 최신 기준이므로
// 매 요청마다 Zotero API에서 라이브로 읽는다 (zotero.js 참고).

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'zotero-insight.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS papers (
    item_key       TEXT PRIMARY KEY,
    item_version   INTEGER NOT NULL,
    title          TEXT,
    authors        TEXT,   -- JSON 배열 문자열
    year           TEXT,
    attachment_key TEXT,
    collections    TEXT,   -- JSON 배열 문자열 (Zotero collection key 목록)
    synced_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// attachment_type: 'pdf' | 'html' | null — 원문 패널이 PDF 뷰어를 쓸지
// HTML 스냅샷을 그대로 렌더링할지 구분한다. 기존 DB에는 없는 컬럼이라
// 실패해도(이미 있으면) 조용히 넘어간다.
try {
  db.exec('ALTER TABLE papers ADD COLUMN attachment_type TEXT');
} catch {
  // 이미 컬럼이 있음 — 무시
}

// --- sync_state ---------------------------------------------------------

export function getLastVersion() {
  const row = db.prepare('SELECT value FROM sync_state WHERE key = ?').get('lastVersion');
  return row ? Number(row.value) : 0;
}

export function setLastVersion(version) {
  db.prepare(
    'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run('lastVersion', String(version));
}

// --- Zotero OAuth 인증 (sync_state 재사용 — 1인용이라 별도 테이블 불필요) -----

const upsertSyncState = db.prepare(
  'INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

export function getZoteroAuth() {
  const rows = db
    .prepare("SELECT key, value FROM sync_state WHERE key IN ('zoteroToken', 'zoteroUserId', 'zoteroUsername')")
    .all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (!map.zoteroToken || !map.zoteroUserId) return null;
  return { token: map.zoteroToken, userId: map.zoteroUserId, username: map.zoteroUsername || '' };
}

export function setZoteroAuth({ token, userId, username }) {
  upsertSyncState.run('zoteroToken', token);
  upsertSyncState.run('zoteroUserId', userId);
  upsertSyncState.run('zoteroUsername', username || '');
}

export function clearZoteroAuth() {
  db.prepare("DELETE FROM sync_state WHERE key IN ('zoteroToken', 'zoteroUserId', 'zoteroUsername')").run();
}

// --- papers ------------------------------------------------------------

const upsertPaper = db.prepare(`
  INSERT INTO papers (item_key, item_version, title, authors, year, attachment_key, attachment_type, collections)
  VALUES (@itemKey, @itemVersion, @title, @authors, @year, @attachmentKey, @attachmentType, @collections)
  ON CONFLICT(item_key) DO UPDATE SET
    item_version = excluded.item_version,
    title = excluded.title,
    authors = excluded.authors,
    year = excluded.year,
    attachment_key = excluded.attachment_key,
    attachment_type = excluded.attachment_type,
    collections = excluded.collections,
    synced_at = datetime('now')
`);

export function savePaper({ itemKey, itemVersion, title, authors, year, attachmentKey, attachmentType, collections }) {
  upsertPaper.run({
    itemKey,
    itemVersion,
    title,
    authors: JSON.stringify(authors),
    year,
    attachmentKey: attachmentKey ?? null,
    attachmentType: attachmentType ?? null,
    collections: JSON.stringify(collections),
  });
}

function rowToPaper(row) {
  return {
    itemKey: row.item_key,
    title: row.title,
    authors: JSON.parse(row.authors),
    year: row.year,
    hasPdf: row.attachment_type === 'pdf',
    attachmentKey: row.attachment_key,
    attachmentType: row.attachment_type,
    collections: JSON.parse(row.collections),
    syncedAt: row.synced_at,
  };
}

export function listPapers(query) {
  const rows = query
    ? db
        .prepare('SELECT * FROM papers WHERE title LIKE ? ORDER BY title COLLATE NOCASE')
        .all(`%${query}%`)
    : db.prepare('SELECT * FROM papers ORDER BY synced_at DESC').all();
  return rows.map(rowToPaper);
}

export function getPaper(itemKey) {
  const row = db.prepare('SELECT * FROM papers WHERE item_key = ?').get(itemKey);
  return row ? rowToPaper(row) : null;
}

export function deletePaper(itemKey) {
  db.prepare('DELETE FROM papers WHERE item_key = ?').run(itemKey);
}

export function listPapersByCollection(collectionKey) {
  // collections 컬럼은 JSON 배열 문자열 — LIKE로 key 포함 여부를 간단히 필터링
  const rows = db
    .prepare("SELECT * FROM papers WHERE collections LIKE ? ORDER BY title COLLATE NOCASE")
    .all(`%"${collectionKey}"%`);
  return rows.map(rowToPaper);
}

export default db;
