// ── ARKA Global State & Shared Utilities ─────────────────────────────────────
const API_BASE = '/api';

let authToken = null;
let providerToken = null;
let supabaseClient = null;

let allData = {
  files: [],
  prompts: [],
  links: [],
  folders: [],
  trash: []
};

let currentFilter = 'overview';
let currentFolderFilter = null; // null = semua folder, string = filter folder tertentu
let searchQuery = '';
let deleteConfirmState = {};
let isAutoOrganizingBatch = false;
const autoOrganizingIds = new Set();
let isProcessingAutoQueue = false;

// State untuk multi-select berkas & aksi massal
let selectedFileIds = new Set();

// State untuk hierarki folder sidebar tree
let expandedFolderIds = new Set();

// State untuk drag-and-drop file
let draggedFileId = null;

// State untuk modal preview & navigasi Next/Prev
let currentPreviewIndex = -1;
let currentPreviewList = [];

// Helper Multi-Select
function toggleSelectFile(fileId, event) {
  if (event) event.stopPropagation();
  const idStr = String(fileId);
  if (selectedFileIds.has(idStr)) {
    selectedFileIds.delete(idStr);
  } else {
    selectedFileIds.add(idStr);
  }
  updateBatchActionBar();
  if (typeof refreshSelectionUI === 'function') refreshSelectionUI();
}

function selectAllFiles() {
  const fileItems = (allData.files || []).filter(f => !f.is_trash);
  if (currentFolderFilter) {
    fileItems.filter(f => (f.folder_name || (f.is_inbox ? 'inbox' : 'root')) === currentFolderFilter)
      .forEach(f => selectedFileIds.add(String(f.id)));
  } else {
    fileItems.forEach(f => selectedFileIds.add(String(f.id)));
  }
  updateBatchActionBar();
  if (typeof refreshSelectionUI === 'function') refreshSelectionUI();
}

function clearFileSelection() {
  selectedFileIds.clear();
  updateBatchActionBar();
  if (typeof refreshSelectionUI === 'function') refreshSelectionUI();
}

function updateBatchActionBar() {
  const bar = document.getElementById('batchActionBar');
  const countBadge = document.getElementById('batchSelectedCount');
  if (!bar) return;
  const count = selectedFileIds.size;
  if (count > 0) {
    bar.classList.remove('hidden');
    bar.classList.add('flex');
    if (countBadge) countBadge.textContent = `${count} dipilih`;
  } else {
    bar.classList.add('hidden');
    bar.classList.remove('flex');
  }
}

// ── Theme Management (Light & Dark Mode) ───────────────────────────────────
const THEME_KEY = 'arka_theme';

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === 'light') {
    document.documentElement.classList.remove('dark');
  } else if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    // Brand signature default: dark mode
    document.documentElement.classList.add('dark');
  }
  updateThemeIcon();
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  const newTheme = isDark ? 'dark' : 'light';
  try {
    localStorage.setItem(THEME_KEY, newTheme);
  } catch {}
  updateThemeIcon();
  if (typeof render === 'function') render();
  showToast('info', `Mode tema: ${isDark ? 'Gelap (Dark)' : 'Terang (Light)'}`);
}

function updateThemeIcon() {
  const isDark = document.documentElement.classList.contains('dark');
  const btns = [document.getElementById('btnThemeToggle'), document.getElementById('loginThemeToggle')];
  btns.forEach(btn => {
    if (btn) {
      btn.innerHTML = isDark
        ? '<i data-lucide="sun" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400"></i>'
        : '<i data-lucide="moon" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-600"></i>';
      btn.title = isDark ? 'Beralih ke Mode Terang (Light)' : 'Beralih ke Mode Gelap (Dark)';
    }
  });
  refreshIcons();
}

// ── Refresh Lucide Icons Helper ──────────────────────────────────────────────
function refreshIcons() {
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

// ── Token Storage Helpers ───────────────────────────────────────────────────
function saveToken(token) {
  authToken = token;
  try { localStorage.setItem('arka_token', token); } catch {}
}

function loadToken() {
  try { return localStorage.getItem('arka_token'); } catch { return null; }
}

function clearToken() {
  authToken = null;
  try { localStorage.removeItem('arka_token'); } catch {}
}

function saveProviderToken(token) {
  providerToken = token;
  try { localStorage.setItem('arka_provider_token', token); } catch {}
}

function loadProviderToken() {
  try { return localStorage.getItem('arka_provider_token'); } catch { return null; }
}

function clearProviderToken() {
  providerToken = null;
  try { localStorage.removeItem('arka_provider_token'); } catch {}
}

// ── Formatters & Escaping ───────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return dateStr; }
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setFormStatus(elementId, type, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.className = `text-xs font-mono transition-all ${type === 'success' ? 'text-emerald-400' : type === 'error' ? 'text-red-400' : 'text-zinc-400'}`;
  el.textContent = message;
  if (type === 'success') {
    setTimeout(() => { if (el) { el.textContent = ''; } }, 4000);
  }
}

// ── Modern Floating Toast System ─────────────────────────────────────────────
function showToast(type, message, duration = 3500) {
  const toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) return;

  const toast = document.createElement('div');
  const isErr = type === 'error';
  const isWarn = type === 'warn';

  const iconName = isErr ? 'alert-circle' : isWarn ? 'alert-triangle' : 'check-circle-2';
  const borderCol = isErr ? 'border-red-500/40 text-red-600 dark:text-red-300' : isWarn ? 'border-amber-500/40 text-amber-600 dark:text-amber-300' : 'border-emerald-500/40 text-emerald-600 dark:text-emerald-300';
  const bgCol = 'bg-white/95 dark:bg-zinc-900/95';

  const cleanMsg = typeof message === 'string'
    ? message
    : (message?.message || (message && typeof message === 'object' ? JSON.stringify(message) : String(message || '')));

  toast.className = `flex items-center gap-2.5 px-4 py-2.5 rounded-lg border shadow-xl dark:shadow-2xl backdrop-blur-md text-xs font-mono text-zinc-800 dark:text-zinc-200 ${bgCol} ${borderCol} transition-all duration-300 transform translate-y-3 opacity-0`;
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 flex-shrink-0"></i>
    <span class="flex-1">${escapeHtml(cleanMsg)}</span>
    <button type="button" class="ml-2 text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200" onclick="this.parentElement.remove()">
      <i data-lucide="x" class="w-3.5 h-3.5"></i>
    </button>
  `;

  toastContainer.appendChild(toast);
  refreshIcons();

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-3', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Clipboard Copy Helper ───────────────────────────────────────────────────
async function copyToClipboard(text, btn, successLabel = 'tersalin!', originalLabel = 'salin') {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const origHtml = btn.innerHTML;
      btn.innerHTML = `<i data-lucide="check" class="w-3 h-3 text-emerald-400"></i> <span class="text-emerald-400">${successLabel}</span>`;
      refreshIcons();
      setTimeout(() => {
        btn.innerHTML = origHtml;
        refreshIcons();
      }, 2000);
    }
  } catch (err) {
    showToast('error', 'Gagal menyalin ke clipboard.');
  }
}

// ── File Format Category & Image Helpers ────────────────────────────────────
function isImageFile(f) {
  if (!f) return false;
  const mime = (f.mime_type || f.type || '').toLowerCase();
  const name = (f.original_name || f.name || '').toLowerCase();
  return mime.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg|bmp|ico|avif|tiff?)$/i.test(name);
}

function getFileCategoryIcon(mime, name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const m = (mime || '').toLowerCase();
  if (['xlsx', 'xls', 'csv', 'tsv', 'ods'].includes(ext)) return { icon: 'file-spreadsheet', color: '#10b981', label: 'SPREADSHEET' };
  if (['docx', 'doc', 'odt', 'rtf'].includes(ext)) return { icon: 'file-text', color: '#3b82f6', label: 'DOKUMEN' };
  if (ext === 'pdf' || m === 'application/pdf') return { icon: 'file-text', color: '#ef4444', label: 'PDF' };
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { icon: 'archive', color: '#a855f7', label: 'ARSIP' };
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext) || m.startsWith('audio/')) return { icon: 'music', color: '#ec4899', label: 'AUDIO' };
  if (['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext) || m.startsWith('video/')) return { icon: 'film', color: '#f97316', label: 'VIDEO' };
  if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'py', 'sql', 'sh', 'php', 'java', 'cpp', 'c'].includes(ext)) return { icon: 'file-code', color: '#06b6d4', label: 'KODE' };
  return { icon: 'file', color: '#71717a', label: ext.toUpperCase() || 'FILE' };
}

// ── Authenticated HTTP Request Helper ────────────────────────────────────────
function authHeaders() {
  const headers = {};
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const pt = providerToken || loadProviderToken();
  if (pt) headers['X-Provider-Token'] = pt;
  return headers;
}

async function authFetch(url, options = {}) {
  const headers = Object.assign({}, authHeaders(), options.headers || {});
  if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, Object.assign({}, options, { headers }));
}

// ── Download Helper — stays on current page ───────────────────────────────────
// Uses fetch + Blob + hidden <a> so the browser never navigates away.
// Falls back to window.open with noopener for unsupported environments.
async function downloadFile(fileId, filename) {
  const token = authToken || loadToken();
  const url = `/api/files/${encodeURIComponent(fileId)}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  try {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error('Gagal mengunduh berkas (HTTP ' + res.status + ')');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename || 'unduhan';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      a.remove();
    }, 3000);
  } catch (err) {
    // Graceful fallback: open in new tab without changing current page
    console.warn('[ARKA] Download via fetch failed, falling back to new tab:', err.message);
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// ── currentFilter Persistence ─────────────────────────────────────────────────
const FILTER_KEY = 'arka_current_filter';

function saveCurrentFilter(filterName) {
  try { sessionStorage.setItem(FILTER_KEY, filterName); } catch {}
}

function loadCurrentFilter() {
  try { return sessionStorage.getItem(FILTER_KEY) || 'overview'; } catch { return 'overview'; }
}
