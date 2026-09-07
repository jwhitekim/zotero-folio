// Express 라우트: 논문 목록/상세, 논문별 구조화 노트, 컬렉션, sync.
// AI 요약/의미 검색/독립 메모는 걷어냈다 — 이 도구는 "Zotero 위 개인
// 아카이브 + 직접 정리하는 구조화 노트" 도구다. 노트 원문은 로컬에
// 캐시하지 않고 항상 Zotero에서 라이브로 읽는다 (db.js는 papers
// 메타데이터 캐시만 담당).

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { marked } from 'marked';
import TurndownService from 'turndown';

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
  fetchChangedAttachmentParentKeys,
  fetchDeletedItemKeys,
  fetchItem,
  findReadableAttachment,
  findChildNoteByTag,
  createChildNote,
  createWebpageItem,
  updateNote,
  deleteItem,
  listCollections,
  downloadAttachmentFile,
  fetchAttachmentAnnotations,
  createHighlightAnnotation,
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

// Zotero 기본 하이라이트 팔레트 (web/src/utils/pdf-highlight.js와 같은 값).
// 클라이언트를 못 믿고 서버가 따로 한 번 더 검사해야 하므로 목록을 여기에도 둔다.
const HIGHLIGHT_COLORS = ['#ffd400', '#ff6666', '#5fb236', '#2ea8e5', '#a28ae5'];
// Zotero 스키마가 요구하는 sortIndex 형식 — "페이지|문자오프셋|위에서부터의 거리".
const SORT_INDEX_PATTERN = /^\d{5}\|\d{6}\|\d{5}$/;

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

// 웹페이지 추가 시 제목을 직접 입력 안 하면 페이지 <title> 태그로 채운다.
// 실패해도(타임아웃, 4xx 등) 조용히 넘어가고 URL 자체를 제목으로 쓴다 —
// 이 도구의 역할은 "Zotero에 아이템을 만드는 것"까지고, 본문 파싱은 하지 않는다.
async function fetchPageTitle(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Folio/1.0)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return match ? match[1].trim().replace(/\s+/g, ' ') : null;
  } catch (err) {
    console.error('[papers webpage] 제목 조회 실패:', err.message);
    return null;
  }
}

// 메모는 마크다운으로 편집하되, Zotero note에는 HTML로 저장한다 — Zotero
// 자체 노트 뷰어로 봤을 때도 정상 렌더되게 하기 위함. 저장 시 마크다운→HTML,
// 불러올 때 HTML→마크다운으로 왕복 변환한다. 변환은 순수 서식 변환일 뿐,
// 내용을 만들어내는 것은 없다.
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

function markdownToNoteHtml(markdown) {
  return marked.parse(markdown || '', { async: false }).trim();
}

function noteHtmlToMarkdown(html) {
  if (!html) return '';
  return turndown.turndown(html).trim();
}

// --- sync ------------------------------------------------------------------
// papers 캐시만 갱신한다 (AI 처리 없음). 실패한 아이템은 로그만 남기고
// 계속 진행 — 전체 sync가 하나의 실패로 중단되면 안 된다.
async function doSync() {
  const lastVersion = getLastVersion();
  const { items, newVersion } = await fetchChangedTopItems(lastVersion);

  // 기존 아이템에 첨부파일만 새로 붙은 경우 부모 아이템 자체는 top-level
  // since 조회에 안 걸린다 (부모 version이 안 바뀜) — 별도로 찾아서 합친다.
  const topKeys = new Set(items.map((i) => i.key));
  try {
    const parentKeys = await fetchChangedAttachmentParentKeys(lastVersion);
    for (const key of parentKeys) {
      if (topKeys.has(key)) continue;
      try {
        const parent = await fetchItem(key);
        items.push(parent);
        topKeys.add(key);
      } catch (err) {
        console.error(`[sync] 첨부 변경 부모 조회 실패: ${key} - ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`[sync] 첨부 변경 목록 조회 실패: ${err.message}`);
  }

  let cached = 0;
  for (const item of items) {
    // /items/top은 standalone note/attachment도 포함할 수 있어 방어적으로 거른다.
    if (item.data.itemType === 'attachment' || item.data.itemType === 'note') continue;

    try {
      const attachment = await findReadableAttachment(item.key);
      savePaper({
        itemKey: item.key,
        itemVersion: item.version,
        title: cleanTitle(item.data.title, item.data.itemType) || '(제목 없음)',
        authors: extractAuthors(item.data.creators),
        year: extractYear(item.data.date),
        attachmentKey: attachment?.key ?? null,
        attachmentType: attachment?.type ?? null,
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
            markdown: noteHtmlToMarkdown(memoNote.data.note),
          }
        : null,
    });
  } catch (err) {
    console.error('[papers detail] 노트 조회 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 웹페이지 URL을 새 Zotero 아이템으로 추가한다 (itemType: webpage).
// 저장/동기화는 그대로 Zotero가 하고, Folio는 아이템 생성 창구 하나만 연다 —
// 생성 이후 title/author 등 서지정보 수정은 여기서 하지 않는다.
app.post('/api/papers/webpage', async (req, res) => {
  const url = (req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: '올바른 URL이 아닙니다 (http:// 또는 https://로 시작해야 해요)' });
  }

  try {
    const pageTitle = await fetchPageTitle(url);
    const created = await createWebpageItem({ url, title: pageTitle });
    savePaper({
      itemKey: created.key,
      itemVersion: created.version,
      title: cleanTitle(created.data.title, created.data.itemType) || '(제목 없음)',
      authors: extractAuthors(created.data.creators),
      year: extractYear(created.data.date),
      attachmentKey: null,
      attachmentType: null,
      collections: created.data.collections || [],
    });
    res.status(201).json(getPaper(created.key));
  } catch (err) {
    console.error('[papers webpage] 생성 실패:', err.message);
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
  const { markdown } = req.body;
  if (typeof markdown !== 'string') {
    return res.status(400).json({ error: 'markdown(문자열)이 필요합니다' });
  }

  try {
    const existing = await findChildNoteByTag(req.params.key, MEMO_TAG);

    if (markdown.trim() === '') {
      // 내용을 전부 지우고 저장하면 빈 note를 남기지 않고 아예 삭제한다.
      if (existing) await deleteItem(existing.key, existing.version);
      return res.json({ noteKey: null });
    }

    const html = markdownToNoteHtml(markdown);
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
  if (!paper?.attachmentKey || paper.attachmentType !== 'pdf') {
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

// PDF가 없고 브라우저 커넥터가 저장한 HTML 스냅샷만 있는 아이템(예: 이 글이
// 아니라 그냥 웹페이지) 원문 패널용 — 그대로 서빙해서 iframe에 띄운다.
app.get('/api/papers/:key/html', async (req, res) => {
  const paper = getPaper(req.params.key);
  if (!paper?.attachmentKey || paper.attachmentType !== 'html') {
    return res.status(404).json({ error: 'HTML 스냅샷이 없습니다' });
  }
  try {
    const buffer = await downloadAttachmentFile(paper.attachmentKey);
    // Zotero는 브라우저 커넥터로 저장한 스냅샷을 zip으로 묶어서 저장한다
    // (linkMode: imported_url) — PK로 시작하면 zip이니 그 안의 html을 꺼낸다.
    const html = buffer.slice(0, 2).toString('ascii') === 'PK' ? extractHtmlFromZip(buffer) : buffer;
    // 스냅샷은 사용자가 Zotero로 저장해둔 신뢰 가능한 콘텐츠지만, 그래도
    // 스크립트/외부 요청은 막고 읽기용으로만 보여준다.
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Content-Security-Policy', "default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:;");
    res.send(html);
  } catch (err) {
    console.error('[papers html] 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function extractHtmlFromZip(buffer) {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntries().find((e) => /\.html?$/i.test(e.entryName));
  if (!entry) throw new Error('스냅샷 안에서 html 파일을 찾지 못했습니다');
  return entry.getData();
}

// --- 하이라이트(형광펜) --------------------------------------------------
// Zotero 표준 annotation 아이템(annotationType: highlight)으로만 저장한다.
// Folio 쪽 DB에는 아무것도 캐시하지 않는다 — 열 때마다 Zotero에서 라이브로
// 읽고, 만들거나 지울 때도 Zotero에 바로 쓴다. 그래서 Zotero 데스크톱/모바일
// 앱에서 칠한 하이라이트도 여기 그대로 나오고, 반대도 마찬가지다.

function toHighlight(item) {
  let position = {};
  try {
    position = JSON.parse(item.data.annotationPosition || '{}');
  } catch {
    position = {};
  }
  return {
    key: item.key,
    version: item.version,
    color: item.data.annotationColor || '#ffd400',
    text: item.data.annotationText || '',
    pageLabel: item.data.annotationPageLabel || '',
    sortIndex: item.data.annotationSortIndex || '',
    pageIndex: Number.isInteger(position.pageIndex) ? position.pageIndex : 0,
    rects: Array.isArray(position.rects) ? position.rects : [],
  };
}

function isValidRect(rect) {
  return (
    Array.isArray(rect) && rect.length === 4 && rect.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

// 하이라이트 API는 전부 "이 논문에 PDF 첨부가 있는가"부터 확인한다.
function getPdfPaper(itemKey) {
  const paper = getPaper(itemKey);
  return paper?.attachmentKey && paper.attachmentType === 'pdf' ? paper : null;
}

app.get('/api/papers/:key/highlights', async (req, res) => {
  const paper = getPdfPaper(req.params.key);
  if (!paper) return res.status(404).json({ error: 'PDF 첨부파일이 없습니다' });

  try {
    const annotations = await fetchAttachmentAnnotations(paper.attachmentKey);
    // 이번 범위는 텍스트 하이라이트뿐이라 다른 annotation 타입(메모/이미지/밑줄)은
    // 화면에 그리지 않고 건너뛴다 — 그려줄 방법이 없는 걸 억지로 사각형으로
    // 표시하면 Zotero 쪽 원본과 다르게 보인다.
    res.json(
      annotations
        .filter((item) => item.data.annotationType === 'highlight' && !item.data.deleted)
        .map(toHighlight)
        .filter((h) => h.rects.every(isValidRect) && h.rects.length > 0)
    );
  } catch (err) {
    console.error('[highlights list] 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/papers/:key/highlights', async (req, res) => {
  const paper = getPdfPaper(req.params.key);
  if (!paper) return res.status(404).json({ error: 'PDF 첨부파일이 없습니다' });

  const { pageIndex, rects, text, color, pageLabel, sortIndex } = req.body || {};
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    return res.status(400).json({ error: 'pageIndex(0 이상 정수)가 필요합니다' });
  }
  if (!Array.isArray(rects) || rects.length === 0 || !rects.every(isValidRect)) {
    return res.status(400).json({ error: 'rects([x1,y1,x2,y2] 배열)가 필요합니다' });
  }
  if (!HIGHLIGHT_COLORS.includes(color)) {
    return res.status(400).json({ error: '지원하지 않는 하이라이트 색상입니다' });
  }
  if (!SORT_INDEX_PATTERN.test(sortIndex || '')) {
    return res.status(400).json({ error: 'sortIndex 형식이 올바르지 않습니다' });
  }

  try {
    const created = await createHighlightAnnotation(paper.attachmentKey, {
      text: typeof text === 'string' ? text.slice(0, 5000) : '',
      color,
      pageLabel: String(pageLabel || pageIndex + 1).slice(0, 50),
      sortIndex,
      position: { pageIndex, rects },
    });
    res.status(201).json(toHighlight(created));
  } catch (err) {
    console.error('[highlights create] 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/papers/:key/highlights/:annotationKey', async (req, res) => {
  const paper = getPdfPaper(req.params.key);
  if (!paper) return res.status(404).json({ error: 'PDF 첨부파일이 없습니다' });

  try {
    const item = await fetchItem(req.params.annotationKey);
    // 지우기 전에 "정말 이 논문 PDF에 달린 하이라이트 annotation인지"를 확인한다.
    // 이 경로로 원본 서지 아이템이나 첨부파일 자체가 삭제되는 일은 없어야 한다.
    if (
      item.data.itemType !== 'annotation' ||
      item.data.annotationType !== 'highlight' ||
      item.data.parentItem !== paper.attachmentKey
    ) {
      return res.status(400).json({ error: '이 논문의 하이라이트가 아닙니다' });
    }
    await deleteItem(item.key, item.version);
    res.status(204).end();
  } catch (err) {
    console.error('[highlights delete] 실패:', err.message);
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
