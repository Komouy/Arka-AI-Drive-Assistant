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
    <div class="flex items-center justify-between w-full py-0.5">
      <div class="flex items-center gap-2 min-w-0">
        ${avatar ? `<img src="${escapeHtml(avatar)}" alt="Avatar" class="w-7 h-7 rounded-full object-cover flex-shrink-0" referrerpolicy="no-referrer">` : `<div class="w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs shrink-0"><i data-lucide="user" class="w-4 h-4"></i></div>`}
        <div class="flex flex-col min-w-0">
          <span class="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">${escapeHtml(name)}</span>
          <span class="text-[10px] text-zinc-400 font-mono truncate">${hasDrive ? 'Drive Terhubung' : 'Lokal'}</span>
        </div>
      </div>
      ${hasDrive 
        ? `<span class="inline-flex items-center gap-1 p-1 rounded-md text-emerald-600 dark:text-emerald-400" title="File disimpan di Google Drive pribadi"><i data-lucide="hard-drive" class="w-4 h-4"></i></span>`
        : `<button type="button" class="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition-colors flex-shrink-0 font-mono" onclick="handleGoogleLogin()" title="Hubungkan Google Drive"><i data-lucide="link" class="w-3 h-3"></i><span>Hubungkan</span></button>`
      }
    </div>
  `;
  badge.style.display = 'flex';
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

// ── Tab switching on login screen (Login ↔ Register) ─────────────────────────
function switchAuthTab(tab) {
  const loginTab  = document.getElementById('authTabLogin');
  const signupTab = document.getElementById('authTabSignup');
  const loginForm  = document.getElementById('loginFormSection');
  const signupForm = document.getElementById('signupFormSection');
  const errorEl    = document.getElementById('loginError');
  if (errorEl) errorEl.classList.add('hidden');

  if (tab === 'login') {
    loginTab?.classList.add('border-zinc-900', 'dark:border-zinc-100', 'text-zinc-900', 'dark:text-zinc-100');
    loginTab?.classList.remove('border-transparent', 'text-zinc-400');
    signupTab?.classList.remove('border-zinc-900', 'dark:border-zinc-100', 'text-zinc-900', 'dark:text-zinc-100');
    signupTab?.classList.add('border-transparent', 'text-zinc-400');
    loginForm?.classList.remove('hidden');
    signupForm?.classList.add('hidden');
  } else {
    signupTab?.classList.add('border-zinc-900', 'dark:border-zinc-100', 'text-zinc-900', 'dark:text-zinc-100');
    signupTab?.classList.remove('border-transparent', 'text-zinc-400');
    loginTab?.classList.remove('border-zinc-900', 'dark:border-zinc-100', 'text-zinc-900', 'dark:text-zinc-100');
    loginTab?.classList.add('border-transparent', 'text-zinc-400');
    signupForm?.classList.remove('hidden');
    loginForm?.classList.add('hidden');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl  = document.getElementById('loginError');
  const btn      = document.getElementById('loginBtn');

  if (errorEl) errorEl.classList.add('hidden');
  if (btn) { btn.disabled = true; btn.textContent = 'Masuk...'; }

  try {
    const res  = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const json = await res.json();

    if (res.ok && json.success && json.token) {
      saveToken(json.token);
      updateUserUI(json.user || { email });
      showDashboard();
    } else {
      if (errorEl) {
        errorEl.textContent = json.error || 'Login gagal. Periksa email dan kata sandi.';
        errorEl.classList.remove('hidden');
      }
      document.getElementById('loginPassword')?.select();
    }
  } catch {
    if (errorEl) {
      errorEl.textContent = 'Kesalahan jaringan — server mungkin tidak tersedia.';
      errorEl.classList.remove('hidden');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Masuk'; }
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const name     = document.getElementById('signupName').value.trim();
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirmP = document.getElementById('signupConfirm').value;
  const errorEl  = document.getElementById('loginError');
  const btn      = document.getElementById('signupBtn');

  if (errorEl) errorEl.classList.add('hidden');

  if (password !== confirmP) {
    if (errorEl) { errorEl.textContent = 'Kata sandi tidak cocok.'; errorEl.classList.remove('hidden'); }
    return;
  }
  if (password.length < 6) {
    if (errorEl) { errorEl.textContent = 'Kata sandi minimal 6 karakter.'; errorEl.classList.remove('hidden'); }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Mendaftar...'; }

  try {
    const res  = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    const json = await res.json();

    if (res.ok && json.success) {
      if (json.needsEmailConfirmation) {
        // Show success message, ask user to check email
        if (errorEl) {
          errorEl.className = 'text-xs text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg';
          errorEl.textContent = '✅ ' + json.message;
          errorEl.classList.remove('hidden');
        }
        switchAuthTab('login');
        const emailInput = document.getElementById('loginEmail');
        if (emailInput) emailInput.value = email;
      } else if (json.token) {
        // Auto-confirmed — log in directly
        saveToken(json.token);
        updateUserUI(json.user || { email });
        showDashboard();
      }
    } else {
      if (errorEl) {
        errorEl.className = 'text-xs text-red-500 dark:text-red-400 font-mono bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg';
        errorEl.textContent = json.error || 'Pendaftaran gagal.';
        errorEl.classList.remove('hidden');
      }
    }
  } catch {
    if (errorEl) {
      errorEl.textContent = 'Kesalahan jaringan — server mungkin tidak tersedia.';
      errorEl.classList.remove('hidden');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Daftar'; }
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
  if (typeof setFilter === 'function') {
    // Restore whichever tab the user was on before (persisted in sessionStorage)
    const savedFilter = typeof loadCurrentFilter === 'function' ? loadCurrentFilter() : 'overview';
    setFilter(savedFilter || 'overview');
  }
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
