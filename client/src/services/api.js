// ── ARKA API Client Service ───────────────────────────────────────────────────

export const API_BASE = '/api';

export function getAuthToken() {
  return localStorage.getItem('arka_token');
}

export function getProviderToken() {
  return localStorage.getItem('arka_provider_token');
}

export function setAuthToken(token) {
  if (token) localStorage.setItem('arka_token', token);
  else localStorage.removeItem('arka_token');
}

export function setProviderToken(token) {
  if (token) localStorage.setItem('arka_provider_token', token);
  else localStorage.removeItem('arka_provider_token');
}

export async function authFetch(url, options = {}) {
  const token = getAuthToken();
  const providerToken = getProviderToken();

  const headers = Object.assign({}, options.headers || {});
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (providerToken) headers['X-Provider-Token'] = providerToken;

  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });
  return res;
}

export const api = {
  // Status & System
  getStatus: async () => {
    const res = await authFetch(`${API_BASE}/status`);
    return res.json();
  },

  // Auth
  login: async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username: email, password })
    });
    return res.json();
  },
  verifyAuth: async () => {
    const res = await authFetch(`${API_BASE}/auth/verify`);
    if (!res.ok) throw new Error('Unauthenticated');
    return res.json();
  },
  getAuthConfig: async () => {
    const res = await fetch(`${API_BASE}/auth/config`);
    return res.json();
  },

  // Files
  getFiles: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await authFetch(`${API_BASE}/files${query ? `?${query}` : ''}`);
    const json = await res.json();
    return json.data || [];
  },
  uploadFiles: async (formData) => {
    const res = await authFetch(`${API_BASE}/files/upload`, {
      method: 'POST',
      body: formData
    });
    return res.json();
  },
  deleteFile: async (id) => {
    const res = await authFetch(`${API_BASE}/files/${id}`, { method: 'DELETE' });
    return res.json();
  },
  restoreFile: async (id) => {
    const res = await authFetch(`${API_BASE}/files/${id}/restore`, { method: 'POST' });
    return res.json();
  },
  emptyTrash: async () => {
    const res = await authFetch(`${API_BASE}/trash`, { method: 'DELETE' });
    return res.json();
  },
  toggleFavoriteFile: async (id, isFavorite) => {
    const res = await authFetch(`${API_BASE}/files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_favorite: !isFavorite })
    });
    return res.json();
  },
  moveFileFolder: async (fileId, folderId) => {
    const res = await authFetch(`${API_BASE}/files/${fileId}`, {
      method: 'PATCH',
      body: JSON.stringify({ folder_id: folderId, is_inbox: false })
    });
    return res.json();
  },
  getFileContent: async (id) => {
    const res = await authFetch(`${API_BASE}/files/${id}/content`);
    return res.json();
  },

  // Folders
  getFolders: async () => {
    const res = await authFetch(`${API_BASE}/folders`);
    const json = await res.json();
    return json.data || [];
  },
  createFolder: async (name, parentId = null) => {
    const res = await authFetch(`${API_BASE}/folders`, {
      method: 'POST',
      body: JSON.stringify({ name, parent_id: parentId })
    });
    return res.json();
  },
  pruneEmptyFolders: async () => {
    const res = await authFetch(`${API_BASE}/folders/prune-empty`, { method: 'POST' });
    return res.json();
  },

  // Prompts
  getPrompts: async () => {
    const res = await authFetch(`${API_BASE}/prompts`);
    const json = await res.json();
    return json.data || [];
  },
  createPrompt: async (data) => {
    const res = await authFetch(`${API_BASE}/prompts`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.json();
  },
  deletePrompt: async (id) => {
    const res = await authFetch(`${API_BASE}/prompts/${id}`, { method: 'DELETE' });
    return res.json();
  },

  // Links
  getLinks: async () => {
    const res = await authFetch(`${API_BASE}/links`);
    const json = await res.json();
    return json.data || [];
  },
  createLink: async (data) => {
    const res = await authFetch(`${API_BASE}/links`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.json();
  },
  deleteLink: async (id) => {
    const res = await authFetch(`${API_BASE}/links/${id}`, { method: 'DELETE' });
    return res.json();
  },

  // AI Chat & Agent
  askAi: async (query, history = []) => {
    const res = await authFetch(`${API_BASE}/ai/ask`, {
      method: 'POST',
      body: JSON.stringify({ query, history })
    });
    return res.json();
  },
  resetAi: async () => {
    const res = await authFetch(`${API_BASE}/ai/reset`, { method: 'POST' });
    return res.json();
  }
};
