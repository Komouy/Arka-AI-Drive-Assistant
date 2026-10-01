/**
 * ARKA — SQLite Database (Local Mode Only)
 *
 * Safe to import in any environment — SQLite is initialised lazily and
 * only when actually needed. On Vercel/cloud (Supabase mode) the db is
 * never opened and controllers use Supabase instead.
 */

import { createRequire } from 'node:module';
import { DATABASE_FILE, ensureStorageDirs } from '../config/env.js';

const _require = createRequire(import.meta.url);

let _db = null;
let _initAttempted = false;

/** Returns the singleton SQLite connection, initialising it on first call. */
function openDb() {
  if (_initAttempted) return _db;
  _initAttempted = true;

  try {
    const { DatabaseSync } = _require('node:sqlite');
    ensureStorageDirs();
    _db = new DatabaseSync(DATABASE_FILE);
    _db.exec('PRAGMA journal_mode = WAL;');
    _db.exec('PRAGMA foreign_keys = ON;');
  } catch (err) {
    console.warn('[DB] SQLite not available (cloud/serverless mode):', err.message);
    _db = null;
  }

  return _db;
}

/**
 * Proxy shim — controllers can do `db.prepare(...)` directly.
 * In cloud mode (Supabase), controllers should never call db methods;
 * the proxy throws a clear error if they do.
 */
export const db = new Proxy({}, {
  get(_target, prop) {
    const database = openDb();
    if (!database) {
      throw new Error(`[DB] SQLite not available. Use Supabase in cloud mode. (Attempted: db.${String(prop)})`);
    }
    const value = database[prop];
    return typeof value === 'function' ? value.bind(database) : value;
  }
});

export function initDatabase() {
  const database = openDb();
  if (!database) {
    console.warn('[DB] initDatabase() skipped — SQLite not available.');
    return;
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER DEFAULT NULL,
      color TEXT DEFAULT '#6366f1',
      icon TEXT DEFAULT 'folder',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id INTEGER DEFAULT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      path TEXT NOT NULL,
      is_inbox INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      is_trash INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS file_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL UNIQUE,
      description TEXT,
      category TEXT,
      project TEXT,
      tags TEXT,
      suggested_name TEXT,
      suggested_folder TEXT,
      ai_analyzed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      tags TEXT,
      is_favorite INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT,
      description TEXT,
      category TEXT DEFAULT 'General',
      tags TEXT,
      domain TEXT,
      is_favorite INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: ensure is_inbox column exists
  try {
    const tableInfo = database.prepare('PRAGMA table_info(files)').all();
    if (!tableInfo.some(col => col.name === 'is_inbox')) {
      database.exec('ALTER TABLE files ADD COLUMN is_inbox INTEGER DEFAULT 0;');
    }
  } catch (err) {
    console.error('[DB] Migration check error:', err);
  }

  // Migration: ensure the AI suggestion columns exist (mirrors phase4_smart_ai_triage.sql)
  try {
    const metaInfo = database.prepare('PRAGMA table_info(file_metadata)').all();
    if (!metaInfo.some(col => col.name === 'suggested_name')) {
      database.exec('ALTER TABLE file_metadata ADD COLUMN suggested_name TEXT;');
    }
    if (!metaInfo.some(col => col.name === 'suggested_folder')) {
      database.exec('ALTER TABLE file_metadata ADD COLUMN suggested_folder TEXT;');
    }
  } catch (err) {
    console.error('[DB] file_metadata suggestion columns migration error:', err);
  }

  // Seed default folders
  const folderCount = database.prepare('SELECT COUNT(*) as count FROM folders').get().count;
  if (folderCount === 0) {
    const ins = database.prepare('INSERT INTO folders (name, parent_id, color, icon) VALUES (?, ?, ?, ?)');
    ins.run('Projects', null, '#6366f1', 'folder-kanban');
    const projectsId = database.prepare('SELECT id FROM folders WHERE name = ?').get('Projects').id;
    ins.run('Website', projectsId, '#3b82f6', 'globe');
    ins.run('Instagram', projectsId, '#ec4899', 'instagram');
    ins.run('TikTok', projectsId, '#06b6d4', 'video');
    ins.run('Programming', projectsId, '#10b981', 'code');
    ins.run('Personal', null, '#f59e0b', 'user');
    console.log('[DB] Seeded default folder structure.');
  }

  // Seed sample prompts
  const promptCount = database.prepare('SELECT COUNT(*) as count FROM prompts').get().count;
  if (promptCount === 0) {
    const ins = database.prepare('INSERT INTO prompts (title, content, category, tags) VALUES (?, ?, ?, ?)');
    ins.run('Instagram Carousel Database Design', 'Create an engaging 5-slide carousel explaining Database Normalization for beginner software engineers with visual metaphors.', 'Social Media', 'carousel,instagram,database,tech');
    ins.run('Minimalist Modern UI Mockup', 'Generate a sleek dark-mode personal AI workspace dashboard with glassmorphic cards, indigo accents, and clean typography.', 'Image Generation', 'ui,dark-mode,glassmorphism,midjourney');
  }
}
