import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env.js';
import { isSupabaseConfigured, getSupabaseClient } from '../config/supabase.js';

function getJwtSecret() {
  return getEnv('JWT_SECRET') || 'arka-dev-secret-change-me';
}

/**
 * Express middleware — verifies the Bearer JWT on protected routes.
 * Supports both:
 * 1) Supabase OAuth access tokens (from Google Sign-In)
 * 2) Custom signed JWTs (from owner password login)
 * Attaches the decoded user payload to `req.user`.
 * Also attaches `req.providerToken` (Google Drive access token) if present.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  // Support query parameter token for browser download links & media access
  if (!token && req.query?.token) {
    token = String(req.query.token).trim();
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Autentikasi diperlukan' });
  }

  // Extract Google Drive provider token from header (sent as X-Provider-Token)
  const providerToken = req.headers['x-provider-token'] || null;

  // 1. Verify via Supabase Auth if Supabase is active
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase.auth.getUser(token);
        if (data?.user && !error) {
          req.user = {
            id: data.user.id,
            sub: data.user.email || data.user.id,
            email: data.user.email,
            role: 'authenticated',
            user_metadata: data.user.user_metadata || {}
          };
          req.providerToken = providerToken; // Google Drive access token
          return next();
        }
      }
    } catch {
      // Fallback to local JWT verification below
    }
  }

  // 2. Fallback to local JWT verification (for owner password login)
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded;
    req.providerToken = providerToken; // may be null for password login
    return next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Sesi kedaluwarsa — silakan login lagi' : 'Token tidak valid';
    return res.status(401).json({ success: false, error: message });
  }
}

