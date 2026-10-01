// ── ARKA Authentication Module ───────────────────────────────────────────────
const TOKEN_KEY = 'arka_token';
const PROVIDER_TOKEN_KEY = 'arka_provider_token';

async function initSupabase() {
  if (supabaseClient) return supabaseClient;
  try {
    const res = await fetch(`${API_BASE}/auth/config`);
    if (res.ok) {
      const config = await res.json();
      if (config.supabaseUrl && config.supabaseAnonKey && window.supabase) {
        supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: {
            persistSession: true,
            storage: window.localStorage,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
      }
    }
  } catch (err) {
    console.warn('Gagal memuat konfigurasi auth Supabase:', err);
  }
  return supabaseClient;
}

function updateUserUI(user) {
  const badge = document.getElementById('userProfileBadge');
  if (!badge) return;
  if (!user) {
    badge.style.display = 'none';
    badge.innerHTML = '';
    return;
  }

  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email || user.username || 'Pengguna';
  const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const pt = providerToken || loadProviderToken();
  const hasDrive = Boolean(pt);

  badge.innerHTML = `
    <div class="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-mono text-zinc-700 dark:text-zinc-300">
      ${avatar ? `<img src="${escapeHtml(avatar)}" alt="Avatar" class="w-4 h-4 rounded-full object-cover flex-shrink-0" referrerpolicy="no-referrer">` : '<i data-lucide="user" class="w-3.5 h-3.5 text-zinc-400 flex-shrink-0"></i>'}
      <span class="font-medium max-w-[70px] sm:max-w-[140px] truncate text-zinc-800 dark:text-zinc-200">${escapeHtml(name)}</span>
      ${hasDrive 
        ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex-shrink-0" title="File disimpan di Google Drive pribadi"><i data-lucide="hard-drive" class="w-3 h-3"></i><span class="hidden sm:inline"> Drive</span></span>`
        : `<button type="button" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 transition-colors flex-shrink-0 shadow-sm" onclick="handleGoogleLogin()" title="Hubungkan Google Drive"><i data-lucide="link" class="w-3 h-3 text-amber-500 dark:text-amber-400"></i><span class="hidden sm:inline"> Hubungkan Drive</span><span class="sm:hidden"> Hubungkan</span></button>`
      }
    </div>
  `;
  badge.style.display = 'inline-flex';
  refreshIcons();
}

async function handleGoogleLogin() {
  const btn = document.getElementById('btnGoogleLogin');
  const errorEl = document.getElementById('loginError');
  if (errorEl) errorEl.classList.add('hidden');

  try {
    const client = await initSupabase();
    if (!client) {
      if (errorEl) {
        errorEl.textContent = 'Autentikasi Supabase belum dikonfigurasi di server.';
        errorEl.classList.remove('hidden');
      }
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.6';
    }
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/drive.file',
        redirectTo: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? window.location.origin
          : 'https://arka-ai-drive-assistant.vercel.app'
      }
    });
    if (error) throw error;
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message || 'Login Google gagal.';
      errorEl.classList.remove('hidden');
    }
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl  = document.getElementById('loginError');
  const btn      = document.getElementById('loginBtn');

  if (errorEl) errorEl.classList.add('hidden');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Masuk...';
  }

  try {
    const res  = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const json = await res.json();

    if (res.ok && json.success && json.token) {
      saveToken(json.token);
      updateUserUI({ username: 'Dhaifan (Owner)' });
      showDashboard();
    } else {
      if (errorEl) {
        errorEl.textContent = json.error || 'Login gagal. Periksa username dan sandi.';
        errorEl.classList.remove('hidden');
      }
      const passInput = document.getElementById('loginPassword');
      if (passInput) {
        passInput.value = '';
        passInput.focus();
      }
    }
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = 'Kesalahan jaringan — server mungkin tidak tersedia.';
      errorEl.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Masuk dengan Kata Sandi';
    }
  }
}

async function handleLogout() {
  try {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
  } catch (err) {
    console.warn('Gagal sign out:', err);
  }
  clearToken();
  clearProviderToken();
  updateUserUI(null);
  allData = { files: [], prompts: [], links: [], folders: [], trash: [] };
  const passInput = document.getElementById('loginPassword');
  if (passInput) passInput.value = '';
  const errorEl = document.getElementById('loginError');
  if (errorEl) errorEl.classList.add('hidden');

  const dash = document.getElementById('dashboard');
  if (dash) dash.classList.add('hidden');
  const login = document.getElementById('loginScreen');
  if (login) login.classList.remove('hidden');
  refreshIcons();
}

function showDashboard() {
  const login = document.getElementById('loginScreen');
  if (login) login.classList.add('hidden');
  const dash = document.getElementById('dashboard');
  if (dash) dash.classList.remove('hidden');
  refreshIcons();
  loadStatus();
  fetchAllData();
}

async function checkAuthOnLoad() {
  const client = await initSupabase();
  if (client) {
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && session.access_token) {
        saveToken(session.access_token);
        if (session.provider_token) saveProviderToken(session.provider_token);
        updateUserUI(session.user);
        showDashboard();
      } else if (event === 'TOKEN_REFRESHED' && session) {
        saveToken(session.access_token);
        if (session.provider_token) saveProviderToken(session.provider_token);
      } else if (event === 'SIGNED_OUT') {
        clearToken();
        clearProviderToken();
        updateUserUI(null);
      }
    });

    const { data: { session } } = await client.auth.getSession();
    if (session && session.access_token) {
      saveToken(session.access_token);
      if (session.provider_token) saveProviderToken(session.provider_token);
      updateUserUI(session.user);
      showDashboard();
      return;
    }
  }

  const token = loadToken();
  if (!token) return;
  loadProviderToken();

  try {
    const res = await fetch(`${API_BASE}/auth/verify`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.user) updateUserUI(data.user);
      showDashboard();
    } else {
      clearToken();
    }
  } catch {
    if (token) showDashboard();
  }
}
