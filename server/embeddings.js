// Voyage AI 임베딩 생성 + SQLite에 저장된 벡터들과의 코사인 유사도 검색.
// 별도 벡터 DB 없이, 개인 라이브러리 규모(수백~수천 건)를 전제로 검색 시점에
// 전체 벡터를 메모리로 로드해 코사인 유사도를 계산한다.

import { listEmbeddingsWithItems } from './db.js';

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3.5';

// Voyage 무료 티어(결제 수단 미등록 시) 기본 제한이 3 RPM으로 낮아서, 실제
// 호출 간격을 그보다 넉넉하게 맞춰 429를 피한다.
const MIN_INTERVAL_MS = 21000;
let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function embed(text, inputType) {
  await throttle();
  const res = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: [text],
      model: VOYAGE_MODEL,
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    throw new Error(`Voyage 임베딩 생성 실패: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

// 저장할 논문 텍스트(제목 + 요약 + 태그)를 임베딩한다.
export function embedDocument(text) {
  return embed(text, 'document');
}

// 검색 쿼리를 임베딩한다 (Voyage의 비대칭 검색 최적화 활용).
export function embedQuery(text) {
  return embed(text, 'query');
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 쿼리와 의미상 가까운 논문 상위 N개를 반환한다.
export async function searchSimilar(query, topN = 10) {
  const queryVector = await embedQuery(query);
  const rows = listEmbeddingsWithItems();

  return rows
    .map((row) => ({
      itemKey: row.itemKey,
      title: row.title,
      summary: row.summary,
      tags: row.tags,
      score: cosineSimilarity(queryVector, row.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
