import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env.js';
import { isSupabaseConfigured, getSupabaseClient } from '../config/supabase.js';

function getJwtSecret() {
  return getEnv('JWT_SECRET') || 'arka-dev-secret-change-me';
}

// In-memory token cache (TTL: 60s) to prevent redundant network roundtrips to Supabase Auth
const tokenUserCache = new Map();
const TOKEN_CACHE_TTL_MS = 60 * 1000;

function getCachedUser(token) {
  const entry = tokenUserCache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tokenUserCache.delete(token);
    return null;
  }
  return entry.user;
}

function setCachedUser(token, user) {
  if (tokenUserCache.size > 500) {
    const firstKey = tokenUserCache.keys().next().value;
    tokenUserCache.delete(firstKey);
  }
  tokenUserCache.set(token, { user, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
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
    const cachedUser = getCachedUser(token);
    if (cachedUser) {
      req.user = cachedUser;
      req.providerToken = providerToken;
      return next();
    }

    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase.auth.getUser(token);
        if (data?.user && !error) {
          const userObj = {
            id: data.user.id,
            sub: data.user.email || data.user.id,
            email: data.user.email,
            role: 'authenticated',
            user_metadata: data.user.user_metadata || {}
          };
          setCachedUser(token, userObj);
          req.user = userObj;
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

/**
 * Express middleware — attempts to populate `req.user` if a Bearer token is
 * provided, but does not reject the request if absent or expired.
 */
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token && req.query?.token) {
    token = String(req.query.token).trim();
  }

  if (!token) return next();

  const providerToken = req.headers['x-provider-token'] || null;

  if (isSupabaseConfigured()) {
    const cachedUser = getCachedUser(token);
    if (cachedUser) {
      req.user = cachedUser;
      req.providerToken = providerToken;
      return next();
    }

    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase.auth.getUser(token);
        if (data?.user && !error) {
          const userObj = {
            id: data.user.id,
            sub: data.user.email || data.user.id,
            email: data.user.email,
            role: 'authenticated',
            user_metadata: data.user.user_metadata || {}
          };
          setCachedUser(token, userObj);
          req.user = userObj;
          req.providerToken = providerToken;
          return next();
        }
      }
    } catch {
      // Fall through to local verification
    }
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded;
    req.providerToken = providerToken;
  } catch {
    // Leave req.user empty for optional auth
  }

  return next();
}
