// 서버 API fetch 래퍼 모음.

async function request(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `서버 오류 (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

function jsonBody(obj) {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

export const api = {
  authStatus: () => request('/api/auth/status'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  sync: () => request('/api/sync', { method: 'POST' }),

  listPapers: (q) => request(`/api/papers${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getPaper: (key) => request(`/api/papers/${key}`),
  deletePaper: (key) => request(`/api/papers/${key}`, { method: 'DELETE' }),
  addWebpage: (url) => request('/api/papers/webpage', { method: 'POST', ...jsonBody({ url }) }),
  saveMemo: (key, sections) =>
    request(`/api/papers/${key}/memo`, { method: 'PUT', ...jsonBody({ sections }) }),

  listCollections: () => request('/api/collections'),
  listCollectionPapers: (key) => request(`/api/collections/${key}/papers`),
};
