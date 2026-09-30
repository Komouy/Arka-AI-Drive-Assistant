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
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  // Support query parameter token for browser download links & media access
  if (!token && req.query?.token) {
    token = String(req.query.token).trim();
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

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
    return next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Session expired — please log in again' : 'Invalid token';
    return res.status(401).json({ success: false, error: message });
  }
}
