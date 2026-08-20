// Zotero Web API 클라이언트.
// 읽기: 변경된 아이템 조회(버전 기반 증분), 자식 아이템/컬렉션 조회, PDF 다운로드
// 쓰기: note 생성/수정만 지원한다. 원본 아이템의 title/author/PDF 등 서지정보
//       필드를 수정하는 함수는 의도적으로 만들지 않는다 (CLAUDE.md 제약).
//       단, 이 도구가 직접 만든 메모 note(태그로 식별)는 생성/수정 둘 다 한다.

import crypto from 'node:crypto';
import { getZoteroAuth } from './db.js';

const BASE_URL = 'https://api.zotero.org';

function requireAuth() {
  const auth = getZoteroAuth();
  if (!auth) throw new Error('Zotero 계정이 연결되지 않았습니다 — /oauth/login으로 로그인하세요');
  return auth;
}

function headers(extra = {}) {
  return {
    'Zotero-API-Key': requireAuth().token,
    'Zotero-API-Version': '3',
    ...extra,
  };
}

function writeToken() {
  // Zotero-Write-Token은 5~32자만 허용 (UUID는 하이픈 포함 36자라 그대로 못 씀)
  return crypto.randomUUID().replace(/-/g, '');
}

function userPrefix() {
  return `${BASE_URL}/users/${requireAuth().userId}`;
}

// 마지막 동기화 버전 이후 바뀐 최상위 아이템을 전부 가져온다 (페이지네이션 처리).
// 반환값: { items, newVersion }
export async function fetchChangedTopItems(sinceVersion) {
  const items = [];
  let newVersion = sinceVersion;
  let url = `${userPrefix()}/items/top?since=${sinceVersion}&format=json&limit=100`;

  while (url) {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      throw new Error(`Zotero items/top 조회 실패: ${res.status} ${res.statusText}`);
    }

    const lastModified = res.headers.get('Last-Modified-Version');
    if (lastModified) newVersion = Math.max(newVersion, Number(lastModified));

    const page = await res.json();
    items.push(...page);

    const link = res.headers.get('Link');
    const nextMatch = link && link.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return { items, newVersion };
}

// 마지막 동기화 버전 이후 바뀐 첨부파일들의 부모 아이템 key를 가져온다.
// 기존 아이템에 첨부파일만 새로 붙인 경우 부모 아이템 자체의 version은
// 바뀌지 않아 /items/top?since=만으로는 놓친다 — 이걸로 보완한다.
export async function fetchChangedAttachmentParentKeys(sinceVersion) {
  const parentKeys = new Set();
  let url = `${userPrefix()}/items?since=${sinceVersion}&itemType=attachment&format=json&limit=100`;

  while (url) {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      throw new Error(`Zotero 첨부파일 변경 조회 실패: ${res.status} ${res.statusText}`);
    }

    const page = await res.json();
    for (const item of page) {
      if (item.data.parentItem) parentKeys.add(item.data.parentItem);
    }

    const link = res.headers.get('Link');
    const nextMatch = link && link.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return [...parentKeys];
}

// 마지막 동기화 버전 이후 Zotero에서 삭제된 최상위 아이템의 key 목록을 가져온다.
// /items/top?since=만으로는 삭제가 감지되지 않아(삭제된 아이템은 그냥 응답에서
// 빠짐), 로컬 캐시에 유령 아이템이 남는 것을 막으려면 별도로 확인해야 한다.
export async function fetchDeletedItemKeys(sinceVersion) {
  const url = `${userPrefix()}/deleted?since=${sinceVersion}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Zotero deleted 조회 실패: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.items || [];
}

// 단일 아이템 메타데이터 조회 (논문 상세 페이지용).
export async function fetchItem(itemKey) {
  const url = `${userPrefix()}/items/${itemKey}?format=json`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Zotero 아이템 조회 실패: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// 아이템의 자식(첨부파일, note)을 전부 가져온다.
export async function fetchChildren(itemKey) {
  const url = `${userPrefix()}/items/${itemKey}/children?format=json`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Zotero children 조회 실패: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// 자식 첨부파일 중 원문 패널이 보여줄 수 있는 걸 찾는다 — PDF를 우선하고,
// 없으면 HTML 스냅샷(브라우저 커넥터로 저장한 웹페이지)을 대신 쓴다.
// 둘 다 없으면 null.
export async function findReadableAttachment(itemKey) {
  const children = await fetchChildren(itemKey);
  const attachments = children.filter((child) => child.data.itemType === 'attachment');

  const pdf = attachments.find((a) => a.data.contentType === 'application/pdf');
  if (pdf) return { key: pdf.data.key, type: 'pdf' };

  const html = attachments.find((a) => a.data.contentType === 'text/html');
  if (html) return { key: html.data.key, type: 'html' };

  return null;
}

// 자식 note 중 특정 태그가 붙은 것 하나를 찾는다 (논문별 메모용). 없으면 null.
// 반환값은 다른 note 함수들과 동일하게 전체 Zotero item envelope({key, version, data}).
export async function findChildNoteByTag(itemKey, tag) {
  const children = await fetchChildren(itemKey);
  return (
    children.find(
      (child) =>
        child.data.itemType === 'note' &&
        child.data.tags?.some((t) => t.tag === tag)
    ) ?? null
  );
}

// PDF 첨부파일 바이너리를 다운로드한다 (브라우저로 그대로 스트리밍할 때 사용).
export async function downloadAttachmentFile(attachmentKey) {
  const url = `${userPrefix()}/items/${attachmentKey}/file`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Zotero PDF 다운로드 실패: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// child note 생성 (parentItem에 귀속).
export async function createChildNote(parentItemKey, noteHtml, tags) {
  const url = `${userPrefix()}/items`;
  const body = [
    {
      itemType: 'note',
      parentItem: parentItemKey,
      note: noteHtml,
      tags: tags.map((tag) => ({ tag })),
    },
  ];

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers(),
      'Zotero-Write-Token': writeToken(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Zotero note 생성 실패: ${res.status} ${res.statusText}`);
  }

  const result = await res.json();
  const created = result.successful?.['0'];
  if (!created) {
    throw new Error(`Zotero note 생성 실패: ${JSON.stringify(result.failed)}`);
  }
  return created; // {key, version, data} — updateNote/fetchItem과 동일한 형태
}

// 웹페이지를 새 Zotero 아이템(itemType: webpage)으로 만든다. Folio가 직접
// 여는 유일한 "새 아이템 생성" 창구 — 이후 title/author 등은 Zotero(또는
// Zotero Connector)에서 관리하는 게 원칙이고, Folio는 여기서 만든 뒤로는
// 건드리지 않는다.
export async function createWebpageItem({ url, title }) {
  const body = [
    {
      itemType: 'webpage',
      title: title || url,
      url,
      accessDate: new Date().toISOString(),
    },
  ];

  const res = await fetch(`${userPrefix()}/items`, {
    method: 'POST',
    headers: {
      ...headers(),
      'Zotero-Write-Token': writeToken(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Zotero 웹페이지 아이템 생성 실패: ${res.status} ${res.statusText}`);
  }

  const result = await res.json();
  const created = result.successful?.['0'];
  if (!created) {
    throw new Error(`Zotero 웹페이지 아이템 생성 실패: ${JSON.stringify(result.failed)}`);
  }
  return created; // {key, version, data}
}

// 이 도구가 만든 note를 수정한다 (부분 업데이트). 낙관적 잠금을 위해
// version이 반드시 필요하다.
export async function updateNote(noteKey, version, noteHtml) {
  const url = `${userPrefix()}/items/${noteKey}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...headers({ 'If-Unmodified-Since-Version': String(version) }),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ note: noteHtml }),
  });

  if (!res.ok) {
    throw new Error(`Zotero note 수정 실패: ${res.status} ${res.statusText}`);
  }
  return fetchItem(noteKey);
}

// note를 삭제한다 (아이템 자체는 Zotero 휴지통으로 이동, 원한다면 거기서 복구 가능).
export async function deleteItem(itemKey, version) {
  const url = `${userPrefix()}/items/${itemKey}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: headers({ 'If-Unmodified-Since-Version': String(version) }),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Zotero 아이템 삭제 실패: ${res.status} ${res.statusText}`);
  }
}

// 라이브러리 컬렉션 목록.
export async function listCollections() {
  const url = `${userPrefix()}/collections?format=json&limit=100`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Zotero 컬렉션 조회 실패: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
