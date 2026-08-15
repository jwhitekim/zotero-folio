// SQLite 스키마 + 헬퍼 함수.
// processed_items: 이미 요약을 생성한 아이템 캐시 (중복 요약 방지)
// embeddings: 의미 검색용 벡터 저장
// sync_state: 마지막으로 동기화한 Zotero 라이브러리 버전

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'zotero-insight.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS processed_items (
    item_key      TEXT PRIMARY KEY,
    item_version  INTEGER NOT NULL,
    title         TEXT,
    summary       TEXT,
    tags          TEXT,
    note_key      TEXT,
    processed_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS embeddings (
    item_key  TEXT PRIMARY KEY REFERENCES processed_items(item_key),
    vector    BLOB NOT NULL,
    dim       INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

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

// --- processed_items -----------------------------------------------------

export function isItemProcessed(itemKey, itemVersion) {
  const row = db
    .prepare('SELECT item_version FROM processed_items WHERE item_key = ?')
    .get(itemKey);
  return !!row && row.item_version === itemVersion;
}

// item + vector를 한 트랜잭션으로 저장 (요약/노트/임베딩까지 전부 성공한
// 아이템만 호출됨).
const insertProcessedItem = db.prepare(`
  INSERT INTO processed_items (item_key, item_version, title, summary, tags, note_key)
  VALUES (@itemKey, @itemVersion, @title, @summary, @tags, @noteKey)
  ON CONFLICT(item_key) DO UPDATE SET
    item_version = excluded.item_version,
    title = excluded.title,
    summary = excluded.summary,
    tags = excluded.tags,
    note_key = excluded.note_key,
    processed_at = datetime('now')
`);

const insertEmbedding = db.prepare(`
  INSERT INTO embeddings (item_key, vector, dim)
  VALUES (@itemKey, @vector, @dim)
  ON CONFLICT(item_key) DO UPDATE SET vector = excluded.vector, dim = excluded.dim
`);

export const saveProcessedItem = db.transaction(
  ({ itemKey, itemVersion, title, summary, tags, noteKey, vector }) => {
    insertProcessedItem.run({
      itemKey,
      itemVersion,
      title,
      summary: JSON.stringify(summary),
      tags: JSON.stringify(tags),
      noteKey,
    });
    insertEmbedding.run({
      itemKey,
      vector: Buffer.from(Float32Array.from(vector).buffer),
      dim: vector.length,
    });
  }
);

export function listProcessedItems() {
  const rows = db
    .prepare('SELECT * FROM processed_items ORDER BY processed_at DESC')
    .all();
  return rows.map((row) => ({
    itemKey: row.item_key,
    title: row.title,
    summary: JSON.parse(row.summary),
    tags: JSON.parse(row.tags),
    noteKey: row.note_key,
    processedAt: row.processed_at,
  }));
}

// --- embeddings ------------------------------------------------------------

export function listEmbeddingsWithItems() {
  const rows = db
    .prepare(
      `SELECT e.item_key, e.vector, e.dim, p.title, p.summary, p.tags
       FROM embeddings e JOIN processed_items p ON p.item_key = e.item_key`
    )
    .all();
  return rows.map((row) => ({
    itemKey: row.item_key,
    vector: new Float32Array(
      row.vector.buffer,
      row.vector.byteOffset,
      row.dim
    ),
    title: row.title,
    summary: JSON.parse(row.summary),
    tags: JSON.parse(row.tags),
  }));
}

export default db;
