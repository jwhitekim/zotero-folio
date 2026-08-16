// Zotero OAuth 1.0a 클라이언트. .env에 API 키를 직접 넣는 대신, 이 모듈로
// request token → 사용자 인가 → access token 교환을 수행해 API 키를 얻는다.
// (참고: https://www.zotero.org/support/dev/web_api/v3/oauth)

import crypto from 'node:crypto';

const REQUEST_TOKEN_URL = 'https://www.zotero.org/oauth/request';
const AUTHORIZE_URL = 'https://www.zotero.org/oauth/authorize';
const ACCESS_TOKEN_URL = 'https://www.zotero.org/oauth/access';

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function signatureBaseString(method, url, params) {
  const normalized = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&');
  return `${method}&${percentEncode(url)}&${percentEncode(normalized)}`;
}

function sign(method, url, params, consumerSecret, tokenSecret = '') {
  const baseString = signatureBaseString(method, url, params);
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

function authHeader(params) {
  return 'OAuth ' + Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(params[key])}"`)
    .join(', ');
}

function baseOauthParams(consumerKey) {
  return {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
  };
}

async function signedPost(url, params, consumerSecret, tokenSecret) {
  const signature = sign('POST', url, params, consumerSecret, tokenSecret);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader({ ...params, oauth_signature: signature }) },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Zotero OAuth 요청 실패 (${url}): ${res.status} ${text}`);
  }
  return Object.fromEntries(new URLSearchParams(text));
}

// 1단계: request token 획득.
export async function getRequestToken({ consumerKey, consumerSecret, callbackUrl }) {
  const params = { ...baseOauthParams(consumerKey), oauth_callback: callbackUrl };
  const result = await signedPost(REQUEST_TOKEN_URL, params, consumerSecret);
  return { oauthToken: result.oauth_token, oauthTokenSecret: result.oauth_token_secret };
}

// 2단계: 사용자를 이 URL로 리다이렉트해 인가받는다.
export function buildAuthorizeUrl({ oauthToken, appName }) {
  const qs = new URLSearchParams({
    oauth_token: oauthToken,
    library_access: '1',
    notes_access: '1',
    write_access: '1',
    name: appName,
  });
  return `${AUTHORIZE_URL}?${qs}`;
}

// 3단계: request token + verifier로 access token 교환.
export async function getAccessToken({ consumerKey, consumerSecret, oauthToken, oauthTokenSecret, oauthVerifier }) {
  const params = { ...baseOauthParams(consumerKey), oauth_token: oauthToken, oauth_verifier: oauthVerifier };
  const result = await signedPost(ACCESS_TOKEN_URL, params, consumerSecret, oauthTokenSecret);
  return {
    oauthToken: result.oauth_token,
    oauthTokenSecret: result.oauth_token_secret,
    userId: result.userID,
    username: result.username,
  };
}
