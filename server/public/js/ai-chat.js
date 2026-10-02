// ── ARKA Top Inline AI Assistant Module ──────────────────────────────────────
const AI_COLLAPSE_KEY = 'arka_ai_collapsed';
let aiChatLoading = false;
let aiSectionCollapsed = false;
let aiChatHistory = [];

function initAiChatSection() {
  try {
    const saved = localStorage.getItem(AI_COLLAPSE_KEY);
    if (saved === 'true') {
      aiSectionCollapsed = true;
      const body = document.getElementById('aiAssistantBody');
      const icon = document.getElementById('aiCollapseIcon');
      if (body) body.classList.add('hidden');
      if (icon) icon.style.transform = 'rotate(180deg)';
    }
  } catch {}
}

function toggleAiSectionCollapse() {
  const body = document.getElementById('aiAssistantBody');
  const icon = document.getElementById('aiCollapseIcon');
  if (!body) return;

  aiSectionCollapsed = !aiSectionCollapsed;
  body.classList.toggle('hidden', aiSectionCollapsed);
  if (icon) {
    icon.style.transform = aiSectionCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
  }
  try {
    localStorage.setItem(AI_COLLAPSE_KEY, aiSectionCollapsed);
  } catch {}
}

function focusAiChat() {
  const isDashboardVisible = !document.getElementById('dashboard')?.classList.contains('hidden');
  if (!isDashboardVisible) {
    showToast('warn', 'Silakan masuk terlebih dahulu untuk mengakses Arka Assistant.');
    return;
  }

  if (typeof setFilter === 'function') {
    setFilter('ai');
  }

  setTimeout(() => {
    const input = document.getElementById('aiChatInput');
    if (input) {
      input.focus();
      aiChatAutoResize(input);
    }
  }, 120);
}

// Backward-compatible alias for any keyboard shortcuts or triggers
function toggleAiChat() {
  focusAiChat();
}

function aiChatAutoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  const sendBtn = document.getElementById('aiChatSendBtn');
  if (sendBtn) {
    sendBtn.disabled = !el.value.trim() || aiChatLoading;
  }
}

function aiChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendAiMessage();
  }
}

function sendAiSuggestion(target) {
  const text = typeof target === 'string' ? target : target.textContent.trim();
  const input = document.getElementById('aiChatInput');
  if (!input) return;
  input.value = text;
  aiChatAutoResize(input);
  sendAiMessage();
}

function escapeHtmlAi(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatAiResponse(text) {
  if (!text) return '';
  let safe = escapeHtmlAi(text);
  // Code blocks
  safe = safe.replace(/```(?:[a-zA-Z0-9_\-]+)?\n?([\s\S]*?)```/g, '<pre class="bg-zinc-100 dark:bg-zinc-950 p-2.5 rounded border border-zinc-200 dark:border-zinc-800 text-xs font-mono my-2 overflow-x-auto text-zinc-800 dark:text-zinc-200"><code>$1</code></pre>');
  // Inline code
  safe = safe.replace(/`([^`]+)`/g, '<code class="bg-zinc-200 dark:bg-zinc-800 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>');
  // Headings
  safe = safe.replace(/^###\s+(.+)$/gm, '<h4 class="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mt-2 mb-1">$1</h4>');
  safe = safe.replace(/^##\s+(.+)$/gm, '<h3 class="font-bold text-zinc-900 dark:text-zinc-100 text-sm mt-2.5 mb-1">$1</h3>');
  // Bold
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-zinc-900 dark:text-zinc-100">$1</strong>');
  // Blockquotes
  safe = safe.replace(/^>\s+(.+)$/gm, '<blockquote class="border-l-2 border-amber-500 pl-2 text-zinc-600 dark:text-zinc-400 italic my-1">$1</blockquote>');
  // Unordered list items
  safe = safe.replace(/(?:^|\n)[-*]\s+(.+)/g, '<li class="ml-4 list-disc text-zinc-700 dark:text-zinc-300">$1</li>');
  safe = safe.replace(/(<li class="ml-4 list-disc text-zinc-700 dark:text-zinc-300">[\s\S]+?<\/li>)/g, '<ul class="my-1 space-y-0.5">$1</ul>');
  safe = safe.replace(/<\/ul>\s*<ul class="my-1 space-y-0.5">/g, '');
  // Numbered list items
  safe = safe.replace(/(?:^|\n)(\d+)\.\s+(.+)/g, '<li class="ml-4 list-decimal text-zinc-700 dark:text-zinc-300">$2</li>');
  safe = safe.replace(/(<li class="ml-4 list-decimal text-zinc-700 dark:text-zinc-300">[\s\S]+?<\/li>)/g, '<ol class="my-1 space-y-0.5">$1</ol>');
  safe = safe.replace(/<\/ol>\s*<ol class="my-1 space-y-0.5">/g, '');
  // Newlines
  safe = safe.replace(/\n/g, '<br>');
  safe = safe.replace(/<\/ul><br>/g, '</ul>');
  safe = safe.replace(/<\/ol><br>/g, '</ol>');
  safe = safe.replace(/<\/pre><br>/g, '</pre>');
  safe = safe.replace(/<\/blockquote><br>/g, '</blockquote>');
  return safe;
}

function addAiMessage(role, text) {
  const emptyHero = document.getElementById('aiEmptyHero');
  if (emptyHero) {
    emptyHero.classList.add('hidden');
  }

  const scrollArea = document.getElementById('aiMessagesScroll');
  if (scrollArea) {
    scrollArea.classList.remove('hidden');
  }

  const container = document.getElementById('aiChatMessages');
  if (!container) return;

  const msgEl = document.createElement('div');
  const isUser = role === 'user';
  msgEl.className = `flex gap-3 items-start ${isUser ? 'flex-row-reverse' : ''} fade-in-fast`;

  const avatar = isUser
    ? `<div class="w-8 h-8 rounded-full bg-zinc-800 dark:bg-zinc-700 text-white flex items-center justify-center font-mono text-xs font-semibold flex-shrink-0">U</div>`
    : `<div class="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0"><i data-lucide="bot-message-square" class="w-4 h-4 text-amber-600 dark:text-amber-400"></i></div>`;

  const bubble = isUser
    ? `<div class="bg-zinc-900 text-white dark:bg-zinc-800 dark:text-zinc-100 px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm max-w-lg leading-relaxed shadow-sm">${escapeHtmlAi(text).replace(/\n/g, '<br>')}</div>`
    : `<div class="flex flex-col gap-2 max-w-xl w-full">
         <div class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed shadow-sm">${formatAiResponse(text)}</div>
         <div class="ai-actions-slot"></div>
       </div>`;

  msgEl.innerHTML = `${avatar}${bubble}`;
  container.appendChild(msgEl);

  if (role === 'user' || role === 'assistant') {
    aiChatHistory.push({ role, content: text });
    if (aiChatHistory.length > 10) aiChatHistory.shift();
  }

  if (scrollArea) {
    scrollArea.scrollTop = scrollArea.scrollHeight;
  }

  refreshIcons();
  return msgEl;
}

function addAiTyping() {
  const scrollArea = document.getElementById('aiMessagesScroll');
  if (scrollArea) {
    scrollArea.classList.remove('hidden');
  }

  const container = document.getElementById('aiChatMessages');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'flex gap-3 items-start fade-in-fast';
  el.id = 'aiTypingIndicator';
  el.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
      <i data-lucide="bot-message-square" class="w-4 h-4 text-amber-600 dark:text-amber-400"></i>
    </div>
    <div class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
      <span class="w-2 h-2 rounded-full bg-amber-400/80 animate-bounce"></span>
      <span class="w-2 h-2 rounded-full bg-amber-400/80 animate-bounce [animation-delay:0.2s]"></span>
      <span class="w-2 h-2 rounded-full bg-amber-400/80 animate-bounce [animation-delay:0.4s]"></span>
    </div>
  `;
  container.appendChild(el);

  if (scrollArea) {
    scrollArea.scrollTop = scrollArea.scrollHeight;
  }
  return el;
}

function removeAiTyping() {
  document.getElementById('aiTypingIndicator')?.remove();
}

// ── Human-in-the-Loop Action Approval Card ──────────────────────────────────
function renderPermissionCard(msgEl, actions, message) {
  if (!actions || !actions.length) return;
  const slot = msgEl.querySelector('.ai-actions-slot') || msgEl;

  const card = document.createElement('div');
  card.className = 'w-full bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/30 dark:border-amber-500/20 rounded-xl p-3.5 mt-1 space-y-3 shadow-xs fade-in-fast';

  const headerHtml = `
    <div class="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-medium text-xs">
      <i data-lucide="shield-alert" class="w-4 h-4 text-amber-500"></i>
      <span>Izin Diperlukan: Arka AI Mengajukan Tindakan</span>
    </div>
    ${message ? `<div class="text-xs text-zinc-600 dark:text-zinc-400 leading-snug">${escapeHtmlAi(message)}</div>` : ''}
  `;

  let itemsHtml = '<div class="space-y-2">';
  actions.forEach((act, idx) => {
    let typeIcon = 'wrench';
    let typeTitle = 'Aksi Workspace';
    let detailsHtml = '';

    if (act.type === 'rename_file') {
      typeIcon = 'edit-3';
      typeTitle = 'Ganti Nama Berkas';
      detailsHtml = `
        <div class="flex items-center gap-1.5 flex-wrap text-xs">
          <span class="text-zinc-500 line-through">${escapeHtmlAi(act.details?.current_name || 'Berkas')}</span>
          <i data-lucide="arrow-right" class="w-3 h-3 text-amber-500 inline"></i>
          <span class="font-semibold text-emerald-600 dark:text-emerald-400">${escapeHtmlAi(act.details?.new_name || act.label)}</span>
        </div>
      `;
    } else if (act.type === 'move_file') {
      typeIcon = 'folder-input';
      typeTitle = 'Pindah Folder';
      detailsHtml = `
        <div class="flex items-center gap-1.5 flex-wrap text-xs">
          <span class="text-zinc-700 dark:text-zinc-300 font-medium">${escapeHtmlAi(act.details?.current_name || 'Berkas')}</span>
          <i data-lucide="arrow-right" class="w-3 h-3 text-amber-500 inline"></i>
          <span class="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <i data-lucide="folder" class="w-3 h-3"></i> ${escapeHtmlAi(act.details?.target_folder_name || act.details?.target_folder_id || 'Folder')}
          </span>
        </div>
      `;
    } else if (act.type === 'delete_file') {
      typeIcon = 'trash-2';
      typeTitle = 'Pindahkan ke Tong Sampah';
      const rawTarget = act.details?.current_name || act.label || '';
      const cleanTarget = rawTarget.replace(/^hapus\s+(file\s+|berkas\s+)?/i, '').replace(/["']/g, '').trim() || rawTarget;
      detailsHtml = `
        <div class="text-xs text-rose-600 dark:text-rose-400 font-medium">
          Hapus "${escapeHtmlAi(cleanTarget)}" ke Tong Sampah
        </div>
      `;
    } else if (act.type === 'delete_folder') {
      typeIcon = 'folder-minus';
      typeTitle = 'Hapus Folder';
      const rawTarget = act.details?.current_name || act.label || '';
      const cleanTarget = rawTarget.replace(/^hapus\s+(folder\s+)?/i, '').replace(/["']/g, '').trim() || rawTarget;
      detailsHtml = `
        <div class="text-xs text-rose-600 dark:text-rose-400 font-medium">
          Hapus Folder "${escapeHtmlAi(cleanTarget)}" beserta isinya
        </div>
      `;
    } else if (act.type === 'open_preview') {
      typeIcon = 'eye';
      typeTitle = 'Buka Pratinjau';
      detailsHtml = `<div class="text-xs text-zinc-700 dark:text-zinc-300">Buka berkas ${escapeHtmlAi(act.details?.current_name || '')}</div>`;
    } else if (act.type === 'navigate') {
      typeIcon = 'arrow-right';
      typeTitle = 'Beralih Halaman';
      detailsHtml = `<div class="text-xs text-zinc-700 dark:text-zinc-300">Buka halaman <span class="font-semibold capitalize">${escapeHtmlAi(act.details?.target || 'overview')}</span></div>`;
    }

    if (act.details?.reason) {
      detailsHtml += `<div class="text-[11px] text-zinc-500 dark:text-zinc-400 italic mt-0.5">${escapeHtmlAi(act.details.reason)}</div>`;
    }

    itemsHtml += `
      <div id="aiActionItem_${idx}" class="p-2.5 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div class="flex items-start gap-2.5 min-w-0">
          <div class="p-1.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0">
            <i data-lucide="${typeIcon}" class="w-4 h-4"></i>
          </div>
          <div class="min-w-0">
            <div class="text-xs font-semibold text-zinc-800 dark:text-zinc-200">${typeTitle}</div>
            ${detailsHtml}
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 self-end sm:self-center" id="aiActionBtns_${idx}">
          <button type="button" class="btn-allow px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs flex items-center gap-1 shadow-xs transition-colors" data-idx="${idx}">
            <i data-lucide="check" class="w-3.5 h-3.5"></i>
            <span>Izinkan</span>
          </button>
          <button type="button" class="btn-reject px-2.5 py-1.5 rounded-md bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium text-xs transition-colors" data-idx="${idx}">
            <span>Tolak</span>
          </button>
        </div>
      </div>
    `;
  });
  itemsHtml += '</div>';

  card.innerHTML = `${headerHtml}${itemsHtml}`;
  slot.appendChild(card);
  refreshIcons();

  // Pasang listener pada tombol persetujuan
  actions.forEach((act, idx) => {
    const btnAllow = card.querySelector(`.btn-allow[data-idx="${idx}"]`);
    const btnReject = card.querySelector(`.btn-reject[data-idx="${idx}"]`);
    const containerItem = card.querySelector(`#aiActionBtns_${idx}`);

    if (btnAllow) {
      btnAllow.onclick = () => executeAiAction(act, containerItem);
    }
    if (btnReject) {
      btnReject.onclick = () => {
        if (containerItem) {
          containerItem.innerHTML = `<span class="text-xs text-zinc-400 italic">Aksi dibatalkan</span>`;
        }
        showToast('info', 'Aksi AI dibatalkan.');
      };
    }
  });

  const scrollArea = document.getElementById('aiMessagesScroll');
  if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
}

// ── Eksekusi Aksi yang Disetujui Pengguna ────────────────────────────────────
async function executeAiAction(action, containerEl) {
  if (containerEl) {
    containerEl.innerHTML = `
      <span class="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
        <span class="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></span>
        Memproses...
      </span>
    `;
  }

  try {
    const type = action.type;
    const details = action.details || {};

    if (type === 'rename_file') {
      const fileId = details.file_id;
      const newName = details.new_name;
      if (!fileId || !newName) throw new Error('Parameter ganti nama tidak lengkap');

      const res = await authFetch(`${API_BASE}/files/${fileId}`, {
        method: 'PUT',
        body: JSON.stringify({ original_name: newName })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Gagal mengubah nama berkas');

      if (containerEl) {
        containerEl.innerHTML = `
          <span class="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Berhasil diubah
          </span>
        `;
      }
      showToast('success', `Nama berkas berhasil diubah menjadi "${newName}"`);
      await fetchAllData();
      refreshIcons();

    } else if (type === 'move_file') {
      const fileId = details.file_id;
      const folderTarget = details.target_folder_id || details.target_folder_name;
      const folderDisplayName = details.target_folder_name || details.target_folder_id || 'Folder';
      
      if (!fileId || !folderTarget) throw new Error('Parameter pindah folder tidak lengkap');

      const res = await authFetch(`${API_BASE}/files/${fileId}`, {
        method: 'PUT',
        body: JSON.stringify({
          folder_id: folderTarget
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Gagal memindahkan berkas');

      if (containerEl) {
        containerEl.innerHTML = `
          <span class="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Berhasil dipindahkan
          </span>
        `;
      }
      showToast('success', `Berkas berhasil dipindahkan ke folder "${folderDisplayName}"`);
      await fetchAllData();
      refreshIcons();

    } else if (type === 'delete_file') {
      const fileId = details.file_id || details.current_name || action.label;
      if (!fileId) throw new Error('ID berkas tidak ditemukan');

      const nameParam = details.current_name ? `?name=${encodeURIComponent(details.current_name)}` : '';
      const res = await authFetch(`${API_BASE}/files/${encodeURIComponent(fileId)}${nameParam}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Gagal menghapus berkas');

      if (containerEl) {
        containerEl.innerHTML = `
          <span class="inline-flex items-center gap-1 text-xs text-rose-500 font-medium">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Dipindahkan ke Sampah
          </span>
        `;
      }
      showToast('success', 'Berkas dipindahkan ke Tong Sampah.');
      await fetchAllData();
      refreshIcons();

    } else if (type === 'delete_folder') {
      const folderId = details.folder_id || details.file_id || details.current_name || action.label;
      if (!folderId) throw new Error('ID atau nama folder tidak ditemukan');

      const nameParam = details.current_name ? `?name=${encodeURIComponent(details.current_name)}` : '';
      const res = await authFetch(`${API_BASE}/folders/${encodeURIComponent(folderId)}${nameParam}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) {
        const errTxt = typeof data.error === 'string' ? data.error : (data.error?.message || JSON.stringify(data.error) || 'Gagal menghapus folder');
        throw new Error(errTxt);
      }

      if (containerEl) {
        containerEl.innerHTML = `
          <span class="inline-flex items-center gap-1 text-xs text-rose-500 font-medium">
            <i data-lucide="folder-minus" class="w-3.5 h-3.5"></i> Folder Dihapus
          </span>
        `;
      }
      showToast('success', data.message || 'Folder berhasil dihapus.');
      await fetchAllData();
      refreshIcons();

    } else if (type === 'open_preview') {
      const fileId = details.file_id;
      if (typeof openPreview === 'function' && fileId) {
        openPreview('FILE', fileId);
        if (containerEl) {
          containerEl.innerHTML = `<span class="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium"><i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Pratinjau Terbuka</span>`;
        }
        refreshIcons();
      }

    } else if (type === 'navigate') {
      const target = details.target || 'overview';
      if (typeof setFilter === 'function') {
        setFilter(target);
        if (containerEl) {
          containerEl.innerHTML = `<span class="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium"><i data-lucide="check-circle" class="w-3.5 h-3.5"></i> Terbuka</span>`;
        }
        refreshIcons();
      }
    }
  } catch (err) {
    const errorMsg = typeof err === 'string' ? err : (err?.message || (typeof err === 'object' ? JSON.stringify(err) : 'Terjadi kesalahan sistem'));
    if (containerEl) {
      containerEl.innerHTML = `
        <span class="text-xs text-rose-500 font-medium">Gagal: ${escapeHtmlAi(errorMsg)}</span>
      `;
    }
    showToast('error', errorMsg);
  }
}

async function sendAiMessage() {
  const input = document.getElementById('aiChatInput');
  const query = (input?.value || '').trim();
  if (!query || aiChatLoading) return;

  input.value = '';
  input.style.height = 'auto';
  const sendBtn = document.getElementById('aiChatSendBtn');
  if (sendBtn) sendBtn.disabled = true;
  aiChatLoading = true;

  const historyToSend = aiChatHistory.slice(-6);

  addAiMessage('user', query);
  addAiTyping();

  try {
    const resp = await authFetch(`${API_BASE}/ai/ask`, {
      method: 'POST',
      body: JSON.stringify({ query, history: historyToSend })
    });
    const data = await resp.json();
    removeAiTyping();

    if (data.success === false) {
      addAiMessage('assistant', `⚠️ ${data.error || 'AI tidak merespons. Coba beberapa saat lagi.'}`);
    } else {
      const answer = data.data?.answer || data.answer || 'Tidak ada jawaban.';
      const msgEl = addAiMessage('assistant', answer);
      const proposedActions = data.data?.proposedActions || null;
      const permissionMessage = data.data?.permissionMessage || null;
      if (proposedActions && Array.isArray(proposedActions) && proposedActions.length > 0) {
        renderPermissionCard(msgEl, proposedActions, permissionMessage);
      }
    }
  } catch (err) {
    removeAiTyping();
    addAiMessage('assistant', '⚠️ Gagal terhubung ke AI. Pastikan koneksi atau server aktif.');
  }

  aiChatLoading = false;
  if (sendBtn) sendBtn.disabled = !input.value.trim();
  input.focus();
}

async function resetAiChat() {
  aiChatHistory = [];
  const container = document.getElementById('aiChatMessages');
  if (container) container.innerHTML = '';

  const emptyHero = document.getElementById('aiEmptyHero');
  if (emptyHero) {
    emptyHero.classList.remove('hidden');
  }

  const input = document.getElementById('aiChatInput');
  if (input) {
    input.value = '';
    input.style.height = 'auto';
    input.focus();
    const sendBtn = document.getElementById('aiChatSendBtn');
    if (sendBtn) sendBtn.disabled = true;
  }
  refreshIcons();

  try {
    await authFetch(`${API_BASE}/ai/reset`, { method: 'POST' });
    showToast('info', 'Percakapan AI direset.');
  } catch {}
}
