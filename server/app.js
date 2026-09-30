import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRoutes from './routes/api.js';
import { initDatabase } from './database/db.js';
import { APP, STORAGE_DIR, ensureStorageDirs, loadEnv } from './config/env.js';
import { isSupabaseConfigured } from './config/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

// ── Config, storage & database bootstrap ─────────────────────────────────────
loadEnv();

// In local mode (without Supabase), ensure local storage & init SQLite
if (!isSupabaseConfigured()) {
  try {
    ensureStorageDirs();
    initDatabase();
  } catch (err) {
    console.warn('[DB] SQLite initialization skipped:', err.message);
  }
}

export const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static storage for previews and downloads (local fallback)
app.use('/storage', express.static(STORAGE_DIR));

// Serve Web Data Viewer (Files, Prompts & Links)
app.use(express.static(PUBLIC_DIR));
app.get(['/upload', '/viewer', '/data'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Mount REST API
app.use('/api', apiRoutes);

// Health check + endpoint index
app.get('/', (req, res) => {
  if (req.accepts('html') && !req.xhr && !req.headers['accept']?.includes('application/json')) {
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  res.json({
    status: 'online',
    name: APP.name,
    version: APP.version,
    database: isSupabaseConfigured() ? 'supabase' : 'sqlite',
    endpoints: {
      status:   'GET  /api/status',
      folders:  'GET  /api/folders · POST /api/folders · PATCH/DELETE /api/folders/:id',
      files:    'GET  /api/files · GET /api/files/:id · PATCH/DELETE /api/files/:id',
      upload:   'POST /api/files/upload',
      analyze:  'POST /api/files/:id/analyze',
      download: 'GET  /api/files/:id/download',
      trash:    'DELETE /api/trash',
      inbox:    'GET  /api/inbox · POST /api/inbox/:id/organize',
      prompts:  'GET/POST /api/prompts · PATCH/DELETE /api/prompts/:id',
      links:    'GET/POST /api/links · PATCH/DELETE /api/links/:id',
      aiStatus: 'GET  /api/ai/status',
      aiAsk:    'POST /api/ai/ask',
      aiReset:  'POST /api/ai/reset'
    }
  });
});

// ── Centralised error handling ───────────────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }
  if (err.name === 'MulterError') {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ success: false, error: `Upload rejected: ${err.message}` });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Payload too large' });
  }

  console.error('[ARKA Error]', err.stack || err.message);
  return res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

export default app;
