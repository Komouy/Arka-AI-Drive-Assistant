/**
 * ARKA Auth Controller — Multi-User (Supabase Auth)
 *
 * Supports:
 *  1. Email + Password signup/login via Supabase Auth (each user = unique UUID)
 *  2. Google OAuth via Supabase (handled client-side, server just validates token)
 *  3. Legacy owner password login (kept for backward-compat, owner-only)
 */

import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';
import { getEnv } from '../config/env.js';
import { isSupabaseConfigured, getSupabaseClient } from '../config/supabase.js';

const TOKEN_TTL = '7d';

function getJwtSecret() {
  return getEnv('JWT_SECRET') || 'arka-dev-secret-change-me';
}

function safeEquals(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  const maxLen = Math.max(aBuf.length, bBuf.length);
  const paddedA = Buffer.concat([aBuf, Buffer.alloc(maxLen - aBuf.length)]);
  const paddedB = Buffer.concat([bBuf, Buffer.alloc(maxLen - bBuf.length)]);
  return timingSafeEqual(paddedA, paddedB) && aBuf.length === bBuf.length;
}

export const authController = {

  /**
   * POST /api/auth/signup
   * Body: { email, password, name? }
   * Creates a new user via Supabase Auth.
   */
  signup: async (req, res) => {
    const { email, password, name } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email dan kata sandi wajib diisi' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Kata sandi minimal 6 karakter' });
    }

    if (!isSupabaseConfigured()) {
      return res.status(503).json({ success: false, error: 'Supabase belum dikonfigurasi di server' });
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { full_name: name || email.split('@')[0] } }
      });

      if (error) {
        let msg = error.message;
        if (msg.includes('already registered')) msg = 'Email sudah terdaftar. Silakan login.';
        if (msg.includes('invalid email')) msg = 'Format email tidak valid.';
        if (msg.includes('Password should')) msg = 'Kata sandi terlalu lemah (minimal 6 karakter).';
        return res.status(400).json({ success: false, error: msg });
      }

      const needsConfirmation = !data.session;
      return res.json({
        success: true,
        needsEmailConfirmation: needsConfirmation,
        message: needsConfirmation
          ? 'Pendaftaran berhasil! Silakan periksa email untuk konfirmasi.'
          : 'Pendaftaran berhasil! Anda sudah masuk.',
        token: data.session?.access_token || null,
        user: data.user ? {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name
        } : null
      });
    } catch (err) {
      console.error('[AUTH] signup error:', err.message);
      return res.status(500).json({ success: false, error: 'Terjadi kesalahan saat mendaftar' });
    }
  },

  /**
   * POST /api/auth/login
   * Body: { email, password }   → Supabase Auth login (multi-user)
   * Body: { username, password } → legacy owner-only login (backward compat)
   */
  login: async (req, res) => {
    const { email, password, username } = req.body || {};

    // ── Legacy owner password login ────────────────────────────────────────────
    const ownerPassword = getEnv('ARKA_PASSWORD');
    if (ownerPassword && username && !email) {
      if (!password) {
        return res.status(400).json({ success: false, error: 'Nama pengguna dan kata sandi wajib diisi' });
      }
      const usernameMatch = String(username).trim().toLowerCase() === 'dhaifan';
      const passwordMatch = safeEquals(String(password), ownerPassword);
      if (!usernameMatch || !passwordMatch) {
        return res.status(401).json({ success: false, error: 'Nama pengguna atau kata sandi salah' });
      }
      const token = jwt.sign({ sub: 'dhaifan', role: 'owner' }, getJwtSecret(), { expiresIn: TOKEN_TTL });
      return res.json({ success: true, token, username: 'Dhaifan', expiresIn: TOKEN_TTL });
    }

    // ── Supabase Auth email/password login ─────────────────────────────────────
    const loginEmail = (email || username || '').trim().toLowerCase();
    if (!loginEmail || !password) {
      return res.status(400).json({ success: false, error: 'Email dan kata sandi wajib diisi' });
    }

    if (!isSupabaseConfigured()) {
      return res.status(503).json({ success: false, error: 'Supabase belum dikonfigurasi di server' });
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });

      if (error) {
        let msg = error.message;
        if (msg.includes('Invalid login')) msg = 'Email atau kata sandi salah.';
        if (msg.includes('Email not confirmed')) msg = 'Email belum dikonfirmasi. Periksa kotak masuk Anda.';
        if (msg.includes('Too many requests')) msg = 'Terlalu banyak percobaan. Coba beberapa menit lagi.';
        return res.status(401).json({ success: false, error: msg });
      }

      return res.json({
        success: true,
        token: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at,
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name || data.user.email
        }
      });
    } catch (err) {
      console.error('[AUTH] login error:', err.message);
      return res.status(500).json({ success: false, error: 'Terjadi kesalahan saat login' });
    }
  },

  /**
   * GET /api/auth/verify
   * Validates Bearer token — req.user set by requireAuth middleware.
   */
  verify: (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Belum terautentikasi' });
    }
    return res.json({
      success: true,
      username: req.user.email || req.user.sub,
      user: req.user
    });
  },

  /**
   * GET /api/auth/config
   * Public config: Supabase URL + anon key for client-side SDK init.
   */
  getConfig: (req, res) => {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY');
    return res.json({
      success: true,
      supabaseUrl: supabaseUrl || null,
      supabaseAnonKey: supabaseAnonKey || null,
      googleAuthEnabled: Boolean(supabaseUrl && supabaseAnonKey),
      emailAuthEnabled: Boolean(supabaseUrl && supabaseAnonKey)
    });
  }
};


