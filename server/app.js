import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import apiRoutes from './routes/api.js';
import { initDatabase } from './database/db.js';
import { APP, STORAGE_DIR, ensureStorageDirs, loadEnv } from './config/env.js';
import { isSupabaseConfigured } from './config/supabase.js';
import { autoOrganizeStartupSweep } from './controllers/fileController.js';

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

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Provider-Token', 'apikey']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static files ──────────────────────────────────────────────────────────────
// Serve local storage files for previews and downloads
app.use('/storage', express.static(STORAGE_DIR));

// Serve Web UI (Files, Prompts & Links)
app.use(express.static(PUBLIC_DIR));
app.get(['/upload', '/viewer', '/data'], (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});
app.get('/privacy', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'privacy.html')));
app.get('/terms',   (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'terms.html')));

// ── REST API ──────────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ── Health check / endpoint index ────────────────────────────────────────────
// Return JSON only when client explicitly requests it (e.g. CLI, Postman, tests).
// Browsers send Accept: text/html,*/* so they always get the UI.
app.get('/', (req, res) => {
  const wantsJson = req.headers['accept']?.includes('application/json');
  if (!wantsJson) {
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

// ── Centralised error handling ────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ success: false, error: 'Body JSON tidak valid' });
  }
  if (err.name === 'MulterError') {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ success: false, error: `Upload ditolak: ${err.message}` });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Ukuran payload terlalu besar' });
  }
  console.error('[ARKA Error]', err.stack || err.message);
  return res.status(500).json({ success: false, error: err.message || 'Kesalahan server internal' });
});

// ── Startup background tasks ──────────────────────────────────────────────────
// Run after all routes are registered so the server is ready
autoOrganizeStartupSweep().catch(err =>
  console.warn('[ARKA AI] Startup auto-organize sweep skipped:', err.message)
);

export default app;
