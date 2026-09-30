import jwt from 'jsonwebtoken';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from '../config/env.js';

const APP_USERNAME = 'Dhaifan';
const TOKEN_TTL    = '7d';

function getJwtSecret() {
  const secret = getEnv('JWT_SECRET');
  if (!secret) {
    console.warn('[AUTH] JWT_SECRET not set — using insecure fallback. Please set JWT_SECRET in .env!');
    return 'arka-dev-secret-change-me';
  }
  return secret;
}

/** Constant-time string comparison to prevent timing attacks */
function safeEquals(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  // Pad to same length to avoid length-based timing leaks
  const maxLen = Math.max(aBuf.length, bBuf.length);
  const paddedA = Buffer.concat([aBuf, Buffer.alloc(maxLen - aBuf.length)]);
  const paddedB = Buffer.concat([bBuf, Buffer.alloc(maxLen - bBuf.length)]);
  return timingSafeEqual(paddedA, paddedB) && aBuf.length === bBuf.length;
}

export const authController = {
  /**
   * POST /api/auth/login
   * Body: { username, password }
   * Returns: { success, token, username }
   */
  login: (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const expectedPassword = getEnv('ARKA_PASSWORD');
    if (!expectedPassword) {
      return res.status(503).json({
        success: false,
        error: 'Server authentication not configured. Please set ARKA_PASSWORD in environment variables.'
      });
    }

    const usernameMatch = String(username).trim().toLowerCase() === APP_USERNAME.toLowerCase();
    const passwordMatch = safeEquals(String(password), expectedPassword);

    if (!usernameMatch || !passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { sub: APP_USERNAME, role: 'owner' },
      getJwtSecret(),
      { expiresIn: TOKEN_TTL }
    );

    return res.json({
      success: true,
      token,
      username: APP_USERNAME,
      expiresIn: TOKEN_TTL
    });
  },

  /**
   * GET /api/auth/verify
   * Validates the current Bearer token. req.user is set by requireAuth middleware.
   */
  verify: (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    return res.json({ success: true, username: req.user.sub });
  }
};
