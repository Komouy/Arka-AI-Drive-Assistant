// ── ARKA Top Inline AI Assistant Module ──────────────────────────────────────
let aiChatLoading = false;
let aiSectionCollapsed = false;

function toggleAiSectionCollapse() {
  const body = document.getElementById('aiAssistantBody');
  const icon = document.getElementById('aiCollapseIcon');
  if (!body) return;

  aiSectionCollapsed = !aiSectionCollapsed;
  body.classList.toggle('hidden', aiSectionCollapsed);
  if (icon) {
    icon.style.transform = aiSectionCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
  }
}

function focusAiChat() {
  const isDashboardVisible = !document.getElementById('dashboard')?.classList.contains('hidden');
  if (!isDashboardVisible) {
    showToast('warn', 'Silakan masuk terlebih dahulu untuk mengakses Arka Assistant.');
    return;
  }

  const body = document.getElementById('aiAssistantBody');
  if (aiSectionCollapsed && body) {
    toggleAiSectionCollapse();
  }

  const section = document.getElementById('aiAssistantSection');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  setTimeout(() => {
    const input = document.getElementById('aiChatInput');
    if (input) {
      input.focus();
      aiChatAutoResize(input);
    }
  }, 150);
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
  safe = safe.replace(/```(?:[a-zA-Z0-9_\-]+)?\n?([\s\S]*?)```/g, '<pre class="bg-zinc-100 dark:bg-zinc-950 p-2.5 rounded border border-zinc-200 dark:border-zinc-800 text-xs font-mono my-2 overflow-x-auto text-zinc-800 dark:text-zinc-200"><code>$1</code></pre>');
  safe = safe.replace(/`([^`]+)`/g, '<code class="bg-zinc-200 dark:bg-zinc-800 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>');
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-zinc-900 dark:text-zinc-100">$1</strong>');
  safe = safe.replace(/(?:^|\n)[-*]\s+(.+)/g, '<li class="ml-4 list-disc text-zinc-700 dark:text-zinc-300">$1</li>');
  safe = safe.replace(/(<li class="ml-4 list-disc text-zinc-700 dark:text-zinc-300">[\s\S]+?<\/li>)/g, '<ul class="my-1 space-y-0.5">$1</ul>');
  safe = safe.replace(/<\/ul>\s*<ul class="my-1 space-y-0.5">/g, '');
  safe = safe.replace(/\n/g, '<br>');
  safe = safe.replace(/<\/ul><br>/g, '</ul>');
  safe = safe.replace(/<\/pre><br>/g, '</pre>');
  return safe;
}

function addAiMessage(role, text) {
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
    : `<div class="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0"><img src="/arka-white-logo.png" alt="ARKA" class="w-4 h-4 object-contain invert dark:invert-0"></div>`;

  const bubble = isUser
    ? `<div class="bg-zinc-900 text-white dark:bg-zinc-800 dark:text-zinc-100 px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm max-w-lg leading-relaxed shadow-sm">${escapeHtmlAi(text).replace(/\n/g, '<br>')}</div>`
    : `<div class="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm max-w-xl leading-relaxed shadow-sm">${formatAiResponse(text)}</div>`;

  msgEl.innerHTML = `${avatar}${bubble}`;
  container.appendChild(msgEl);

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
      <img src="/arka-white-logo.png" alt="ARKA" class="w-4 h-4 object-contain invert dark:invert-0">
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

async function sendAiMessage() {
  const input = document.getElementById('aiChatInput');
  const query = (input?.value || '').trim();
  if (!query || aiChatLoading) return;

  input.value = '';
  input.style.height = 'auto';
  const sendBtn = document.getElementById('aiChatSendBtn');
  if (sendBtn) sendBtn.disabled = true;
  aiChatLoading = true;

  addAiMessage('user', query);
  addAiTyping();

  try {
    const resp = await authFetch(`${API_BASE}/ai/ask`, {
      method: 'POST',
      body: JSON.stringify({ query })
    });
    const data = await resp.json();
    removeAiTyping();

    if (data.success === false) {
      addAiMessage('assistant', `⚠️ ${data.error || 'AI tidak merespons. Coba beberapa saat lagi.'}`);
    } else {
      const answer = data.data?.answer || data.answer || 'Tidak ada jawaban.';
      addAiMessage('assistant', answer);
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
  const container = document.getElementById('aiChatMessages');
  if (container) container.innerHTML = '';

  const scrollArea = document.getElementById('aiMessagesScroll');
  if (scrollArea) {
    scrollArea.classList.add('hidden');
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
