// Zotero Web API 클라이언트.
// 읽기: 변경된 아이템 조회(버전 기반 증분), 자식 아이템/컬렉션 조회, PDF 다운로드,
//       PDF 첨부의 annotation(하이라이트) 조회
// 쓰기: note 생성/수정과 annotation(하이라이트) 생성/삭제만 지원한다. 원본
//       아이템의 title/author 등 서지정보 필드를 수정하는 함수는 의도적으로
//       만들지 않는다 (CLAUDE.md 제약). 단, 이 도구가 직접 만든 메모 note(태그로
//       식별)는 생성/수정 둘 다 한다. 하이라이트도 "새 아이템 생성"이라
//       첨부파일 아이템 자체는 건드리지 않는다.
//       예외 — replaceAttachmentFile: 기존 첨부파일(PDF/HTML 스냅샷)의 "파일
//       바이너리"만 새 파일로 교체한다(주로 GoodNotes로 필기한 PDF를 되돌려
//       올리는 워크플로우, docs/design.md 참고). 서지정보 필드나 첨부 아이템의
//       메타데이터 구조는 그대로 두고 파일 내용만 덮어쓰는, 명시적으로 승인된
//       유일한 쓰기 예외다.

import crypto from 'node:crypto';
import { requireUser } from './context.js';

const BASE_URL = 'https://api.zotero.org';

// 멀티유저이므로 "누구의 Zotero 라이브러리인지"는 요청 컨텍스트에서 읽는다
// (server.js가 세션에서 유저를 찾아 컨텍스트에 심어둔다). 모듈 전역에 토큰을
// 들고 있으면 동시 접속 시 다른 사람 라이브러리를 읽게 된다.
function headers(extra = {}) {
  return {
    'Zotero-API-Key': requireUser().zoteroApiKey,
    'Zotero-API-Version': '3',
    ...extra,
  };
}

function writeToken() {
  // Zotero-Write-Token은 5~32자만 허용 (UUID는 하이픈 포함 36자라 그대로 못 씀)
  return crypto.randomUUID().replace(/-/g, '');
}

function userPrefix() {
  return `${BASE_URL}/users/${requireUser().zoteroUserId}`;
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

// 기존 첨부파일의 파일 바이너리를 새 파일로 교체한다. Zotero Web API의 3단계
// 업로드 플로우를 따른다:
//   (1) POST .../file  — md5/filename/filesize/mtime을 보내 업로드를 인증받는다.
//       기존 파일을 덮어쓰는 것이므로 현재 파일의 md5로 If-Match를 건다(파일이
//       아직 없으면 If-None-Match: *). 서버가 If-Match 불일치(412)를 돌려주면
//       그새 다른 데서 파일이 바뀐 것이므로 덮어쓰지 않고 실패시킨다.
//   (2) 반환된 S3 URL로 prefix+파일+suffix를 실제 업로드한다.
//   (3) 다시 POST .../file 에 upload=<uploadKey>로 등록을 완료한다(같은 If-Match).
// 이미 동일한 파일이면 (1)에서 {exists:1}이 돌아오고, 그대로 성공 처리한다.
// fileBuffer는 최종적으로 Zotero에 올라갈 바이트 그대로여야 한다(HTML 스냅샷을
// zip으로 감싸는 등의 가공은 호출부에서 끝낸 뒤 넘긴다).
export async function replaceAttachmentFile(attachmentKey, fileBuffer) {
  const attachment = await fetchItem(attachmentKey);
  if (attachment.data.itemType !== 'attachment') {
    throw new Error('첨부파일 아이템이 아닙니다');
  }
  const { md5: oldMd5, filename } = attachment.data;
  if (!filename) {
    throw new Error('파일명이 없는 첨부(링크 첨부 등)는 교체할 수 없습니다');
  }

  const md5 = crypto.createHash('md5').update(fileBuffer).digest('hex');
  const mtime = Date.now();
  // 기존 파일이 있으면 그 md5로 낙관적 잠금, 없으면 "파일 없음"을 명시(If-None-Match: *).
  const precondition = oldMd5 ? { 'If-Match': oldMd5 } : { 'If-None-Match': '*' };
  const fileUrl = `${userPrefix()}/items/${attachmentKey}/file`;

  // (1) 업로드 인증 요청.
  const authRes = await fetch(fileUrl, {
    method: 'POST',
    headers: { ...headers(precondition), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      md5,
      filename,
      filesize: String(fileBuffer.length),
      mtime: String(mtime),
    }),
  });
  if (authRes.status === 412) {
    throw new Error('첨부파일이 그새 다른 곳에서 변경되었습니다 (동기화 후 다시 시도해주세요)');
  }
  if (!authRes.ok) {
    throw new Error(`Zotero 업로드 인증 실패: ${authRes.status} ${authRes.statusText}`);
  }
  const auth = await authRes.json();

  // 이미 같은 파일이면 Zotero가 업로드를 건너뛰라고 알려준다.
  if (auth.exists) return;

  // (2) 실제 파일 업로드 — prefix/suffix 사이에 파일 바이트를 끼워 보낸다.
  const uploadBody = Buffer.concat([
    Buffer.from(auth.prefix, 'utf8'),
    fileBuffer,
    Buffer.from(auth.suffix, 'utf8'),
  ]);
  const uploadRes = await fetch(auth.url, {
    method: 'POST',
    headers: { 'Content-Type': auth.contentType },
    body: uploadBody,
  });
  if (!uploadRes.ok) {
    throw new Error(`Zotero 파일 업로드 실패: ${uploadRes.status} ${uploadRes.statusText}`);
  }

  // (3) 업로드 등록 완료 — (1)과 같은 precondition을 다시 건다.
  const registerRes = await fetch(fileUrl, {
    method: 'POST',
    headers: { ...headers(precondition), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ upload: auth.uploadKey }),
  });
  if (registerRes.status === 412) {
    throw new Error('첨부파일이 그새 다른 곳에서 변경되었습니다 (동기화 후 다시 시도해주세요)');
  }
  if (!registerRes.ok) {
    throw new Error(`Zotero 업로드 등록 실패: ${registerRes.status} ${registerRes.statusText}`);
  }
}

// PDF 첨부파일에 달린 annotation 아이템을 전부 가져온다 (하이라이트 렌더링용).
// Zotero 데이터 모델상 annotation은 attachment의 자식이다. 하이라이트 원문은
// 로컬 DB에 캐시하지 않고 열 때마다 여기서 라이브로 읽는다 — 메모 note와 같은
// 원칙이라 Zotero 데스크톱/모바일에서 칠한 것도 그대로 같이 보인다.
export async function fetchAttachmentAnnotations(attachmentKey) {
  const annotations = [];
  let url = `${userPrefix()}/items/${attachmentKey}/children?format=json&itemType=annotation&limit=100`;

  while (url) {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      throw new Error(`Zotero annotation 조회 실패: ${res.status} ${res.statusText}`);
    }

    annotations.push(...(await res.json()));

    const link = res.headers.get('Link');
    const nextMatch = link && link.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return annotations;
}

// 하이라이트 annotation 아이템을 새로 만든다 (parentItem은 PDF attachment).
// Zotero 표준 아이템이라 데스크톱/모바일 앱에서도 그대로 보이고 Zotero sync로
// 기기 간 동기화된다 — Folio가 별도 하이라이트 저장소를 갖지 않는 이유다.
export async function createHighlightAnnotation(
  attachmentKey,
  { text, color, pageLabel, sortIndex, position }
) {
  const body = [
    {
      itemType: 'annotation',
      parentItem: attachmentKey,
      annotationType: 'highlight',
      annotationText: text,
      annotationComment: '',
      annotationColor: color,
      annotationPageLabel: pageLabel,
      annotationSortIndex: sortIndex,
      // Zotero 스펙상 position은 객체가 아니라 JSON 문자열로 넣어야 한다.
      annotationPosition: JSON.stringify(position),
      tags: [],
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
    throw new Error(`Zotero 하이라이트 생성 실패: ${res.status} ${res.statusText}`);
  }

  const result = await res.json();
  const created = result.successful?.['0'];
  if (!created) {
    throw new Error(`Zotero 하이라이트 생성 실패: ${JSON.stringify(result.failed)}`);
  }
  return created; // {key, version, data}
}

// 필기(ink) annotation 아이템을 새로 만든다 (parentItem은 PDF attachment).
// 하이라이트 생성과 구조가 같고 annotationType/position만 다르다 — 다만
// 하이라이트 쪽 검증(rects/색상 팔레트)과 섞이지 않도록 별도 래퍼로 둔다.
export async function createInkAnnotation(
  attachmentKey,
  { color, pageLabel, sortIndex, position }
) {
  const body = [
    {
      itemType: 'annotation',
      parentItem: attachmentKey,
      annotationType: 'ink',
      annotationComment: '',
      annotationColor: color,
      annotationPageLabel: pageLabel,
      annotationSortIndex: sortIndex,
      // Zotero 스펙상 position은 객체가 아니라 JSON 문자열로 넣어야 한다.
      annotationPosition: JSON.stringify(position),
      tags: [],
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
    throw new Error(`Zotero 필기 생성 실패: ${res.status} ${res.statusText}`);
  }

  const result = await res.json();
  const created = result.successful?.['0'];
  if (!created) {
    throw new Error(`Zotero 필기 생성 실패: ${JSON.stringify(result.failed)}`);
  }
  return created; // {key, version, data}
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
