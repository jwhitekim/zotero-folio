// Express 라우트: 논문 목록/상세, 논문별 구조화 노트, 컬렉션, sync.
// AI 요약/의미 검색/독립 메모는 걷어냈다 — 이 도구는 "Zotero 위 개인
// 아카이브 + 직접 정리하는 구조화 노트" 도구다. 노트 원문은 로컬에
// 캐시하지 않고 항상 Zotero에서 라이브로 읽는다 (db.js는 papers
// 메타데이터 캐시만 담당).

import 'dotenv/config';
import express from 'express';
import path from 'node:path';

import {
  getLastVersion,
  setLastVersion,
  savePaper,
  listPapers,
  getPaper,
  deletePaper,
  listPapersByCollection,
  getZoteroAuth,
  setZoteroAuth,
  clearZoteroAuth,
} from './db.js';
import {
  fetchChangedTopItems,
  fetchDeletedItemKeys,
  fetchItem,
  findPdfAttachment,
  findChildNoteByTag,
  createChildNote,
  updateNote,
  deleteItem,
  listCollections,
  downloadAttachmentFile,
} from './zotero.js';
import { getRequestToken, buildAuthorizeUrl, getAccessToken } from './oauth1.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;
const WEB_DIST = path.join(process.cwd(), 'web', 'dist');
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const CONSUMER_KEY = process.env.ZOTERO_CLIENT_KEY;
const CONSUMER_SECRET = process.env.ZOTERO_CLIENT_SECRET;

const MEMO_TAG = 'zotero-insight:memo';

function extractAuthors(creators) {
  if (!creators) return [];
  return creators
    .map((c) => c.name || [c.firstName, c.lastName].filter(Boolean).join(' '))
    .filter(Boolean);
}

function extractYear(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/\d{4}/);
  return match ? match[0] : dateStr;
}

// 브라우저 커넥터로 저장된 webpage 아이템은 title에 페이지 <title> 태그가
// 그대로 들어와 " | 저널명 | 출판사" 같은 꼬리가 붙는 경우가 있다. Zotero
// 메타데이터에 이걸 대신할 깨끗한 필드가 없어서(websiteTitle 등이 비어
// 있음) 표시용으로 휴리스틱 정제한다 — Zotero 원본 title은 안 건드림.
function cleanTitle(title, itemType) {
  if (itemType !== 'webpage' || !title) return title;
  const idx = title.indexOf(' | ');
  return idx > 0 ? title.slice(0, idx).trim() : title;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 자유 서술형 텍스트를 Zotero note용 HTML 문단으로 변환 (줄바꿈 기준 분리).
function paragraphsToHtml(text) {
  const paragraphs = (text || '').split(/\n{2,}/).filter((p) => p.trim());
  if (paragraphs.length === 0) return '<p></p>';
  return paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n');
}

// Zotero note HTML 조각을 화면에 보여줄 평문으로 되돌린다 (역변환).
function noteHtmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<\/?p>/gi, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

// 단어장 항목(word/meaning 쌍 목록) ↔ HTML <ul> 리스트.
function vocabToHtml(words) {
  const rows = (words || [])
    .map(
      ({ word, meaning }) =>
        `<li><strong>${escapeHtml(word || '')}</strong>: ${escapeHtml(meaning || '')}</li>`
    )
    .join('\n');
  return `<ul>\n${rows}\n</ul>`;
}

function htmlToVocab(html) {
  const items = [...html.matchAll(/<li>\s*<strong>([\s\S]*?)<\/strong>:\s*([\s\S]*?)<\/li>/g)];
  return items.map(([, word, meaning]) => ({
    word: noteHtmlToText(word).trim(),
    meaning: noteHtmlToText(meaning).trim(),
  }));
}

// 항목(section) 배열 ↔ Zotero note HTML. 항목 제목/내용은 전부 사용자가
// 직접 입력한 것 — 여기서 하는 일은 순수 서식 변환뿐, 생성하는 것 없음.
// type이 'vocab'이면 단어/뜻 목록을, 그 외(기본 'text')는 기존처럼 자유
// 텍스트 문단을 직렬화한다.
function sectionsToNoteHtml(sections) {
  return sections
    .map(({ type, title, content, words }) => {
      const body = type === 'vocab' ? vocabToHtml(words) : paragraphsToHtml(content);
      return `<h3>${escapeHtml(title || '제목 없음')}</h3>\n${body}`;
    })
    .join('\n');
}

function noteHtmlToSections(html) {
  if (!html) return [];
  const matches = [...html.matchAll(/<h3>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3>|$)/g)];
  if (matches.length === 0) {
    // 예전 형식(제목 없는 통짜 텍스트) 호환 — "메모" 항목 하나로 보여줌
    const text = noteHtmlToText(html);
    return text ? [{ type: 'text', title: '메모', content: text }] : [];
  }
  return matches.map(([, title, body]) => {
    const trimmedBody = body.trim();
    if (/^<ul/i.test(trimmedBody)) {
      return { type: 'vocab', title: noteHtmlToText(title).trim(), words: htmlToVocab(trimmedBody) };
    }
    return { type: 'text', title: noteHtmlToText(title).trim(), content: noteHtmlToText(body) };
  });
}

// --- sync ------------------------------------------------------------------
// papers 캐시만 갱신한다 (AI 처리 없음). 실패한 아이템은 로그만 남기고
// 계속 진행 — 전체 sync가 하나의 실패로 중단되면 안 된다.
async function doSync() {
  const lastVersion = getLastVersion();
  const { items, newVersion } = await fetchChangedTopItems(lastVersion);

  let cached = 0;
  for (const item of items) {
    // /items/top은 standalone note/attachment도 포함할 수 있어 방어적으로 거른다.
    if (item.data.itemType === 'attachment' || item.data.itemType === 'note') continue;

    try {
      const attachmentKey = await findPdfAttachment(item.key);
      savePaper({
        itemKey: item.key,
        itemVersion: item.version,
        title: cleanTitle(item.data.title, item.data.itemType) || '(제목 없음)',
        authors: extractAuthors(item.data.creators),
        year: extractYear(item.data.date),
        attachmentKey,
        collections: item.data.collections || [],
      });
      cached++;
    } catch (err) {
      console.error(`[sync] 캐시 실패: ${item.data.title} - ${err.message}`);
    }
  }

  // Zotero에서 삭제된 아이템은 로컬 캐시에도 유령으로 남지 않도록 함께 지운다.
  let removed = 0;
  try {
    const deletedKeys = await fetchDeletedItemKeys(lastVersion);
    for (const key of deletedKeys) {
      deletePaper(key);
      removed++;
    }
  } catch (err) {
    console.error(`[sync] 삭제 항목 조회 실패: ${err.message}`);
  }

  setLastVersion(newVersion);
  return { checked: items.length, cached, removed };
}

// --- Zotero OAuth 로그인 --------------------------------------------------
// request token과 secret은 /oauth/login → /oauth/callback 사이에서만 잠깐
// 필요하다. 1인용 도구라 세션 저장소 없이 메모리 변수 하나로 충분하다.
let pendingOAuth = null; // { token, secret }

app.get('/oauth/login', async (req, res) => {
  try {
    const { oauthToken, oauthTokenSecret } = await getRequestToken({
      consumerKey: CONSUMER_KEY,
      consumerSecret: CONSUMER_SECRET,
      callbackUrl: `${APP_BASE_URL}/oauth/callback`,
    });
    pendingOAuth = { token: oauthToken, secret: oauthTokenSecret };
    res.redirect(buildAuthorizeUrl({ oauthToken, appName: 'Folio' }));
  } catch (err) {
    console.error('[oauth] request token 실패:', err.message);
    res.status(500).send('Zotero 로그인 시작 실패: ' + err.message);
  }
});

app.get('/oauth/callback', async (req, res) => {
  const { oauth_token: oauthToken, oauth_verifier: oauthVerifier } = req.query;
  if (!pendingOAuth || pendingOAuth.token !== oauthToken) {
    return res.status(400).send('OAuth 세션이 만료되었습니다. 다시 시도해주세요.');
  }
  try {
    const result = await getAccessToken({
      consumerKey: CONSUMER_KEY,
      consumerSecret: CONSUMER_SECRET,
      oauthToken,
      oauthTokenSecret: pendingOAuth.secret,
      oauthVerifier,
    });
    // 문서에 따라 oauth_token_secret을 Zotero-API-Key로 사용한다.
    setZoteroAuth({ token: result.oauthTokenSecret, userId: result.userId, username: result.username });
    pendingOAuth = null;
    res.redirect('/');
  } catch (err) {
    console.error('[oauth] access token 교환 실패:', err.message);
    res.status(500).send('Zotero 로그인 완료 실패: ' + err.message);
  }
});

app.get('/api/auth/status', (req, res) => {
  const auth = getZoteroAuth();
  res.json({ connected: !!auth, username: auth?.username || null });
});

app.post('/api/auth/logout', (req, res) => {
  clearZoteroAuth();
  res.json({ connected: false });
});

// Zotero 계정이 연결되지 않았으면 나머지 /api 라우트는 전부 막는다.
app.use('/api', (req, res, next) => {
  if (!getZoteroAuth()) {
    return res.status(401).json({ error: 'Zotero 계정이 연결되지 않았습니다', loginUrl: '/oauth/login' });
  }
  next();
});

app.post('/api/sync', async (req, res) => {
  try {
    const result = await doSync();
    res.json(result);
  } catch (err) {
    console.error('[sync] 전체 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- papers ------------------------------------------------------------

app.get('/api/papers', (req, res) => {
  res.json(listPapers(req.query.q));
});

app.get('/api/papers/:key', async (req, res) => {
  const paper = getPaper(req.params.key);
  if (!paper) return res.status(404).json({ error: '논문을 찾을 수 없습니다' });

  try {
    const memoNote = await findChildNoteByTag(req.params.key, MEMO_TAG);
    res.json({
      ...paper,
      memo: memoNote
        ? {
            noteKey: memoNote.key,
            version: memoNote.version,
            sections: noteHtmlToSections(memoNote.data.note),
          }
        : null,
    });
  } catch (err) {
    console.error('[papers detail] 노트 조회 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 논문(Zotero 원본 아이템) 자체를 삭제한다. Zotero 휴지통으로 이동하며,
// 자식 노트/첨부파일도 함께 딸려간다. 로컬 papers 캐시에서도 지운다.
app.delete('/api/papers/:key', async (req, res) => {
  if (!getPaper(req.params.key)) return res.status(404).json({ error: '논문을 찾을 수 없습니다' });

  try {
    const item = await fetchItem(req.params.key);
    await deleteItem(req.params.key, item.version);
    deletePaper(req.params.key);
    res.status(204).end();
  } catch (err) {
    console.error('[papers delete] 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/papers/:key/memo', async (req, res) => {
  const { sections } = req.body;
  if (!Array.isArray(sections)) {
    return res.status(400).json({ error: 'sections(배열)가 필요합니다' });
  }

  try {
    const existing = await findChildNoteByTag(req.params.key, MEMO_TAG);

    if (sections.length === 0) {
      // 항목을 전부 지우고 저장하면 빈 note를 남기지 않고 아예 삭제한다.
      if (existing) await deleteItem(existing.key, existing.version);
      return res.json({ noteKey: null });
    }

    const html = sectionsToNoteHtml(sections);
    const saved = existing
      ? await updateNote(existing.key, existing.version, html)
      : await createChildNote(req.params.key, html, [MEMO_TAG]);
    res.json({ noteKey: saved.key, version: saved.version });
  } catch (err) {
    console.error('[papers memo] 저장 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/papers/:key/pdf', async (req, res) => {
  const paper = getPaper(req.params.key);
  if (!paper?.attachmentKey) {
    return res.status(404).json({ error: 'PDF 첨부파일이 없습니다' });
  }
  try {
    const buffer = await downloadAttachmentFile(paper.attachmentKey);
    res.set('Content-Type', 'application/pdf');
    res.send(buffer);
  } catch (err) {
    console.error('[papers pdf] 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- 컬렉션 ------------------------------------------------------------

app.get('/api/collections', async (req, res) => {
  try {
    const collections = await listCollections();
    res.json(collections.map((c) => ({ key: c.key, name: c.data.name })));
  } catch (err) {
    console.error('[collections] 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/collections/:key/papers', (req, res) => {
  res.json(listPapersByCollection(req.params.key));
});

// web/(Svelte 빌드 결과) 정적 서빙 — `npm run build`를 web/에서 먼저 실행해야 함
app.use(express.static(WEB_DIST));

// /login 같은 클라이언트 경로를 직접 열거나 새로고침해도 Svelte 앱을 반환한다.
app.get('*', (req, res) => {
  res.sendFile(path.join(WEB_DIST, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Folio 서버 실행 중: http://localhost:${PORT}`);
});
