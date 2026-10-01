// ── ARKA Floating Assistant Overlay Module ──────────────────────────────────
let aiChatOpen = false;
let aiChatLoading = false;
let aiChatHasMessages = false;

function toggleAiChat() {
  if (aiChatOpen) {
    aiChatOpen = false;
    document.getElementById('aiChatOverlay')?.classList.remove('open');
    document.getElementById('aiChatBtn')?.classList.remove('active');
    document.body.classList.remove('ai-overlay-active');
    return;
  }

  const isDashboardVisible = !document.getElementById('dashboard')?.classList.contains('hidden');
  if (!isDashboardVisible) {
    showToast('warn', 'Silakan masuk terlebih dahulu untuk mengakses Arka Assistant.');
    return;
  }

  aiChatOpen = true;
  document.getElementById('aiChatOverlay')?.classList.add('open');
  document.getElementById('aiChatBtn')?.classList.add('active');
  document.body.classList.add('ai-overlay-active');
  refreshIcons();

  setTimeout(() => {
    const input = document.getElementById('aiChatInput');
    if (input) {
      input.focus();
      aiChatAutoResize(input);
    }
  }, 150);
}

function aiChatAutoResize(el) {
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
  safe = safe.replace(/```(?:[a-zA-Z0-9_\-]+)?\n?([\s\S]*?)```/g, '<pre class="bg-zinc-950 p-2.5 rounded border border-zinc-800 text-xs font-mono my-2 overflow-x-auto text-zinc-200"><code>$1</code></pre>');
  safe = safe.replace(/`([^`]+)`/g, '<code class="bg-zinc-800 text-amber-300 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>');
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-zinc-100">$1</strong>');
  safe = safe.replace(/(?:^|\n)[-*]\s+(.+)/g, '<li class="ml-4 list-disc text-zinc-300">$1</li>');
  safe = safe.replace(/(<li class="ml-4 list-disc text-zinc-300">[\s\S]+?<\/li>)/g, '<ul class="my-1 space-y-0.5">$1</ul>');
  safe = safe.replace(/<\/ul>\s*<ul class="my-1 space-y-0.5">/g, '');
  safe = safe.replace(/\n/g, '<br>');
  safe = safe.replace(/<\/ul><br>/g, '</ul>');
  safe = safe.replace(/<\/pre><br>/g, '</pre>');
  return safe;
}

function addAiMessage(role, text) {
  const overlay = document.getElementById('aiChatOverlay');
  if (overlay && !overlay.classList.contains('has-messages')) {
    overlay.classList.add('has-messages');
    aiChatHasMessages = true;
  }

  const container = document.getElementById('aiChatMessages');
  if (!container) return;

  const msgEl = document.createElement('div');
  const isUser = role === 'user';
  msgEl.className = `flex gap-3 items-start ${isUser ? 'flex-row-reverse' : ''} fade-in-fast`;

  const avatar = isUser
    ? `<div class="w-8 h-8 rounded-full bg-zinc-700 text-white flex items-center justify-center font-mono text-xs font-semibold flex-shrink-0">U</div>`
    : `<div class="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0"><img src="/arka-white-logo.png" alt="ARKA" class="w-4 h-4 object-contain"></div>`;

  const bubble = isUser
    ? `<div class="bg-zinc-800 text-zinc-100 px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm max-w-lg leading-relaxed shadow-sm">${escapeHtmlAi(text).replace(/\n/g, '<br>')}</div>`
    : `<div class="bg-zinc-900 border border-zinc-800 text-zinc-200 px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm max-w-xl leading-relaxed shadow-sm prose-invert">${formatAiResponse(text)}</div>`;

  msgEl.innerHTML = `${avatar}${bubble}`;
  container.appendChild(msgEl);

  const scrollArea = document.getElementById('aiMessagesScroll');
  if (scrollArea) {
    scrollArea.scrollTop = scrollArea.scrollHeight;
  }

  refreshIcons();
  return msgEl;
}

function addAiTyping() {
  const container = document.getElementById('aiChatMessages');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'flex gap-3 items-start fade-in-fast';
  el.id = 'aiTypingIndicator';
  el.innerHTML = `
    <div class="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
      <img src="/arka-white-logo.png" alt="ARKA" class="w-4 h-4 object-contain">
    </div>
    <div class="bg-zinc-900 border border-zinc-800 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5 text-zinc-400">
      <span class="w-2 h-2 rounded-full bg-amber-400/80 animate-bounce"></span>
      <span class="w-2 h-2 rounded-full bg-amber-400/80 animate-bounce [animation-delay:0.2s]"></span>
      <span class="w-2 h-2 rounded-full bg-amber-400/80 animate-bounce [animation-delay:0.4s]"></span>
    </div>
  `;
  container.appendChild(el);

  const scrollArea = document.getElementById('aiMessagesScroll');
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
  const overlay = document.getElementById('aiChatOverlay');
  if (overlay) overlay.classList.remove('has-messages');
  aiChatHasMessages = false;

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
