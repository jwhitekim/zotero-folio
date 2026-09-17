// 요청별 "지금 누구인가" 컨텍스트.
//
// 멀티유저가 되면서 db.js(papers/sync_state 조회)와 zotero.js(Zotero API 호출)가
// 전부 "어느 유저인지"를 알아야 한다. 그 값을 모든 함수에 인자로 흘려보내면
// 호출부 수십 곳을 고쳐야 하고, 한 군데만 빼먹어도 다른 사람 데이터를 읽는
// 사고가 난다. 그래서 Node 표준 AsyncLocalStorage로 요청 스코프에 한 번만
// 심어두고, db.js/zotero.js가 거기서 읽어 쓴다.
//
// 이 프로젝트에는 요청과 무관하게 도는 백그라운드 작업이 없다 (sync도 요청으로
// 시작한다) — 컨텍스트가 비어 있으면 그건 버그이므로 requireUser()가 던진다.

import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

// user: { id, zoteroUserId, zoteroUsername, zoteroApiKey }
export function runWithUser(user, fn) {
  return storage.run({ user }, fn);
}

export function currentUser() {
  return storage.getStore()?.user ?? null;
}

export function requireUser() {
  const user = currentUser();
  if (!user) throw new Error('로그인이 필요합니다 — /oauth/login으로 Zotero 계정을 연결하세요');
  return user;
}
