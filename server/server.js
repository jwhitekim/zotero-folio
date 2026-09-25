// Express 라우트: 논문 목록/상세, 논문별 구조화 노트, 컬렉션, sync.
// AI 요약/의미 검색/독립 메모는 걷어냈다 — 이 도구는 "Zotero 위 개인
// 아카이브 + 직접 정리하는 구조화 노트" 도구다. 노트 원문은 로컬에
// 캐시하지 않고 항상 Zotero에서 라이브로 읽는다 (db.js는 papers
// 메타데이터 캐시만 담당).
//
// 멀티유저: Zotero OAuth로 로그인하면 쿠키 세션이 발급되고, 요청마다 세션의
// userId로 유저를 찾아 요청 컨텍스트(context.js)에 심는다. db.js/zotero.js는
// 그 컨텍스트를 보고 "이 유저의" 데이터만 읽고 쓴다.

import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import express from 'express';
import session from 'express-session';
import multer from 'multer';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { marked } from 'marked';
import TurndownService from 'turndown';

import {
  getLastVersion,
  setLastVersion,
  getFailedItemKeys,
  setFailedItemKeys,
  savePaper,
  listPapers,
  getPaper,
  deletePaper,
  listPapersByCollection,
  upsertUserByZoteroId,
  findUserById,
} from './db.js';
import { runWithUser, currentUser } from './context.js';
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
  replaceAttachmentFile,
  fetchAttachmentAnnotations,
  createHighlightAnnotation,
  createInkAnnotation,
} from './zotero.js';
import { getRequestToken, buildAuthorizeUrl, getAccessToken } from './oauth1.js';

const app = express();
app.use(express.json());

// 첨부파일 교체 업로드용 — 파일을 메모리에 받아 그대로 Zotero로 올린다(디스크에
// 남기지 않음). GoodNotes로 필기한 PDF가 커질 수 있어 상한을 넉넉히 잡는다.
const ATTACHMENT_MAX_BYTES = 200 * 1024 * 1024; // 200MB
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ATTACHMENT_MAX_BYTES },
});

const PORT = process.env.PORT || 3002;
const WEB_DIST = path.join(process.cwd(), 'web', 'dist');
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const CONSUMER_KEY = process.env.ZOTERO_CLIENT_KEY;
const CONSUMER_SECRET = process.env.ZOTERO_CLIENT_SECRET;

// --- 세션 (쿠키 기반) -----------------------------------------------------
// 세션에는 folio_users.id만 담고, Zotero 토큰 같은 실제 값은 매 요청 Supabase에서
// 읽는다 (로그아웃/토큰 갱신이 즉시 반영되도록).
//
// 저장소는 express-session 기본 MemoryStore를 쓴다 — 별도 세션 스토어 의존성을
// 더하지 않기 위한 선택이다. 대신 서버를 재시작하면 세션이 사라져 다시
// 로그인해야 한다 (Zotero 토큰은 Supabase에 남아 있으므로 재로그인은 클릭 두 번).
const IS_HTTPS = APP_BASE_URL.startsWith('https://');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('[session] SESSION_SECRET이 없어 임시 키를 생성했습니다 — 재시작하면 로그인 세션이 풀립니다');
}
// 리버스 프록시(https 종단) 뒤에 있으면 X-Forwarded-Proto를 신뢰해야
// "이 연결이 https인지"를 제대로 판단할 수 있다.
if (IS_HTTPS) app.set('trust proxy', 1);

app.use(
  session({
    name: 'folio.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax', // OAuth 콜백이 외부(zotero.org)에서 돌아오므로 strict는 못 쓴다
      // 'auto' = 실제 연결이 https일 때만 secure. APP_BASE_URL이 https라고
      // 무조건 secure를 켜면, 같은 빌드를 로컬 http://localhost로 띄웠을 때
      // 브라우저가 쿠키를 버려서 로그인이 영영 완료되지 않는다.
      secure: 'auto',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30일
    },
  })
);

const MEMO_TAG = 'zotero-insight:memo';

// Zotero 기본 하이라이트 팔레트 (web/src/utils/pdf-highlight.js와 같은 값).
// 클라이언트를 못 믿고 서버가 따로 한 번 더 검사해야 하므로 목록을 여기에도 둔다.
const HIGHLIGHT_COLORS = ['#ffd400', '#ff6666', '#5fb236', '#2ea8e5', '#a28ae5'];
// Zotero 스키마가 요구하는 sortIndex 형식 — "페이지|문자오프셋|위에서부터의 거리".
const SORT_INDEX_PATTERN = /^\d{5}\|\d{6}\|\d{5}$/;
// 필기(ink) 색/굵기는 두 도구가 같은 ink 파이프라인을 공유한다 — 펜과
// 프리핸드 형광펜. 색으로 어느 도구인지 가르고, 색에 맞는 굵기 목록만 허용한다
// (web/src/utils/pdf-ink.js와 같은 값).
const INK_COLOR = '#1a1a1a';
const INK_WIDTHS = [1, 2, 4];
const HIGHLIGHTER_INK_COLOR = '#ffd54f';
const HIGHLIGHTER_WIDTHS = [8, 12, 18];
const INK_COLORS = [INK_COLOR, HIGHLIGHTER_INK_COLOR];

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

// --- SSRF 방어 -------------------------------------------------------------
// 웹페이지 추가는 서버가 사용자가 준 URL로 직접 요청을 날린다. 스킴만 보고
// 통과시키면 인증된 사용자가 서버를 통해 내부망(127.0.0.1, 클라우드 메타데이터
// 169.254.169.254, 사설 대역 등)을 찔러볼 수 있다 — 멀티유저가 된 지금 더
// 위험하다. 그래서 호스트를 실제 IP로 해석한 뒤 그 IP가 내부/특수 대역이면
// 거부하고, 리다이렉트도 홉마다 같은 검증을 반복한다. 외부 패키지 없이
// node 표준 모듈(dns/net/http/https)만 쓴다.

const SSRF_MAX_REDIRECTS = 5;
const SSRF_MAX_BYTES = 1024 * 1024; // 1MB — 제목은 <head>에 있어 이 정도면 충분
const SSRF_TIMEOUT_MS = 5000;

class BlockedAddressError extends Error {}

function isBlockedIpv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8 (사설)
  if (a === 127) return true; // 127/8 (루프백)
  if (a === 169 && b === 254) return true; // 169.254/16 (링크로컬 — 클라우드 메타데이터)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 (사설)
  if (a === 192 && b === 168) return true; // 192.168/16 (사설)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 (CGNAT)
  return false;
}

function isBlockedIp(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) return isBlockedIpv4(ip);
  if (fam === 6) {
    const lower = ip.toLowerCase();
    // IPv4-매핑(::ffff:a.b.c.d)은 안쪽 v4 기준으로 판정한다.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIpv4(mapped[1]);
    if (lower === '::1' || lower === '::') return true; // 루프백 / 미지정
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 (ULA)
    if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 (링크로컬)
    return false;
  }
  return true; // IP 형식이 아니면(파싱 실패) 막는 쪽으로
}

// dns.lookup을 감싸 "내부망으로 해석되는 호스트"를 걸러내는 커스텀 lookup.
// http/https 요청의 lookup 옵션으로 넘기면, 실제 소켓이 붙는 주소가 바로 이
// 함수가 돌려준 (검증 통과한) 주소가 되므로 DNS rebinding(검증 시점과 접속
// 시점 사이 IP가 바뀌는 것)도 막힌다.
function safeLookup(hostname, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return cb(err);
    const list = Array.isArray(addresses) ? addresses : [addresses];
    const ok = list.find((a) => !isBlockedIp(a.address));
    if (!ok) return cb(new BlockedAddressError(`내부망/사설 주소로 해석되는 호스트입니다: ${hostname}`));
    cb(null, ok.address, ok.family);
  });
}

// 사용자가 준 URL이 내부망으로 해석되는지 미리 검사한다 (라우트에서 400 응답용).
async function assertPublicUrl(url) {
  const { hostname } = new URL(url);
  await new Promise((resolve, reject) => {
    safeLookup(hostname, {}, (err) => (err ? reject(err) : resolve()));
  });
}

// 리다이렉트를 자동 추적하지 않고 홉마다 직접 검증하며 따라간다. 각 요청은
// safeLookup으로 내부망 접속을 차단하고, 바디는 1MB로 제한한다.
function safeGet(urlStr, redirectsLeft) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlStr);
    } catch {
      return reject(new Error('URL 파싱 실패'));
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return reject(new BlockedAddressError('http/https만 허용됩니다'));
    }
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(
      url,
      {
        lookup: safeLookup,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Folio/1.0)' },
        timeout: SSRF_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume(); // 리다이렉트 바디는 버린다
          if (redirectsLeft <= 0) return reject(new Error('리다이렉트가 너무 많습니다'));
          const next = new URL(res.headers.location, url).toString();
          return resolve(safeGet(next, redirectsLeft - 1));
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return resolve(null);
        }
        let size = 0;
        const chunks = [];
        res.on('data', (c) => {
          chunks.push(c);
          size += c.length;
          if (size > SSRF_MAX_BYTES) {
            res.destroy();
            resolve(Buffer.concat(chunks).toString('utf8'));
          }
        });
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      }
    );
    req.on('timeout', () => req.destroy(new Error('요청 시간이 초과되었습니다')));
    req.on('error', reject);
  });
}

// 웹페이지 추가 시 제목을 직접 입력 안 하면 페이지 <title> 태그로 채운다.
// 실패해도(타임아웃, 4xx, 내부망 리다이렉트 등) 조용히 넘어가고 URL 자체를
// 제목으로 쓴다 — 이 도구의 역할은 "Zotero에 아이템을 만드는 것"까지고,
// 본문 파싱은 하지 않는다.
async function fetchPageTitle(url) {
  try {
    const html = await safeGet(url, SSRF_MAX_REDIRECTS);
    if (!html) return null;
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
  const lastVersion = await getLastVersion();
  const { items, newVersion } = await fetchChangedTopItems(lastVersion);

  // 기존 아이템에 첨부파일만 새로 붙은 경우 부모 아이템 자체는 top-level
  // since 조회에 안 걸린다 (부모 version이 안 바뀜) — 별도로 찾아서 합친다.
  const topKeys = new Set(items.map((i) => i.key));

  // 지난 동기화에서 캐싱에 실패한 아이템들은 그 뒤로 다시 안 바뀌면 since
  // 조회에 영영 안 걸린다 — lastVersion이 이미 넘어갔기 때문. 버전과 무관하게
  // 이번에도 재조회해서 다시 시도한다. 이 재시도 결과에 따라 실패 목록을
  // 갱신하므로, 시작 집합은 이전 실패 목록으로 잡는다.
  const failedKeys = new Set(await getFailedItemKeys());
  for (const key of failedKeys) {
    if (topKeys.has(key)) continue;
    try {
      const item = await fetchItem(key);
      items.push(item);
      topKeys.add(key);
    } catch (err) {
      // 재조회 자체가 실패하면 다음 번에도 다시 시도하도록 실패 목록에 남겨둔다.
      console.error(`[sync] 실패 항목 재조회 실패: ${key} - ${err.message}`);
    }
  }
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
      await savePaper({
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
      // 성공했으니 실패 목록에서 뺀다 (이번에 재시도해서 성공한 경우 포함).
      failedKeys.delete(item.key);
    } catch (err) {
      console.error(`[sync] 캐시 실패: ${item.data.title} - ${err.message}`);
      // 다음 동기화 때 버전과 무관하게 다시 시도하도록 실패 목록에 넣는다.
      failedKeys.add(item.key);
    }
  }

  // Zotero에서 삭제된 아이템은 로컬 캐시에도 유령으로 남지 않도록 함께 지운다.
  let removed = 0;
  try {
    const deletedKeys = await fetchDeletedItemKeys(lastVersion);
    for (const key of deletedKeys) {
      await deletePaper(key);
      removed++;
      // Zotero에서 지워진 아이템은 더 이상 재시도 대상이 아니므로 큐에서도 뺀다
      // (없으면 무시) — 사라진 키를 매번 404로 재조회하지 않도록.
      failedKeys.delete(key);
    }
  } catch (err) {
    console.error(`[sync] 삭제 항목 조회 실패: ${err.message}`);
  }

  await setFailedItemKeys([...failedKeys]);
  await setLastVersion(newVersion);
  return { checked: items.length, cached, removed };
}

// --- Zotero OAuth 로그인 --------------------------------------------------
// request token과 secret은 /oauth/login → /oauth/callback 사이에서만 잠깐
// 필요하다. 멀티유저이므로 모듈 전역이 아니라 요청자의 세션에 담는다 — 전역에
// 두면 두 사람이 동시에 로그인할 때 서로의 request token을 덮어쓴다.

app.get('/oauth/login', async (req, res) => {
  try {
    const { oauthToken, oauthTokenSecret } = await getRequestToken({
      consumerKey: CONSUMER_KEY,
      consumerSecret: CONSUMER_SECRET,
      callbackUrl: `${APP_BASE_URL}/oauth/callback`,
    });
    req.session.pendingOAuth = { token: oauthToken, secret: oauthTokenSecret };
    res.redirect(buildAuthorizeUrl({ oauthToken, appName: 'Folio' }));
  } catch (err) {
    console.error('[oauth] request token 실패:', err.message);
    res.status(500).send('Zotero 로그인 시작 실패: ' + err.message);
  }
});

app.get('/oauth/callback', async (req, res) => {
  const { oauth_token: oauthToken, oauth_verifier: oauthVerifier } = req.query;
  const pending = req.session.pendingOAuth;
  if (!pending || pending.token !== oauthToken) {
    return res.status(400).send('OAuth 세션이 만료되었습니다. 다시 시도해주세요.');
  }
  try {
    const result = await getAccessToken({
      consumerKey: CONSUMER_KEY,
      consumerSecret: CONSUMER_SECRET,
      oauthToken,
      oauthTokenSecret: pending.secret,
      oauthVerifier,
    });
    // 문서에 따라 oauth_token_secret을 Zotero-API-Key로 사용한다.
    // 같은 Zotero 계정으로 다시 로그인하면 기존 유저 행의 토큰만 갱신된다
    // (papers 캐시는 그대로 유지).
    const user = await upsertUserByZoteroId({
      zoteroUserId: result.userId,
      zoteroUsername: result.username,
      zoteroApiKey: result.oauthTokenSecret,
    });
    // 세션 고정(session fixation) 방지 — 로그인 시점에 세션 ID를 새로 뽑는다.
    // 여기서 세션이 통째로 비워지므로 pendingOAuth도 함께 사라진다.
    req.session.regenerate((err) => {
      if (err) {
        console.error('[oauth] 세션 재발급 실패:', err.message);
        return res.status(500).send('로그인 세션 생성 실패: ' + err.message);
      }
      req.session.userId = user.id;
      req.session.save(() => res.redirect('/'));
    });
  } catch (err) {
    console.error('[oauth] access token 교환 실패:', err.message);
    res.status(500).send('Zotero 로그인 완료 실패: ' + err.message);
  }
});

// 세션의 userId로 유저를 찾아 요청 컨텍스트에 심는다. 여기서는 막지 않고
// (로그인 화면용 /api/auth/status도 지나가야 하므로) 컨텍스트만 채운다.
app.use('/api', async (req, res, next) => {
  if (!req.session.userId) return next();
  try {
    const user = await findUserById(req.session.userId);
    if (!user) {
      // 유저 행이 사라진 세션(예: Supabase에서 삭제) — 세션도 버린다.
      return req.session.destroy(() => next());
    }
    runWithUser(user, next);
  } catch (err) {
    console.error('[auth] 유저 조회 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/status', (req, res) => {
  const user = currentUser();
  res.json({ connected: !!user, username: user?.zoteroUsername || null });
});

// 로그아웃은 세션만 끊는다 — Supabase에 저장된 Zotero 토큰과 papers 캐시는
// 남겨둬서 다시 로그인하면 동기화 없이 바로 라이브러리가 보인다.
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('folio.sid');
    res.json({ connected: false });
  });
});

// 로그인하지 않았으면 나머지 /api 라우트는 전부 막는다.
app.use('/api', (req, res, next) => {
  if (!currentUser()) {
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

app.get('/api/papers', async (req, res) => {
  try {
    res.json(await listPapers(req.query.q));
  } catch (err) {
    console.error('[papers list] 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/papers/:key', async (req, res) => {
  try {
    const paper = await getPaper(req.params.key);
    if (!paper) return res.status(404).json({ error: '논문을 찾을 수 없습니다' });

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

  // 스킴만으로는 부족하다 — 호스트가 실제로 내부망/사설 IP로 해석되면 거부(SSRF).
  try {
    await assertPublicUrl(url);
  } catch {
    return res.status(400).json({ error: '내부망/사설 주소로는 웹페이지를 추가할 수 없습니다' });
  }

  try {
    const pageTitle = await fetchPageTitle(url);
    const created = await createWebpageItem({ url, title: pageTitle });
    await savePaper({
      itemKey: created.key,
      itemVersion: created.version,
      title: cleanTitle(created.data.title, created.data.itemType) || '(제목 없음)',
      authors: extractAuthors(created.data.creators),
      year: extractYear(created.data.date),
      attachmentKey: null,
      attachmentType: null,
      collections: created.data.collections || [],
    });
    res.status(201).json(await getPaper(created.key));
  } catch (err) {
    console.error('[papers webpage] 생성 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 논문(Zotero 원본 아이템) 자체를 삭제한다. Zotero 휴지통으로 이동하며,
// 자식 노트/첨부파일도 함께 딸려간다. 로컬 papers 캐시에서도 지운다.
app.delete('/api/papers/:key', async (req, res) => {
  try {
    if (!(await getPaper(req.params.key))) return res.status(404).json({ error: '논문을 찾을 수 없습니다' });

    const item = await fetchItem(req.params.key);
    await deleteItem(req.params.key, item.version);
    await deletePaper(req.params.key);
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
  try {
    const paper = await getPaper(req.params.key);
    if (!paper?.attachmentKey || paper.attachmentType !== 'pdf') {
      return res.status(404).json({ error: 'PDF 첨부파일이 없습니다' });
    }
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
  try {
    const paper = await getPaper(req.params.key);
    if (!paper?.attachmentKey || paper.attachmentType !== 'html') {
      return res.status(404).json({ error: 'HTML 스냅샷이 없습니다' });
    }
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

// plain .html 한 장을 Zotero 스냅샷과 호환되는 zip으로 감싼다. 서빙 쪽
// extractHtmlFromZip이 확장자로 html 엔트리를 찾으므로 엔트리명은 index.html로 둔다.
function wrapHtmlInZip(htmlBuffer) {
  const zip = new AdmZip();
  zip.addFile('index.html', htmlBuffer);
  return zip.toBuffer();
}

// 기존 첨부파일(PDF 또는 HTML 스냅샷)의 파일 내용을 새 파일로 교체한다.
// 되돌릴 수 없이 사용자의 Zotero 라이브러리 파일을 덮어쓰는 작업이라, 클라이언트
// 확인 다이얼로그(web)와 별개로 서버도 (1) 논문/첨부 존재, (2) 업로드된 파일이
// 기존 첨부 타입과 맞는지(PDF는 %PDF 매직, HTML은 zip으로 래핑)를 검사한다.
// 서지정보 필드는 건드리지 않고 파일 바이너리만 바꾼다.
// multer는 멀티파트 바디를 스트림으로 비동기 파싱하는데, 이 과정에서
// AsyncLocalStorage 기반 로그인 컨텍스트(runWithUser)가 끊겨 파싱이 끝난 뒤
// 이어지는 핸들러에서 currentUser()가 null이 돼버린다. 파싱 전에 유저를
// 붙잡아뒀다가 파싱이 끝나면 컨텍스트를 다시 심어준다.
function withPreservedUserContext(middleware) {
  return (req, res, next) => {
    const user = currentUser();
    middleware(req, res, (err) => {
      if (err) return next(err);
      runWithUser(user, next);
    });
  };
}

app.post('/api/papers/:key/attachment', withPreservedUserContext(attachmentUpload.single('file')), async (req, res) => {
  try {
    const paper = await getPaper(req.params.key);
    if (!paper) return res.status(404).json({ error: '논문을 찾을 수 없습니다' });
    if (!paper.attachmentKey || !paper.attachmentType) {
      return res.status(404).json({ error: '교체할 첨부파일이 없습니다' });
    }
    if (!req.file) {
      return res.status(400).json({ error: '업로드할 파일이 없습니다' });
    }

    let buffer = req.file.buffer;
    if (paper.attachmentType === 'pdf') {
      if (buffer.slice(0, 5).toString('ascii') !== '%PDF-') {
        return res.status(400).json({ error: 'PDF 파일이 아닙니다 (PDF 첨부는 PDF로만 교체할 수 있어요)' });
      }
    } else if (paper.attachmentType === 'html') {
      // 이미 zip(PK 매직)이면 그대로, plain html이면 스냅샷 zip으로 감싼다.
      if (buffer.slice(0, 2).toString('ascii') !== 'PK') {
        buffer = wrapHtmlInZip(buffer);
      }
    } else {
      return res.status(400).json({ error: '교체를 지원하지 않는 첨부 타입입니다' });
    }

    await replaceAttachmentFile(paper.attachmentKey, buffer);
    res.json({ ok: true });
  } catch (err) {
    console.error('[papers attachment] 교체 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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
async function getPdfPaper(itemKey) {
  const paper = await getPaper(itemKey);
  return paper?.attachmentKey && paper.attachmentType === 'pdf' ? paper : null;
}

app.get('/api/papers/:key/highlights', async (req, res) => {
  try {
    const paper = await getPdfPaper(req.params.key);
    if (!paper) return res.status(404).json({ error: 'PDF 첨부파일이 없습니다' });

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
    const paper = await getPdfPaper(req.params.key);
    if (!paper) return res.status(404).json({ error: 'PDF 첨부파일이 없습니다' });

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
  try {
    const paper = await getPdfPaper(req.params.key);
    if (!paper) return res.status(404).json({ error: 'PDF 첨부파일이 없습니다' });

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

// --- 필기(ink) ---------------------------------------------------------
// 하이라이트와 완전히 같은 저장 원칙 — Zotero 표준 annotation 아이템
// (annotationType: ink)으로만 저장하고 로컬 DB에는 캐시하지 않는다. 하이라이트
// 라우트와 병렬로 두는 이유: position 구조(paths/width)와 검증 규칙이 서로 달라서,
// 한 라우트에 annotationType 분기를 얹으면 각각의 검증이 뒤엉켜 오히려 복잡해진다.

function toInk(item) {
  let position = {};
  try {
    position = JSON.parse(item.data.annotationPosition || '{}');
  } catch {
    position = {};
  }
  return {
    key: item.key,
    version: item.version,
    color: item.data.annotationColor || INK_COLOR,
    pageLabel: item.data.annotationPageLabel || '',
    sortIndex: item.data.annotationSortIndex || '',
    pageIndex: Number.isInteger(position.pageIndex) ? position.pageIndex : 0,
    width: typeof position.width === 'number' && Number.isFinite(position.width) ? position.width : 2,
    paths: Array.isArray(position.paths) ? position.paths : [],
  };
}

// 스트로크 하나: 짝수 길이의 유한한 숫자 배열([x1,y1,x2,y2,...]).
function isValidPath(path) {
  return (
    Array.isArray(path) &&
    path.length >= 2 &&
    path.length % 2 === 0 &&
    path.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

app.get('/api/papers/:key/ink', async (req, res) => {
  try {
    const paper = await getPdfPaper(req.params.key);
    if (!paper) return res.status(404).json({ error: 'PDF 첨부파일이 없습니다' });

    const annotations = await fetchAttachmentAnnotations(paper.attachmentKey);
    res.json(
      annotations
        .filter((item) => item.data.annotationType === 'ink' && !item.data.deleted)
        .map(toInk)
        .filter((ink) => ink.paths.length > 0 && ink.paths.every(isValidPath))
    );
  } catch (err) {
    console.error('[ink list] 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/papers/:key/ink', async (req, res) => {
  const { pageIndex, paths, width, color, pageLabel, sortIndex } = req.body || {};
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    return res.status(400).json({ error: 'pageIndex(0 이상 정수)가 필요합니다' });
  }
  if (!Array.isArray(paths) || paths.length === 0 || !paths.every(isValidPath)) {
    return res.status(400).json({ error: 'paths([x1,y1,x2,y2,...] 배열)가 필요합니다' });
  }
  if (!INK_COLORS.includes(color)) {
    return res.status(400).json({ error: '지원하지 않는 필기 색상입니다' });
  }
  // 색으로 도구를 가른 뒤, 그 도구가 허용하는 굵기인지만 본다 — 펜에 형광펜
  // 굵기를 넣거나 그 반대인 경우를 막는다.
  const allowedWidths = color === HIGHLIGHTER_INK_COLOR ? HIGHLIGHTER_WIDTHS : INK_WIDTHS;
  if (!allowedWidths.includes(width)) {
    return res.status(400).json({ error: '지원하지 않는 필기 굵기입니다' });
  }
  if (!SORT_INDEX_PATTERN.test(sortIndex || '')) {
    return res.status(400).json({ error: 'sortIndex 형식이 올바르지 않습니다' });
  }

  try {
    const paper = await getPdfPaper(req.params.key);
    if (!paper) return res.status(404).json({ error: 'PDF 첨부파일이 없습니다' });

    const created = await createInkAnnotation(paper.attachmentKey, {
      color,
      pageLabel: String(pageLabel || pageIndex + 1).slice(0, 50),
      sortIndex,
      position: { pageIndex, width, paths },
    });
    res.status(201).json(toInk(created));
  } catch (err) {
    console.error('[ink create] 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/papers/:key/ink/:annotationKey', async (req, res) => {
  try {
    const paper = await getPdfPaper(req.params.key);
    if (!paper) return res.status(404).json({ error: 'PDF 첨부파일이 없습니다' });

    const item = await fetchItem(req.params.annotationKey);
    // 지우기 전에 "정말 이 논문 PDF에 달린 필기 annotation인지"를 확인한다.
    if (
      item.data.itemType !== 'annotation' ||
      item.data.annotationType !== 'ink' ||
      item.data.parentItem !== paper.attachmentKey
    ) {
      return res.status(400).json({ error: '이 논문의 필기가 아닙니다' });
    }
    await deleteItem(item.key, item.version);
    res.status(204).end();
  } catch (err) {
    console.error('[ink delete] 실패:', err.message);
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

app.get('/api/collections/:key/papers', async (req, res) => {
  try {
    res.json(await listPapersByCollection(req.params.key));
  } catch (err) {
    console.error('[collection papers] 실패:', err.message);
    res.status(500).json({ error: err.message });
  }
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
