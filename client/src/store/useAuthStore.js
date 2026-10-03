import { create } from 'zustand';
import { api, getAuthToken, setAuthToken, setProviderToken, getProviderToken } from '../services/api';
import { createClient } from '@supabase/supabase-js';

export const useAuthStore = create((set, get) => ({
  user: null,
  token: getAuthToken(),
  providerToken: getProviderToken(),
  isLoading: true,
  supabase: null,

  initSupabase: async () => {
    try {
      const config = await api.getAuthConfig();
      if (config.supabaseUrl && config.supabaseAnonKey) {
        const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: {
            persistSession: true,
            storage: window.localStorage,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
        set({ supabase: client });
        return client;
      }
    } catch (err) {
      console.warn('Supabase client init warning:', err);
    }
    return null;
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      // 1. Check Supabase OAuth session if client is available
      const client = await get().initSupabase();
      if (client) {
        client.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN' && session) {
            setAuthToken(session.access_token);
            if (session.provider_token) setProviderToken(session.provider_token);
            set({
              user: session.user,
              token: session.access_token,
              providerToken: session.provider_token || null
            });
          } else if (event === 'SIGNED_OUT') {
            get().logout();
          }
        });

        const { data: { session } } = await client.auth.getSession();
        if (session) {
          setAuthToken(session.access_token);
          if (session.provider_token) setProviderToken(session.provider_token);
          set({
            user: session.user,
            token: session.access_token,
            providerToken: session.provider_token || null,
            isLoading: false
          });
          return;
        }
      }

      // 2. Fallback to local / owner JWT verification
      const token = getAuthToken();
      if (!token) {
        set({ user: null, token: null, isLoading: false });
        return;
      }

      const res = await api.verifyAuth();
      if (res.success && res.user) {
        set({ user: res.user, token, isLoading: false });
      } else {
        get().logout();
      }
    } catch {
      // Sesi invalid
      get().logout();
    } finally {
      set({ isLoading: false });
    }
  },

  login: async (email, password) => {
    const res = await api.login(email, password);
    if (res.success && res.token) {
      setAuthToken(res.token);
      if (res.providerToken) setProviderToken(res.providerToken);
      set({
        token: res.token,
        user: res.user || { email, username: res.username },
        providerToken: res.providerToken || null
      });
      return { success: true };
    }
    return { success: false, error: res.error || 'Login gagal.' };
  },

  logout: async () => {
    try {
      const { supabase } = get();
      if (supabase) await supabase.auth.signOut();
    } catch {}
    setAuthToken(null);
    setProviderToken(null);
    set({ user: null, token: null, providerToken: null, isLoading: false });
  }
}));
