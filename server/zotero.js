// Zotero Web API 클라이언트.
// 읽기: 변경된 아이템 조회(버전 기반 증분), 자식 아이템/PDF 첨부파일 조회, PDF 다운로드
// 쓰기: child note 생성만 지원한다 — 기존 아이템 필드를 수정하는 함수는
//       의도적으로 만들지 않는다 (CLAUDE.md 제약).

import crypto from 'node:crypto';

const BASE_URL = 'https://api.zotero.org';

function headers() {
  return {
    'Zotero-API-Key': process.env.ZOTERO_API_KEY,
    'Zotero-API-Version': '3',
  };
}

function userPrefix() {
  return `${BASE_URL}/users/${process.env.ZOTERO_USER_ID}`;
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

// 아이템의 자식 중 PDF 첨부파일 하나를 찾는다. 없으면 null.
export async function findPdfAttachment(itemKey) {
  const url = `${userPrefix()}/items/${itemKey}/children?format=json`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Zotero children 조회 실패: ${res.status} ${res.statusText}`);
  }

  const children = await res.json();
  const attachment = children.find(
    (child) =>
      child.data.itemType === 'attachment' &&
      child.data.contentType === 'application/pdf'
  );
  return attachment ? attachment.data.key : null;
}

// PDF 첨부파일 바이너리를 다운로드한다.
export async function downloadAttachmentFile(attachmentKey) {
  const url = `${userPrefix()}/items/${attachmentKey}/file`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`Zotero PDF 다운로드 실패: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// 원본 아이템을 절대 건드리지 않고, 요약을 담은 child note만 새로 생성한다.
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
      // Zotero-Write-Token은 5~32자만 허용 (UUID는 하이픈 포함 36자라 그대로 못 씀)
      'Zotero-Write-Token': crypto.randomUUID().replace(/-/g, ''),
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
  return created.data.key;
}
