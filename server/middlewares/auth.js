import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env.js';

function getJwtSecret() {
  return getEnv('JWT_SECRET') || 'arka-dev-secret-change-me';
}

/**
 * Express middleware — verifies the Bearer JWT on protected routes.
 * Attaches the decoded payload to `req.user`.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  // Support query parameter token for browser download links & media access
  if (!token && req.query?.token) {
    token = String(req.query.token).trim();
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded;
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Session expired — please log in again' : 'Invalid token';
    return res.status(401).json({ success: false, error: message });
  }
}
