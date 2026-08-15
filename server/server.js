// Express 라우트: POST /api/sync, GET /api/search, GET /api/papers.
// sync 흐름(버전 diff → PDF 처리 → note 작성 → DB 저장)은 별도 파일 없이
// 여기 doSync()에 둔다 (CLAUDE.md 아키텍처에 sync 전용 파일이 없음).

import 'dotenv/config';
import express from 'express';

import { getLastVersion, setLastVersion, isItemProcessed, saveProcessedItem, listProcessedItems } from './db.js';
import { fetchChangedTopItems, findPdfAttachment, downloadAttachmentFile, createChildNote } from './zotero.js';
import { extractText, summarizeWithGemini } from './summarize.js';
import { embedDocument, searchSimilar } from './embeddings.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;

function buildNoteHtml(summary, tags) {
  const items = summary.map((line) => `<li>${line}</li>`).join('\n    ');
  return `<p><strong>AI 요약 (Zotero Insight)</strong></p>
<ul>
    ${items}
</ul>
<p>키워드: ${tags.join(', ')}</p>`;
}

// 아이템 하나를 처리한다. 실패하면 로그만 남기고 null을 반환한다 (sync 전체를
// 중단시키지 않음). PDF 없음 / 텍스트 추출 실패 / Claude·Voyage 실패 모두
// 여기서 걸러진다.
async function processItem(item) {
  const itemKey = item.key;
  const title = item.data.title || '(제목 없음)';

  try {
    const attachmentKey = await findPdfAttachment(itemKey);
    if (!attachmentKey) {
      console.log(`[sync] 스킵 (PDF 없음): ${title}`);
      return null;
    }

    const pdfBuffer = await downloadAttachmentFile(attachmentKey);

    let text;
    try {
      text = await extractText(pdfBuffer);
    } catch (err) {
      console.log(`[sync] 스킵 (텍스트 추출 실패): ${title} - ${err.message}`);
      return null;
    }

    const { summary, tags } = await summarizeWithGemini(text);
    const vector = await embedDocument(`${title}\n${summary.join(' ')}\n${tags.join(', ')}`);

    // 위 단계가 전부 성공한 뒤에만 Zotero에 쓴다 (중복 note 방지).
    const noteKey = await createChildNote(itemKey, buildNoteHtml(summary, tags), tags);

    saveProcessedItem({
      itemKey,
      itemVersion: item.version,
      title,
      summary,
      tags,
      noteKey,
      vector,
    });

    console.log(`[sync] 처리 완료: ${title}`);
    return { itemKey, title };
  } catch (err) {
    console.error(`[sync] 스킵 (오류): ${title} - ${err.message}`);
    return null;
  }
}

async function doSync() {
  const lastVersion = getLastVersion();
  const { items, newVersion } = await fetchChangedTopItems(lastVersion);

  const results = [];
  for (const item of items) {
    if (isItemProcessed(item.key, item.version)) continue;
    const result = await processItem(item);
    if (result) results.push(result);
  }

  setLastVersion(newVersion);
  return { checked: items.length, processed: results.length, items: results };
}

app.post('/api/sync', async (req, res) => {
  try {
    const result = await doSync();
    res.json(result);
  } catch (err) {
    console.error('[sync] 전체 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'q 쿼리 파라미터가 필요합니다' });
  }
  try {
    const results = await searchSimilar(query);
    res.json(results);
  } catch (err) {
    console.error('[search] 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/papers', (req, res) => {
  res.json(listProcessedItems());
});

app.listen(PORT, () => {
  console.log(`Zotero Insight 서버 실행 중: http://localhost:${PORT}`);
});
