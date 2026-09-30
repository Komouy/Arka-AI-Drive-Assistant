import { DatabaseSync } from 'node:sqlite';
import { DATABASE_FILE, ensureStorageDirs } from '../config/env.js';

// Ensure /storage, /storage/uploads, /storage/inbox and /database exist
ensureStorageDirs();

export const db = new DatabaseSync(DATABASE_FILE);

// Enable WAL mode & foreign keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  db.exec(`
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

  // Ensure is_inbox column exists (for migrations if needed)
  try {
    const tableInfo = db.prepare("PRAGMA table_info(files)").all();
    const hasInbox = tableInfo.some(col => col.name === 'is_inbox');
    if (!hasInbox) {
      db.exec("ALTER TABLE files ADD COLUMN is_inbox INTEGER DEFAULT 0;");
    }
  } catch (err) {
    console.error("Migration check:", err);
  }

  // Seed default folders if empty
  const folderCount = db.prepare('SELECT COUNT(*) as count FROM folders').get().count;
  if (folderCount === 0) {
    const insertFolder = db.prepare('INSERT INTO folders (name, parent_id, color, icon) VALUES (?, ?, ?, ?)');
    
    insertFolder.run('Projects', null, '#6366f1', 'folder-kanban');
    const projectsId = db.prepare('SELECT id FROM folders WHERE name = ?').get('Projects').id;

    insertFolder.run('Website', projectsId, '#3b82f6', 'globe');
    insertFolder.run('Instagram', projectsId, '#ec4899', 'instagram');
    insertFolder.run('TikTok', projectsId, '#06b6d4', 'video');
    insertFolder.run('Programming', projectsId, '#10b981', 'code');
    insertFolder.run('Personal', null, '#f59e0b', 'user');

    console.log('✨ Seeded default ARKA folder structure.');
  }

  // Seed sample prompt categories if empty
  const promptCount = db.prepare('SELECT COUNT(*) as count FROM prompts').get().count;
  if (promptCount === 0) {
    const insertPrompt = db.prepare('INSERT INTO prompts (title, content, category, tags) VALUES (?, ?, ?, ?)');
    insertPrompt.run(
      'Instagram Carousel Database Design',
      'Create an engaging 5-slide carousel explaining Database Normalization for beginner software engineers with visual metaphors.',
      'Social Media',
      'carousel,instagram,database,tech'
    );
    insertPrompt.run(
      'Minimalist Modern UI Mockup',
      'Generate a sleek dark-mode personal AI workspace dashboard with glassmorphic cards, indigo accents, and clean typography.',
      'Image Generation',
      'ui,dark-mode,glassmorphism,midjourney'
    );
  }
}
