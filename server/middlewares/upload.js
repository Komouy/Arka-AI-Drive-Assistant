import multer from 'multer';
import path from 'node:path';
import { UPLOADS_DIR, INBOX_DIR, ensureDir } from '../config/env.js';
import { isSupabaseConfigured } from '../config/supabase.js';

/** Max size per uploaded file (override with ARKA_MAX_UPLOAD_MB). */
export const MAX_UPLOAD_BYTES = Math.max(1, Number(process.env.ARKA_MAX_UPLOAD_MB) || 500) * 1024 * 1024;

/** Make a filename safe for the filesystem while keeping it recognisable. */
export function buildStoredName(originalName = 'file') {
  const cleanOriginalName = path.basename(String(originalName)).replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const ext = path.extname(cleanOriginalName);
  const base = path.basename(cleanOriginalName, ext).slice(0, 80) || 'file';
  return `${base}-${uniqueSuffix}${ext}`;
}

/** Where an upload should land before the controller (re)places it. */
export function targetDirFor(body = {}, query = {}, reqPath = '') {
  const wantsInbox = body.inbox === 'true' || query.inbox === 'true' || String(reqPath).includes('/inbox');
  return ensureDir(wantsInbox ? INBOX_DIR : UPLOADS_DIR);
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, targetDirFor(req.body, req.query, req.path));
  },
  filename: (req, file, cb) => {
    cb(null, buildStoredName(file.originalname));
  }
});

// In serverless (Vercel) or when Supabase Cloud is used, use memoryStorage
const isCloudOrServerless = isSupabaseConfigured() || Boolean(process.env.VERCEL);
const storage = isCloudOrServerless ? multer.memoryStorage() : diskStorage;

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 50
  }
});

export default uploadMiddleware;

