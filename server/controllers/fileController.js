import { db } from '../database/db.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { UPLOADS_DIR, INBOX_DIR, STORAGE_DIR } from '../config/env.js';
import { isSupabaseConfigured, getSupabaseClient, BUCKET_NAME } from '../config/supabase.js';
import { uploadToGoogleDrive, deleteFromGoogleDrive, downloadFromGoogleDrive } from './driveController.js';
import { getFileTypeCategory, resolveMimeType } from '../utils/fileTypes.js';
import { resolveTargetFolder, resolveTargetFolderSupabase, pruneEmptyFolders } from '../utils/folders.js';
import { likePattern, ESCAPE_LIKE } from '../utils/search.js';
import { fail, badRequest, notFound, ok } from '../utils/http.js';

/** Clamp the `?limit=` query parameter to a sane range. */
function normalizeLimit(value, fallback = 200, max = 1000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

/**
 * Mengambil seluruh nama folder yang sudah ada di workspace
 */
async function getExistingFolderNames(userId = null) {
  try {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      let query = supabase.from('folders').select('name');
      if (userId) query = query.or(`user_id.eq.${userId},user_id.is.null`);
      const { data } = await query;
      return (data || []).map(f => f.name).filter(Boolean);
    }
    const rows = db.prepare('SELECT name FROM folders').all();
    return (rows || []).map(r => r.name).filter(Boolean);
  } catch (err) {
    console.warn('[ARKA] getExistingFolderNames error:', err.message);
    return [];
  }
}

/**
 * Run AI analysis for an uploaded file and persist the result.
 */
async function triggerAIAnalysis(fileId, filePath, mimeType, filename, userId = null) {
  try {
    const existingFolders = await getExistingFolderNames(userId);
    const { analyzeFile } = await import('../ai/analyzer.js');
    const metadata = await analyzeFile(filePath, mimeType, filename, { existingFolders });

    if (!metadata.ok) {
      console.warn(`[ARKA AI] ⚠️  Analysis failed for file ID ${fileId} (${filename}): ${metadata.error}. Metadata NOT saved.`);
      return metadata;
    }

    if (isSupabaseConfigured()) {
      await saveMetadataSupabase(fileId, metadata, userId);
    } else {
      saveMetadata(fileId, metadata);
    }
    console.log(`[ARKA AI] 💾 Metadata saved for file ID ${fileId} (provider: ${metadata.provider})`);

    // AI automatically creates folder and organizes file without requiring manual button clicks
    await autoOrganizeFileByAiSuggestion(fileId, metadata, userId);

    return metadata;
  } catch (err) {
    console.warn(`[ARKA AI] ⚠️  Analysis skipped for file ID ${fileId}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * Automatically create folder and move file into it based on AI suggestion.
 * Preserves manual folder assignment if user already explicitly selected one.
 */
export async function autoOrganizeFileByAiSuggestion(fileId, metadata, userId = null) {
  try {
    const rawSugg = metadata?.suggestedFolder || metadata?.project || '';
    const folderSuggestion = String(rawSugg).trim();
    if (!folderSuggestion || folderSuggestion.toLowerCase() === 'root' || folderSuggestion.toLowerCase() === 'general') {
      return null;
    }

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      let query = supabase.from('files').select('id, folder_id, is_inbox, is_trash').eq('id', fileId);
      if (userId) query = query.or(`user_id.eq.${userId},user_id.is.null`);
      const { data: file } = await query.maybeSingle();
      if (!file || file.is_trash) return null;
      if (file.folder_id) return null; // Already assigned

      const targetFolderId = await resolveTargetFolderSupabase(supabase, folderSuggestion, userId);
      if (targetFolderId) {
        await supabase.from('files').update({
          folder_id: targetFolderId,
          is_inbox: false,
          updated_at: new Date().toISOString()
        }).eq('id', fileId);
        console.log(`[ARKA AI] 📁 [Auto-Folder] File ID ${fileId} automatically moved to folder "${folderSuggestion}" (${targetFolderId})`);
        return targetFolderId;
      }
    } else {
      // SQLite
      const file = db.prepare('SELECT id, folder_id, is_inbox, is_trash, stored_name, path FROM files WHERE id = ?').get(Number(fileId));
      if (!file || file.is_trash === 1) return null;
      if (file.folder_id) return null; // Already assigned

      const targetFolderId = resolveTargetFolder(null, folderSuggestion);
      if (targetFolderId) {
        let newDbPath = file.path;
        if (file.is_inbox === 1 && file.stored_name) {
          const oldPath = path.resolve(UPLOADS_DIR, '..', file.path);
          const newPath = path.join(UPLOADS_DIR, file.stored_name);
          if (fs.existsSync(oldPath)) {
            if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
            try { fs.renameSync(oldPath, newPath); } catch {}
          }
          newDbPath = `uploads/${file.stored_name}`;
        }
        db.prepare(`
          UPDATE files 
          SET folder_id = ?, is_inbox = 0, path = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(targetFolderId, newDbPath, Number(fileId));
        console.log(`[ARKA AI] 📁 [Auto-Folder] File ID ${fileId} automatically moved to folder "${folderSuggestion}" (${targetFolderId})`);
        return targetFolderId;
      }
    }
  } catch (err) {
    console.warn(`[ARKA AI] ⚠️ Auto-organize failed for file ID ${fileId}:`, err.message);
  }
  return null;
}

/**
 * Startup sweep to auto-organize existing files that have AI suggestions but no folder yet.
 */
export async function autoOrganizeStartupSweep() {
  try {
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      const { data: unorganized } = await supabase
        .from('files')
        .select('id, folder_id, is_trash, user_id, file_metadata(suggested_folder, project)')
        .is('folder_id', null)
        .eq('is_trash', false);

      for (const f of (unorganized || [])) {
        const meta = Array.isArray(f.file_metadata) ? f.file_metadata[0] : f.file_metadata;
        const folderName = meta?.suggested_folder || meta?.project;
        if (folderName) {
          await autoOrganizeFileByAiSuggestion(f.id, { suggestedFolder: folderName }, f.user_id);
        }
      }
    } else {
      const unorganized = db.prepare(`
        SELECT f.id, f.stored_name, f.path, f.is_inbox, m.suggested_folder, m.project
        FROM files f
        LEFT JOIN file_metadata m ON f.id = m.file_id
        WHERE f.folder_id IS NULL AND f.is_trash = 0
          AND (
            (m.suggested_folder IS NOT NULL AND TRIM(m.suggested_folder) != '')
            OR (m.project IS NOT NULL AND TRIM(m.project) != '')
          )
      `).all();

      for (const f of unorganized) {
        const folderName = f.suggested_folder || f.project;
        if (folderName) {
          await autoOrganizeFileByAiSuggestion(f.id, { suggestedFolder: folderName }, null);
        }
      }
    }
  } catch (err) {
    console.warn('[ARKA AI] Auto-organize startup sweep notice:', err.message);
  }
}

/** Upsert AI metadata in Supabase. */
export async function saveMetadataSupabase(fileId, metadata, userId = null) {
  const supabase = getSupabaseClient();
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags
    : String(metadata.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const topic = metadata.topic || metadata.category || '';
  const folderSuggestion = metadata.suggestedFolder || metadata.project || '';
  const nameSuggestion = metadata.suggestedName || '';

  const { data: existing } = await supabase
    .from('file_metadata')
    .select('id')
    .eq('file_id', fileId)
    .maybeSingle();

  // Try with enhanced columns first
  const fullPayload = {
    description: metadata.description || '',
    category: topic,
    project: folderSuggestion,
    tags,
    suggested_name: nameSuggestion,
    suggested_folder: folderSuggestion,
    ai_analyzed: true
  };
  if (userId) fullPayload.user_id = userId;

  let saveErr = null;
  if (existing) {
    const { error } = await supabase.from('file_metadata').update(fullPayload).eq('file_id', fileId);
    saveErr = error;
  } else {
    const { error } = await supabase.from('file_metadata').insert({ file_id: fileId, ...fullPayload });
    saveErr = error;
  }

  // If there's any schema mismatch (e.g. PostgREST PGRST204 or PostgreSQL 42703), fallback to base schema
  if (saveErr) {
    if (isMissingColumnError(saveErr) && suggestionSchemaAvailable) {
      suggestionSchemaAvailable = false;
      warnMissingSuggestionSchema(saveErr);
    } else {
      console.warn(`[ARKA AI] Falling back to standard metadata schema for file ID ${fileId}: ${saveErr.message || saveErr.code}`);
    }
    const basePayload = {
      description: metadata.description || '',
      category: topic,
      project: folderSuggestion,
      tags,
      ai_analyzed: true
    };
    if (userId) basePayload.user_id = userId;

    if (existing) {
      const { error: fallbackErr } = await supabase.from('file_metadata').update(basePayload).eq('file_id', fileId);
      if (fallbackErr) {
        console.error(`[ARKA AI] ❌ Failed to update metadata in Supabase:`, fallbackErr);
        throw fallbackErr;
      }
    } else {
      const { error: fallbackErr } = await supabase.from('file_metadata').insert({ file_id: fileId, ...basePayload });
      if (fallbackErr) {
        console.error(`[ARKA AI] ❌ Failed to insert metadata in Supabase:`, fallbackErr);
        throw fallbackErr;
      }
    }
  }

  console.log(`[ARKA AI] 💾 Metadata successfully saved in Supabase for file ID ${fileId}`);
}

/** Upsert AI metadata in SQLite. */
export function saveMetadata(fileId, metadata) {
  const tags = Array.isArray(metadata.tags) ? metadata.tags.join(',') : String(metadata.tags || '');
  const topic = metadata.topic || metadata.category || '';
  const id = Number(fileId);

  const payload = {
    description: metadata.description || '',
    category: topic,
    project: metadata.project || '',
    tags,
    ai_analyzed: 1
  };

  // Only touch the suggestion columns when the local schema actually has them.
  if (hasSqliteSuggestionColumns()) {
    payload.suggested_name = metadata.suggestedName || '';
    payload.suggested_folder = metadata.suggestedFolder || metadata.project || '';
  }

  const keys = Object.keys(payload);
  const values = keys.map(k => payload[k]);
  const existing = db.prepare('SELECT id FROM file_metadata WHERE file_id = ?').get(id);

  if (existing) {
    db.prepare(`UPDATE file_metadata SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE file_id = ?`)
      .run(...values, id);
  } else {
    db.prepare(`INSERT INTO file_metadata (file_id, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')})`)
      .run(id, ...values);
  }
}

/** True when the SQLite mirror has the Phase 4 suggestion columns (checked once). */
let sqliteSuggestionColumns = null;
function hasSqliteSuggestionColumns() {
  if (sqliteSuggestionColumns === null) {
    try {
      const info = db.prepare('PRAGMA table_info(file_metadata)').all();
      sqliteSuggestionColumns = info.some(c => c.name === 'suggested_name') && info.some(c => c.name === 'suggested_folder');
    } catch {
      sqliteSuggestionColumns = false;
    }
  }
  return sqliteSuggestionColumns;
}

/** Extra SELECT snippet for the AI suggestion columns in SQLite queries. */
export function sqliteSuggestionFields() {
  return hasSqliteSuggestionColumns() ? ', m.suggested_name, m.suggested_folder' : '';
}

/**
 * Verify the AI suggestion columns exist (cached; reads/writes fall back to the
 * base schema when they do not). Run `phase4_smart_ai_triage.sql` in the Supabase
 * SQL editor and restart the server to enable full persistence.
 */
export async function probeSuggestionSchema({ force = false } = {}) {
  if (!isSupabaseConfigured()) return hasSqliteSuggestionColumns();
  if (!force && suggestionSchemaChecked) return suggestionSchemaAvailable;

  const { error } = await getSupabaseClient()
    .from('file_metadata')
    .select('suggested_name, suggested_folder')
    .limit(1);

  if (!error) {
    suggestionSchemaAvailable = true;
    suggestionSchemaChecked = true;
  } else if (isMissingColumnError(error)) {
    suggestionSchemaAvailable = false;
    suggestionSchemaChecked = true;
    warnMissingSuggestionSchema(error);
  }

  return suggestionSchemaAvailable;
}

/**
 * Schema report for the status endpoint / CLI diagnostics. `ready` is `null`
 * while the Supabase schema has not been verified by a query yet.
 */
export function suggestionSchemaStatus() {
  if (!isSupabaseConfigured()) {
    return { database: 'sqlite', ready: hasSqliteSuggestionColumns() };
  }
  return { database: 'supabase', ready: isSuggestionSchemaReady() };
}

export { getFileTypeCategory };

/* ─────────────────────────────────────────────────────────────────────────────
 * AI suggestion storage (suggested_name / suggested_folder)
 *
 * Those two columns come from `phase4_smart_ai_triage.sql`. If that migration
 * has not been run in the Supabase project yet, every read or write that
 * mentions them fails with PostgreSQL error 42703 — which is exactly how the
 * "AI Rename" feature silently lost its data: the suggested name was never
 * stored, so after a re-login the file was listed with its old messy name.
 *
 * To keep the app working in both states, the flag below remembers whether the
 * enhanced schema is available. On the first 42703 we flip it, log an
 * actionable warning, and retry once with the base column list.
 * ────────────────────────────────────────────────────────────────────────── */

const METADATA_FIELDS_FULL = 'description, category, project, tags, suggested_name, suggested_folder, ai_analyzed';
const METADATA_FIELDS_BASE = 'description, category, project, tags, ai_analyzed';

let suggestionSchemaAvailable = true;
let suggestionSchemaChecked = false;
let suggestionSchemaWarned = false;

/** Embedded `file_metadata` resource selection, respecting the detected schema. */
export function fileMetadataResource() {
  return suggestionSchemaAvailable ? METADATA_FIELDS_FULL : METADATA_FIELDS_BASE;
}

/** Full `files` selection with folder + metadata embeds. */
export function fileJoinSelect() {
  return `*, folders(name), file_metadata(${fileMetadataResource()})`;
}

/** True when PostgREST/Postgres complains about a column that does not exist. */
export function isMissingColumnError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '');
  return code === '42703' || code === 'PGRST204' || code === 'PGRST203'
    || /does not exist|could not find the .* column/i.test(message);
}

/** Whether the AI suggestion columns can be used (surfaced via /api/status). */
export function isSuggestionSchemaReady() {
  return suggestionSchemaChecked ? suggestionSchemaAvailable : null;
}

function warnMissingSuggestionSchema(error) {
  suggestionSchemaChecked = true;
  if (suggestionSchemaWarned) return;
  suggestionSchemaWarned = true;
  console.warn(
    '[ARKA AI] ⚠️  file_metadata.suggested_name / suggested_folder tidak tersedia ' +
    `(${error?.code || error?.message || 'unknown'}). ` +
    'Saran nama & folder AI tidak bisa disimpan permanen. ' +
    'Jalankan "phase4_smart_ai_triage.sql" di Supabase SQL Editor, lalu restart server.'
  );
}

/**
 * Run a `files` read that embeds `file_metadata`.
 *
 * @param {(selection: string) => PromiseLike<{ data: any, error: any|null }>} queryFactory
 *        Builder factory — MUST return a fresh query on every call so the retry
 *        after a missing-column error uses the corrected column list.
 */
export async function runFileSelect(queryFactory) {
  let { data, error } = await queryFactory(fileJoinSelect());

  if (error && isMissingColumnError(error) && suggestionSchemaAvailable) {
    suggestionSchemaAvailable = false;
    warnMissingSuggestionSchema(error);
    ({ data, error } = await queryFactory(fileJoinSelect()));
  }

  return { data, error };
}

/** Flatten a Supabase `files` row (with embeds) into the shape the UI expects. */
export function enrichSupabaseFileRow(row) {
  if (!row) return row;
  const meta = Array.isArray(row.file_metadata) ? row.file_metadata[0] : row.file_metadata;
  const relPath = String(row.storage_path || row.path || '').replace(/\\/g, '/');

  return {
    ...row,
    file_metadata: undefined,
    folders: undefined,
    folder_name: row.folders?.name || null,
    description: meta?.description ?? null,
    category: meta?.category ?? null,
    project: meta?.project ?? null,
    suggested_name: meta?.suggested_name || null,
    suggested_folder: meta?.suggested_folder || meta?.project || null,
    tags: Array.isArray(meta?.tags) ? meta.tags.join(',') : (meta?.tags || ''),
    ai_analyzed: meta?.ai_analyzed ? 1 : 0,
    typeCategory: getFileTypeCategory(row.mime_type, row.original_name),
    publicUrl: row.gdrive_view_url || row.public_url || (relPath ? `/storage/${relPath}` : null)
  };
}

export function formatFileRecord(file) {
  const relPath = String(file?.path || file?.storage_path || '').replace(/\\/g, '/');
  return {
    ...file,
    typeCategory: getFileTypeCategory(file?.mime_type, file?.original_name),
    publicUrl: file?.public_url || `/storage/${relPath}`
  };
}

/**
 * A suggestion is "consumed" once applied: clear the stored `suggested_name`
 * so the UI stops offering the same "Ganti Nama AI" button. Best-effort — it
 * never breaks the rename when the schema (or the metadata row) is missing.
 */
async function clearAppliedNameSuggestion(supabase, fileId) {
  if (!suggestionSchemaAvailable) return;

  const { error } = await supabase
    .from('file_metadata')
    .update({ suggested_name: null })
    .eq('file_id', fileId);

  if (error && isMissingColumnError(error)) {
    suggestionSchemaAvailable = false;
    warnMissingSuggestionSchema(error);
  } else if (error) {
    console.warn(`[ARKA AI] Saran nama untuk file ${fileId} gagal dibersihkan: ${error.message || error.code}`);
  }
}

/** Storage-safe object key that keeps the human-readable name readable. */
function buildStorageKey(currentStoragePath, newName) {
  const dir = String(currentStoragePath || '').split('/').slice(0, -1).join('/') || 'uploads';
  const cleaned = String(newName || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 180);

  return cleaned ? `${dir}/${cleaned}` : null;
}

/**
 * Best-effort rename of the stored object so the physical file in Supabase
 * Storage matches the new display name.
 *
 * @returns {Promise<object|null>} column patch (`storage_path`, `stored_name`,
 *          `public_url`) to persist, or null when the object was left untouched.
 */
async function renameStoredObject(supabase, file, newName) {
  const oldPath = file.storage_path;
  if (!oldPath || oldPath.startsWith('gdrive/')) return null;

  const newPath = buildStorageKey(oldPath, newName);
  if (!newPath || newPath === oldPath) return null;

  const ext = path.extname(newPath);
  const base = ext ? newPath.slice(0, -ext.length) : newPath;
  const attempts = [newPath, `${base}-${Date.now().toString(36)}${ext}`];

  for (let i = 0; i < attempts.length; i++) {
    const target = attempts[i];
    try {
      const { error: moveErr } = await supabase.storage.from(BUCKET_NAME).move(oldPath, target);
      if (moveErr) {
        if (i === attempts.length - 1) {
          console.warn(`[ARKA] Nama objek di storage tidak ikut berubah ("${oldPath}"): ${moveErr.message || moveErr.statusCode}`);
          return null;
        }
        continue;
      }

      const { data: pubData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(target);
      return {
        storage_path: target,
        stored_name: target.split('/').pop(),
        public_url: pubData?.publicUrl || null
      };
    } catch (err) {
      console.warn(`[ARKA] Gagal memindahkan objek penyimpanan "${oldPath}": ${err.message}`);
      return null;
    }
  }

  return null;
}

/** Resolve the physical path of a stored file, guarding against path traversal. */
function physicalPathOf(file) {
  const storageRoot = STORAGE_DIR;
  const p = file.path || file.storage_path;
  const resolved = path.resolve(storageRoot, p);
  if (!resolved.startsWith(storageRoot)) throw new Error('Path file tidak valid');
  return resolved;
}

/** Delete the physical file of a record. */
function removePhysicalFile(file) {
  try {
    const physicalPath = physicalPathOf(file);
    if (fs.existsSync(physicalPath)) {
      fs.unlinkSync(physicalPath);
      return true;
    }
  } catch (err) {
    console.warn(`Unlink warning for "${file?.original_name}": ${err.message}`);
  }
  return false;
}

/**
 * Cloud uploads live in memory (multer memoryStorage), but the analyzer reads
 * from a path. Spill the buffer to a temp file so cloud uploads get the same
 * automatic AI analysis as local disk uploads.
 *
 * @returns {string|null} temp file path, or null when there is no buffer.
 */
function spillBufferToTemp(buffer, originalName = 'file') {
  if (!buffer) return null;
  try {
    const tmpDir = path.join(os.tmpdir(), 'arka-tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const safeName = String(originalName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'file';
    const tempPath = path.join(tmpDir, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`);
    fs.writeFileSync(tempPath, buffer);
    return tempPath;
  } catch (err) {
    console.warn(`[ARKA AI] Could not stage temp file for "${originalName}": ${err.message}`);
    return null;
  }
}

/**
 * Run one post-upload AI analysis job.
 *
 * Local disk uploads: the bytes are already at `physicalPath`.
 * Cloud / Google Drive uploads: the bytes only live in the multer buffer, so
 * they are staged into a temp file first — and removed again afterwards.
 */
async function runAnalysisJob(job) {
  const onDisk = job.physicalPath && fs.existsSync(job.physicalPath) ? job.physicalPath : null;
  const tempPath = onDisk ? null : spillBufferToTemp(job.fileBuffer, job.originalName);
  const analysisPath = onDisk || tempPath;

  if (!analysisPath) {
    console.warn(`[ARKA AI] ⚠️  No readable source for file ID ${job.id} — analysis skipped.`);
    return null;
  }

  try {
    const metadata = await triggerAIAnalysis(job.id, analysisPath, job.mimeType, job.originalName, job.userId || null);
    return metadata;
  } catch (err) {
    console.warn(`[ARKA AI] Analysis error for ID ${job.id}: ${err.message}`);
    return null;
  } finally {
    if (tempPath) { try { fs.unlinkSync(tempPath); } catch {} }
  }
}

/** Defer a job by one tick so the HTTP response is written first. */
function deferredJob(job) {
  return new Promise(resolve => setImmediate(resolve)).then(() => runAnalysisJob(job));
}

/**
 * Keep post-response work alive until it settles.
 *
 * A long-running server (CLI / Termux / VPS) drains pending promises on its own,
 * but a Vercel function is frozen the moment the response is sent. `waitUntil`
 * from the optional `@vercel/functions` package keeps the invocation alive; if
 * that package is missing we quietly fall back to plain background work.
 *
 * Call this *before* sending the response, so `waitUntil` is registered while
 * the request context is still open.
 */
async function registerBackgroundWork(promises = []) {
  if (!promises.length) return;

  if (process.env.VERCEL) {
    try {
      const { waitUntil } = await import('@vercel/functions');
      for (const promise of promises) waitUntil(promise);
      return;
    } catch (err) {
      console.warn(`[ARKA] @vercel/functions unavailable (${err.message}) — background analysis may be cut short.`);
    }
  }

  for (const promise of promises) promise.catch(() => {});
}

export const fileController = {
  // Get files with filters
  getAll: async (req, res) => {
    try {
      const { folder_id, inbox, favorites, trash, search, type, limit = 200 } = req.query;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        const buildFilesQuery = (selection) => {
          let query = supabase.from('files').select(selection);

          // Multi-tenant: scope to this user's files only (NULL = owner data, visible to password login)
          if (userId) {
            query = query.or(`user_id.eq.${userId},user_id.is.null`);
          }

          if (trash === 'true') {
            query = query.eq('is_trash', true);
          } else {
            query = query.eq('is_trash', false);

            if (inbox === 'true') {
              query = query.eq('is_inbox', true);
            } else if (favorites === 'true') {
              query = query.eq('is_favorite', true);
            } else if (folder_id !== undefined && !search) {
              if (folder_id === 'null' || folder_id === '') {
                query = query.is('folder_id', null).eq('is_inbox', false);
              } else {
                query = query.eq('folder_id', folder_id);
              }
            }
          }

          if (search) {
            const s = String(search).trim();
            const clean = s.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim();
            if (clean) {
              query = query.or(`original_name.ilike.%${clean}%,stored_name.ilike.%${clean}%`);
            }
          }

          return query.order('created_at', { ascending: false }).limit(normalizeLimit(limit));
        };

        const { data: files, error } = await runFileSelect(sel => buildFilesQuery(sel));
        if (error) return fail(res, error);

        let enriched = (files || []).map(enrichSupabaseFileRow);

        if (search) {
          const q = String(search).trim().toLowerCase();
          enriched = enriched.filter(f =>
            (f.original_name && f.original_name.toLowerCase().includes(q)) ||
            (f.stored_name && f.stored_name.toLowerCase().includes(q)) ||
            (f.description && f.description.toLowerCase().includes(q)) ||
            (f.tags && f.tags.toLowerCase().includes(q)) ||
            (f.category && f.category.toLowerCase().includes(q)) ||
            (f.project && f.project.toLowerCase().includes(q)) ||
            (f.suggested_name && f.suggested_name.toLowerCase().includes(q)) ||
            (f.suggested_folder && f.suggested_folder.toLowerCase().includes(q)) ||
            (f.folder_name && f.folder_name.toLowerCase().includes(q))
          );
        }

        if (type && type !== 'All') {
          enriched = enriched.filter(f => f.typeCategory.toLowerCase() === String(type).toLowerCase());
        }

        return ok(res, { count: enriched.length, data: enriched });
      }

      // SQLite Fallback
      let query = `
        SELECT f.*, 
               fl.name as folder_name,
               m.description, m.category, m.project, m.tags, m.ai_analyzed${sqliteSuggestionFields()}
        FROM files f
        LEFT JOIN folders fl ON f.folder_id = fl.id
        LEFT JOIN file_metadata m ON f.id = m.file_id
        WHERE 1=1
      `;
      const params = [];

      if (trash === 'true') {
        query += ' AND f.is_trash = 1';
      } else {
        query += ' AND f.is_trash = 0';

        if (inbox === 'true') {
          query += ' AND f.is_inbox = 1';
        } else if (favorites === 'true') {
          query += ' AND f.is_favorite = 1';
        } else if (folder_id !== undefined && !search) {
          if (folder_id === 'null' || folder_id === '') {
            query += ' AND f.folder_id IS NULL AND f.is_inbox = 0';
          } else {
            query += ' AND f.folder_id = ?';
            params.push(Number(folder_id));
          }
        }
      }

      if (search) {
        query += ` AND (f.original_name LIKE ? ${ESCAPE_LIKE} OR m.description LIKE ? ${ESCAPE_LIKE} OR m.tags LIKE ? ${ESCAPE_LIKE})`;
        const pattern = likePattern(String(search).trim());
        params.push(pattern, pattern, pattern);
      }

      query += ' ORDER BY f.created_at DESC LIMIT ?';
      params.push(normalizeLimit(limit));

      const files = db.prepare(query).all(...params);
      let enriched = files.map(formatFileRecord);

      if (type && type !== 'All') {
        enriched = enriched.filter(f => f.typeCategory.toLowerCase() === String(type).toLowerCase());
      }

      return ok(res, { count: enriched.length, data: enriched });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Get file by ID or lookup by filename
  getById: async (req, res) => {
    try {
      const { id } = req.params;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        const buildQuery = (selection) => {
          let query = supabase.from('files').select(selection);

          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id).trim());
          if (isUuid) {
            query = query.eq('id', id);
          } else {
            query = query.or(`original_name.eq.${id},stored_name.eq.${id}`).order('created_at', { ascending: false }).limit(1);
          }

          if (userId) {
            query = query.or(`user_id.eq.${userId},user_id.is.null`);
          }

          return query.maybeSingle();
        };

        const { data: result, error } = await runFileSelect(buildQuery);
        if (error) return fail(res, error);
        if (!result) return notFound(res, `File "${id}" tidak ditemukan`);

        return ok(res, { data: enrichSupabaseFileRow(result) });
      }

      // SQLite Fallback
      const baseSelect = `
        SELECT f.*, fl.name as folder_name,
               m.description, m.category, m.project, m.tags, m.ai_analyzed${sqliteSuggestionFields()}
        FROM files f
        LEFT JOIN folders fl ON f.folder_id = fl.id
        LEFT JOIN file_metadata m ON f.id = m.file_id
      `;

      const numericId = Number(id);
      const file = Number.isInteger(numericId) && String(id).trim() !== ''
        ? db.prepare(`${baseSelect} WHERE f.id = ?`).get(numericId)
        : db.prepare(`${baseSelect} WHERE f.original_name = ? OR f.stored_name = ? ORDER BY f.id DESC LIMIT 1`).get(id, id);

      if (!file) return notFound(res, `File "${id}" tidak ditemukan`);
      return ok(res, { data: formatFileRecord(file) });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Upload files with intelligent target resolution
  upload: async (req, res) => {
    try {
      const uploadedFiles = req.files || (req.file ? [req.file] : []);
      if (!Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
        return badRequest(res, 'Tidak ada file yang diunggah');
      }

      const folderIdInput = req.body.folder_id || req.query.folder_id;
      const project = req.body.project || req.query.project;
      const inbox = req.body.inbox || req.query.inbox;
      const toInbox = inbox === 'true' || inbox === true;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;
        const providerToken = req.providerToken || null;
        const useGDrive = Boolean(providerToken && userId); // Only Google-authenticated users get GDrive

        let targetFolderId = null;

        if (!toInbox) {
          if (folderIdInput) {
            targetFolderId = folderIdInput;
          } else if (project) {
            targetFolderId = await resolveTargetFolderSupabase(supabase, project, userId);
          }
        }

        const savedRecords = [];
        const analysisJobs = []; // { id, fileBuffer, physicalPath, mimeType, originalName }

        for (const f of uploadedFiles) {
          const fileBuffer = f.buffer || (f.path && fs.existsSync(f.path) ? fs.readFileSync(f.path) : null);
          const ext = path.extname(f.originalname);
          const cleanName = path.basename(f.originalname, ext).replace(/[^a-zA-Z0-9_\-.]/g, '_');
          const storedName = `${cleanName}-${Date.now()}-${Math.round(Math.random() * 1e5)}${ext}`;
          const mimeType = resolveMimeType(f.mimetype, f.originalname);

          let publicUrl = null;
          let storagePath = null;
          let gdriveFileId = null;
          let gdriveViewUrl = null;
          let storageProvider = 'supabase';

          if (useGDrive && fileBuffer) {
            // ── Upload to user's Google Drive ──────────────────────────────
            try {
              const driveResult = await uploadToGoogleDrive(providerToken, fileBuffer, f.originalname, mimeType);
              gdriveFileId = driveResult.id;
              gdriveViewUrl = driveResult.webViewLink || null;
              publicUrl = driveResult.webContentLink || driveResult.webViewLink || null;
              storageProvider = 'gdrive';
              storagePath = `gdrive/${gdriveFileId}`;
            } catch (driveErr) {
              console.error('[GDrive Upload Error]', driveErr.message);
              // Fallback to Supabase Storage if Drive fails
              useGDriveFallback: {
                if (fileBuffer) {
                  storagePath = `${toInbox ? 'inbox' : 'uploads'}/${storedName}`;
                  await supabase.storage.from(BUCKET_NAME).upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });
                  const { data: pubData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
                  publicUrl = pubData?.publicUrl || null;
                }
              }
            }
          } else if (fileBuffer) {
            // ── Upload to Supabase Storage (owner/password login or no Drive token) ──
            storagePath = `${toInbox ? 'inbox' : 'uploads'}/${storedName}`;
            const { error: upErr } = await supabase.storage
              .from(BUCKET_NAME)
              .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: true });

            if (upErr) console.error('[Supabase Storage Upload Error]', upErr);

            const { data: pubData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
            publicUrl = pubData?.publicUrl || null;
          }

          // Insert row into Supabase 'files' table
          const { data: inserted, error: insErr } = await supabase.from('files').insert({
            folder_id: targetFolderId,
            original_name: f.originalname,
            stored_name: storedName,
            mime_type: mimeType,
            size: f.size,
            storage_path: storagePath,
            public_url: publicUrl,
            gdrive_file_id: gdriveFileId,
            gdrive_view_url: gdriveViewUrl,
            storage_provider: storageProvider,
            is_inbox: toInbox,
            is_favorite: false,
            is_trash: false,
            user_id: userId
          }).select('*, folders(name)').single();

          if (insErr) {
            console.error('[Supabase File Insert Error]', insErr);
            continue;
          }

          const record = {
            ...inserted,
            folder_name: inserted.folders?.name || null,
            publicUrl: inserted.gdrive_view_url || inserted.public_url || publicUrl,
            typeCategory: getFileTypeCategory(inserted.mime_type, inserted.original_name)
          };
          savedRecords.push({ ...record, physicalPath: f.path || null });
          analysisJobs.push({
            id: inserted.id,
            fileBuffer,
            physicalPath: f.path || null,
            mimeType,
            originalName: f.originalname,
            userId
          });
        }

        // Automatic AI analysis:
        // For small uploads (up to 3 files), execute the analysis inline with a fast timeout
        // so the frontend receives the enriched AI metadata immediately without manual clicking.
        if (analysisJobs.length <= 3) {
          try {
            await Promise.race([
              Promise.allSettled(analysisJobs.map(runAnalysisJob)),
              new Promise(r => setTimeout(r, 4500))
            ]);
            const ids = savedRecords.map(r => r.id);
            const { data: refreshed } = await runFileSelect(sel =>
              supabase.from('files').select(sel).in('id', ids)
            );
            if (refreshed && refreshed.length) {
              const refreshedMap = new Map(refreshed.map(r => [r.id, enrichSupabaseFileRow(r)]));
              for (let i = 0; i < savedRecords.length; i++) {
                const updatedRow = refreshedMap.get(savedRecords[i].id);
                if (updatedRow) savedRecords[i] = { ...savedRecords[i], ...updatedRow };
              }
            }
          } catch (err) {
            console.warn('[ARKA AI] Fast inline analysis timeout/error, continuing in background:', err.message);
          }
        } else {
          // Large batch: register background work
          await registerBackgroundWork(analysisJobs.map(deferredJob));
        }

        res.status(201).json({
          success: true,
          message: `Berhasil mengunggah ${savedRecords.length} file${ useGDrive ? ' ke Google Drive' : ' ke cloud'}`,
          data: savedRecords.map(({ physicalPath, ...rest }) => rest)
        });
        return;
      }

      // SQLite Fallback
      let targetFolderId = toInbox ? null : resolveTargetFolder(folderIdInput, project);
      if (!toInbox && project && !targetFolderId) {
        return badRequest(res, `Folder tujuan "${project}" tidak dapat ditentukan`);
      }
      const isInbox = toInbox;

      const insertStmt = db.prepare(`
        INSERT INTO files (folder_id, original_name, stored_name, mime_type, size, path, is_inbox)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const targetDir = isInbox ? INBOX_DIR : UPLOADS_DIR;
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

      const savedRecords = [];

      for (const f of uploadedFiles) {
        const desiredPhysicalPath = path.join(targetDir, f.filename);

        if (path.resolve(f.path) !== path.resolve(desiredPhysicalPath)) {
          fs.renameSync(f.path, desiredPhysicalPath);
        }

        const relativeDbPath = `${isInbox ? 'inbox' : 'uploads'}/${f.filename}`;
        const info = insertStmt.run(
          isInbox ? null : targetFolderId,
          f.originalname,
          f.filename,
          resolveMimeType(f.mimetype, f.originalname),
          f.size,
          relativeDbPath,
          isInbox ? 1 : 0
        );

        const record = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(info.lastInsertRowid));
        savedRecords.push({ ...formatFileRecord(record), physicalPath: desiredPhysicalPath });
      }

      const sqliteJobs = savedRecords.map(record => ({
        id: record.id,
        physicalPath: record.physicalPath,
        mimeType: record.mime_type,
        originalName: record.original_name
      }));

      if (sqliteJobs.length <= 3) {
        try {
          await Promise.race([
            Promise.allSettled(sqliteJobs.map(runAnalysisJob)),
            new Promise(r => setTimeout(r, 4500))
          ]);
          for (let i = 0; i < savedRecords.length; i++) {
            const row = db.prepare(`
              SELECT f.*, fl.name as folder_name, m.description, m.category, m.project, m.tags, m.ai_analyzed${sqliteSuggestionFields()}
              FROM files f
              LEFT JOIN folders fl ON f.folder_id = fl.id
              LEFT JOIN file_metadata m ON f.id = m.file_id
              WHERE f.id = ?
            `).get(savedRecords[i].id);
            if (row) savedRecords[i] = { ...savedRecords[i], ...formatFileRecord(row) };
          }
        } catch (err) {
          console.warn('[ARKA AI] Fast inline analysis timeout/error (SQLite):', err.message);
        }
      } else {
        await registerBackgroundWork(sqliteJobs.map(deferredJob));
      }

      res.status(201).json({
        success: true,
        message: `Berhasil mengunggah ${savedRecords.length} file`,
        data: savedRecords.map(({ physicalPath, ...rest }) => rest)
      });

    } catch (err) {
      return fail(res, err);
    }
  },

  // Manually trigger AI analysis for a specific file
  analyze: async (req, res) => {
    try {
      const { id } = req.params;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        let query = supabase.from('files').select('*').eq('id', id);
        if (userId) {
          query = query.or(`user_id.eq.${userId},user_id.is.null`);
        }
        const { data: file, error: fErr } = await query.maybeSingle();
        if (fErr) return fail(res, fErr);
        if (!file) return notFound(res, 'File tidak ditemukan');

        // Google Drive files have no copy in Supabase Storage — the bytes live in
        // the user's own Drive and must be pulled with the OAuth provider token.
        const isGDrive = file.storage_provider === 'gdrive' || Boolean(file.gdrive_file_id);

        let sourceBuffer = null;
        if (isGDrive) {
          if (!file.gdrive_file_id) {
            return badRequest(res, 'File tidak memiliki ID Google Drive — tidak bisa diambil untuk analisis');
          }
          if (!req.providerToken) {
            return res.status(401).json({
              success: false,
              error: 'Token akses Google Drive hilang atau kedaluwarsa — masuk lagi dengan Google, lalu coba ulang.'
            });
          }
          try {
            sourceBuffer = await downloadFromGoogleDrive(req.providerToken, file.gdrive_file_id);
          } catch (dlErr) {
            return res.status(502).json({ success: false, error: dlErr.message });
          }
        } else {
          // Download file content from Supabase storage for local analysis
          const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET_NAME).download(file.storage_path);
          if (dlErr || !blob) {
            return res.status(502).json({ success: false, error: 'Gagal mengambil file dari penyimpanan untuk analisis' });
          }
          sourceBuffer = Buffer.from(await blob.arrayBuffer());
        }

        let tempPath = null;
        try {
          tempPath = spillBufferToTemp(sourceBuffer, file.stored_name);
          if (!tempPath) {
            return res.status(500).json({ success: false, error: 'Gagal menyiapkan file untuk analisis' });
          }

          const existingFolders = await getExistingFolderNames(file.user_id);
          const { analyzeFile } = await import('../ai/analyzer.js');
          const metadata = await analyzeFile(tempPath, file.mime_type, file.original_name, { existingFolders });

          if (!metadata.ok) {
            return res.status(502).json({
              success: false,
              error: metadata.error || 'Analisis AI gagal',
              metadata
            });
          }

          await saveMetadataSupabase(id, metadata, file.user_id);
          await autoOrganizeFileByAiSuggestion(id, metadata, file.user_id);

          const { data: updated } = await runFileSelect(sel =>
            supabase.from('files').select(sel).eq('id', id).maybeSingle()
          );

          const enriched = enrichSupabaseFileRow(updated || file);

          // Fresh-from-AI suggestions win over the stored ones — this also keeps
          // the response useful when the suggestion columns are not created yet.
          enriched.suggested_name = metadata.suggestedName || enriched.suggested_name || null;
          enriched.suggested_folder = metadata.suggestedFolder || enriched.suggested_folder || null;
          enriched.description = enriched.description || metadata.description || null;
          enriched.category = enriched.category || metadata.category || metadata.topic || null;
          enriched.tags = enriched.tags || (Array.isArray(metadata.tags) ? metadata.tags.join(',') : (metadata.tags || ''));
          enriched.ai_analyzed = 1;

          return ok(res, { metadata, data: enriched });
        } finally {
          if (tempPath && fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch {}
          }
        }
      }

      // SQLite Fallback
      const file = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id));
      if (!file) return notFound(res, 'File tidak ditemukan');

      const physPath = physicalPathOf(file);
      if (!fs.existsSync(physPath)) return notFound(res, 'File fisik tidak ditemukan di disk');

      const existingFolders = await getExistingFolderNames(null);
      const { analyzeFile } = await import('../ai/analyzer.js');
      const metadata = await analyzeFile(physPath, file.mime_type, file.original_name, { existingFolders });

      if (!metadata.ok) {
        return res.status(502).json({
          success: false,
          error: metadata.error || 'Analisis AI gagal',
          metadata
        });
      }

      saveMetadata(Number(id), metadata);
      await autoOrganizeFileByAiSuggestion(id, metadata, null);

      const updated = db.prepare(`
        SELECT f.*, fl.name as folder_name, m.description, m.category, m.project, m.tags, m.ai_analyzed${sqliteSuggestionFields()}
        FROM files f
        LEFT JOIN folders fl ON f.folder_id = fl.id
        LEFT JOIN file_metadata m ON f.id = m.file_id
        WHERE f.id = ?
      `).get(Number(id));

      const enriched = formatFileRecord(updated);
      enriched.suggested_name = enriched.suggested_name ?? (metadata.suggestedName || null);
      enriched.suggested_folder = enriched.suggested_folder ?? (metadata.suggestedFolder || metadata.project || null);
      enriched.ai_analyzed = 1;

      return ok(res, { metadata, data: enriched });
    } catch (err) {
      return fail(res, err);
    }
  },

  // GET /api/files/:id/content — Extract text from document (PDF, Word DOCX, text/code/csv)
  getContent: async (req, res) => {
    try {
      const { id } = req.params;
      const query = String(req.query.q || req.query.query || '').trim();
      const maxLength = parseInt(req.query.max_length, 10) || 8000;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;
        let q = supabase.from('files').select('*').eq('id', id);
        if (userId) q = q.or(`user_id.eq.${userId},user_id.is.null`);
        const { data: file, error: fErr } = await q.maybeSingle();
        if (fErr) return fail(res, fErr);
        if (!file) return notFound(res, 'File tidak ditemukan');

        let buffer = null;
        const isGDrive = file.storage_provider === 'gdrive' || Boolean(file.gdrive_file_id);
        if (isGDrive && file.gdrive_file_id) {
          if (!req.providerToken) {
            return res.status(401).json({
              success: false,
              error: 'Token akses Google Drive tidak tersedia — silakan masuk dengan Google.'
            });
          }
          try {
            const { downloadFromGoogleDrive } = await import('../services/driveService.js');
            buffer = await downloadFromGoogleDrive(req.providerToken, file.gdrive_file_id);
          } catch (dlErr) {
            return res.status(502).json({ success: false, error: `Gagal mengunduh berkas Google Drive: ${dlErr.message}` });
          }
        } else if (file.storage_path) {
          const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET_NAME).download(file.storage_path);
          if (dlErr || !blob) {
            return res.status(502).json({ success: false, error: 'Gagal mengunduh file dari penyimpanan cloud' });
          }
          buffer = Buffer.from(await blob.arrayBuffer());
        }

        const { extractDocumentContent } = await import('../ai/documentExtractor.js');
        const result = await extractDocumentContent({
          buffer,
          mimeType: file.mime_type,
          filename: file.original_name,
          maxLength,
          query
        });

        return ok(res, {
          data: {
            id: file.id,
            original_name: file.original_name,
            mime_type: file.mime_type,
            ...result
          }
        });
      }

      // SQLite
      const file = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id));
      if (!file) return notFound(res, 'File tidak ditemukan');

      const physPath = physicalPathOf(file);
      if (!fs.existsSync(physPath)) return notFound(res, 'File fisik tidak ditemukan di disk');

      const { extractDocumentContent } = await import('../ai/documentExtractor.js');
      const result = await extractDocumentContent({
        filePath: physPath,
        mimeType: file.mime_type,
        filename: file.original_name,
        maxLength,
        query
      });

      return ok(res, {
        data: {
          id: file.id,
          original_name: file.original_name,
          mime_type: file.mime_type,
          ...result
        }
      });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Batch auto-organize all unorganized files based on AI suggestions
  autoOrganizeAll: async (req, res) => {
    try {
      const userId = req.user?.id || null;
      let count = 0;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        let query = supabase
          .from('files')
          .select('id, folder_id, is_trash, file_metadata(suggested_folder, project)')
          .is('folder_id', null)
          .eq('is_trash', false);
        if (userId) query = query.or(`user_id.eq.${userId},user_id.is.null`);

        const { data: unorganized, error } = await query;
        if (error) return fail(res, error);

        for (const f of (unorganized || [])) {
          const meta = Array.isArray(f.file_metadata) ? f.file_metadata[0] : f.file_metadata;
          const folderName = meta?.suggested_folder || meta?.project;
          if (folderName) {
            const resFolderId = await autoOrganizeFileByAiSuggestion(f.id, { suggestedFolder: folderName }, userId);
            if (resFolderId) count++;
          }
        }
      } else {
        // SQLite
        const unorganized = db.prepare(`
          SELECT f.id, f.stored_name, f.path, f.is_inbox, m.suggested_folder, m.project
          FROM files f
          LEFT JOIN file_metadata m ON f.id = m.file_id
          WHERE f.folder_id IS NULL AND f.is_trash = 0
            AND (
              (m.suggested_folder IS NOT NULL AND TRIM(m.suggested_folder) != '')
              OR (m.project IS NOT NULL AND TRIM(m.project) != '')
            )
        `).all();

        for (const f of unorganized) {
          const folderName = f.suggested_folder || f.project;
          if (folderName) {
            const resFolderId = await autoOrganizeFileByAiSuggestion(f.id, { suggestedFolder: folderName }, null);
            if (resFolderId) count++;
          }
        }
      }

      return ok(res, { count, message: `${count} file berhasil dirapikan otomatis ke folder AI` });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Update file (rename, move, favorite, trash/restore)
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { original_name, folder_id, folder_name, is_favorite, is_inbox, is_trash } = req.body;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        // Check ownership — the full row is needed because a rename also has to
        // locate the stored object (Supabase Storage key or Google Drive id).
        let checkQuery = supabase.from('files').select('*').eq('id', id);
        if (userId) checkQuery = checkQuery.or(`user_id.eq.${userId},user_id.is.null`);
        const { data: existing } = await checkQuery.maybeSingle();
        if (!existing) return notFound(res, 'File tidak ditemukan');

        const updates = { updated_at: new Date().toISOString() };

        if (original_name !== undefined) {
          const newName = String(original_name).trim();
          if (!newName) return badRequest(res, 'Nama file tidak boleh kosong');
          updates.original_name = newName;
        }

        if (folder_name !== undefined || folder_id !== undefined) {
          if (!folder_name && !folder_id) {
            updates.folder_id = null;
          } else if (folder_name) {
            const targetId = await resolveTargetFolderSupabase(supabase, String(folder_name).trim(), userId);
            updates.folder_id = targetId || null;
            if (updates.folder_id) updates.is_inbox = false;
          } else {
            // Bisa berupa ID numerik/UUID atau nama string
            const isPlainId = /^[0-9a-fA-F-]+$/.test(String(folder_id).trim());
            if (isPlainId) {
              const { data: folderExists } = await supabase.from('folders').select('id').eq('id', folder_id).maybeSingle();
              if (folderExists) {
                updates.folder_id = folder_id;
              } else {
                const targetId = await resolveTargetFolderSupabase(supabase, String(folder_id).trim(), userId);
                updates.folder_id = targetId || null;
              }
            } else {
              const targetId = await resolveTargetFolderSupabase(supabase, String(folder_id).trim(), userId);
              updates.folder_id = targetId || null;
            }
            if (updates.folder_id) updates.is_inbox = false;
          }
        }

        if (is_favorite !== undefined) updates.is_favorite = Boolean(is_favorite);
        if (is_inbox !== undefined) updates.is_inbox = Boolean(is_inbox);
        if (is_trash !== undefined) updates.is_trash = Boolean(is_trash);

        const { data: updated, error } = await runFileSelect(sel =>
          supabase.from('files').update(updates).eq('id', id).select(sel).maybeSingle()
        );

        if (error) return fail(res, error);
        if (!updated) return notFound(res, 'File tidak ditemukan');

        // ── The display name really changed → make it stick everywhere ────────
        const renameNotes = [];
        if (updates.original_name && updates.original_name !== existing.original_name) {
          // The suggestion is consumed — don't offer "Ganti Nama AI" again.
          await clearAppliedNameSuggestion(supabase, id);

          const isGDrive = existing.storage_provider === 'gdrive' || Boolean(existing.gdrive_file_id);

          if (isGDrive && existing.gdrive_file_id) {
            if (req.providerToken) {
              try {
                const { renameInGoogleDrive } = await import('./driveController.js');
                await renameInGoogleDrive(req.providerToken, existing.gdrive_file_id, updates.original_name);
                renameNotes.push('Nama file di Google Drive ikut diubah.');
              } catch (driveErr) {
                console.warn('[GDrive Rename Warning]', driveErr.message);
                renameNotes.push(`Nama di Google Drive tidak ikut berubah (${driveErr.message}).`);
              }
            } else {
              renameNotes.push('Nama di Google Drive belum berubah — masuk dengan Google agar nama aslinya ikut diubah.');
            }
          } else {
            const storagePatch = await renameStoredObject(supabase, existing, updates.original_name);
            if (storagePatch) {
              await supabase
                .from('files')
                .update({ ...storagePatch, updated_at: new Date().toISOString() })
                .eq('id', id);
              Object.assign(updated, storagePatch);
            }
          }
        }

        // Auto-cleanup: remove folder if it became empty after moving or trashing
        await pruneEmptyFolders(userId);

        return ok(res, {
          data: enrichSupabaseFileRow(updated),
          message: `File "${updates.original_name || existing.original_name}" diperbarui.`,
          renameNotes
        });
      }

      // SQLite Fallback
      const file = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id));
      if (!file) return notFound(res, 'File tidak ditemukan');

      const newName = original_name !== undefined ? String(original_name).trim() : file.original_name;
      if (!newName) return badRequest(res, 'Nama file tidak boleh kosong');

      let newFolderId = file.folder_id;
      let newInbox = is_inbox !== undefined ? (is_inbox ? 1 : 0) : file.is_inbox;

      if (folder_name !== undefined || folder_id !== undefined) {
        if (!folder_name && !folder_id) {
          newFolderId = null;
        } else if (folder_name) {
          const resolved = resolveTargetFolder(null, String(folder_name).trim());
          newFolderId = resolved || null;
          if (newFolderId) newInbox = 0;
        } else {
          const numericId = Number(folder_id);
          if (Number.isInteger(numericId) && numericId > 0) {
            const folder = db.prepare('SELECT id FROM folders WHERE id = ?').get(numericId);
            if (folder) {
              newFolderId = numericId;
            } else {
              newFolderId = resolveTargetFolder(null, String(folder_id).trim()) || null;
            }
          } else if (typeof folder_id === 'string' && folder_id.trim()) {
            newFolderId = resolveTargetFolder(null, folder_id.trim()) || null;
          } else {
            newFolderId = null;
          }
          if (newFolderId) newInbox = 0;
        }
      }

      const newFavorite = is_favorite !== undefined ? (is_favorite ? 1 : 0) : file.is_favorite;
      const newTrash = is_trash !== undefined ? (is_trash ? 1 : 0) : file.is_trash;

      let newStoredPath = file.path;
      const oldPhysical = physicalPathOf(file);
      const desiredDir = newInbox === 1 ? INBOX_DIR : UPLOADS_DIR;
      const newPhysical = path.join(desiredDir, file.stored_name);

      if (path.resolve(oldPhysical) !== path.resolve(newPhysical)) {
        if (!fs.existsSync(desiredDir)) fs.mkdirSync(desiredDir, { recursive: true });
        if (fs.existsSync(oldPhysical)) fs.renameSync(oldPhysical, newPhysical);
        newStoredPath = `${newInbox === 1 ? 'inbox' : 'uploads'}/${file.stored_name}`;
      }

      const isRename = newName !== file.original_name;

      db.prepare(`
        UPDATE files 
        SET original_name = ?, folder_id = ?, is_favorite = ?, is_inbox = ?, is_trash = ?, path = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newName, newFolderId, newFavorite, newInbox, newTrash, newStoredPath, Number(id));

      // The name suggestion has been consumed — remove it so the button does not
      // reappear the next time the list is loaded.
      if (isRename && hasSqliteSuggestionColumns()) {
        db.prepare('UPDATE file_metadata SET suggested_name = NULL WHERE file_id = ?').run(Number(id));
      }

      const updated = db.prepare(`
        SELECT f.*, fl.name as folder_name,
               m.description, m.category, m.project, m.tags, m.ai_analyzed${sqliteSuggestionFields()}
        FROM files f
        LEFT JOIN folders fl ON f.folder_id = fl.id
        LEFT JOIN file_metadata m ON f.id = m.file_id
        WHERE f.id = ?
      `).get(Number(id));

      // Auto-cleanup: remove folder if it became empty after move/trash
      pruneEmptyFolders(null);

      return ok(res, { data: formatFileRecord(updated), message: `File "${newName}" diperbarui.` });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Restore file from trash
  restore: async (req, res) => {
    req.body = Object.assign({}, req.body, { is_trash: false });
    return fileController.update(req, res);
  },

  // Delete file (soft-delete to trash or permanent removal)
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const { permanent } = req.query;
      const fallbackNameRaw = req.query.name || req.body?.name || req.body?.original_name || null;
      const cleanFallbackName = fallbackNameRaw
        ? String(fallbackNameRaw).replace(/^hapus\s+(file\s+|berkas\s+)?/i, '').replace(/["']/g, '').trim()
        : null;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        let file = null;
        if (UUID_REGEX.test(id)) {
          let checkQuery = supabase.from('files').select('*').eq('id', id);
          if (userId) checkQuery = checkQuery.or(`user_id.eq.${userId},user_id.is.null`);
          const { data, error: fErr } = await checkQuery.maybeSingle();
          if (fErr) return fail(res, fErr);
          file = data;
        }

        if (!file && cleanFallbackName) {
          let nameQuery = supabase.from('files').select('*').ilike('original_name', cleanFallbackName).eq('is_trash', false);
          if (userId) nameQuery = nameQuery.or(`user_id.eq.${userId},user_id.is.null`);
          const { data: matched } = await nameQuery.limit(1);
          file = matched?.[0] || null;
        }

        if (!file) {
          const cleanName = String(id).replace(/^hapus\s+(file\s+|berkas\s+)?/i, '').replace(/["']/g, '').trim();
          let nameQuery = supabase.from('files').select('*').ilike('original_name', cleanName).eq('is_trash', false);
          if (userId) nameQuery = nameQuery.or(`user_id.eq.${userId},user_id.is.null`);
          const { data: matched } = await nameQuery.limit(1);
          file = matched?.[0] || null;
        }

        if (!file) return notFound(res, `File "${cleanFallbackName || id}" tidak ditemukan`);

        if (permanent === 'true' || file.is_trash) {
          // If stored on user's Google Drive, delete from Drive via Drive API
          if (file.gdrive_file_id && req.providerToken) {
            try {
              const { deleteFromGoogleDrive } = await import('./driveController.js');
              await deleteFromGoogleDrive(req.providerToken, file.gdrive_file_id);
            } catch (driveErr) {
              console.warn('[GDrive Delete Warning]', driveErr.message);
            }
          }

          // Remove from Supabase Storage
          if (file.storage_path && !file.storage_path.startsWith('gdrive/')) {
            await supabase.storage.from(BUCKET_NAME).remove([file.storage_path]);
          }
          await supabase.from('files').delete().eq('id', file.id);
          return ok(res, { message: `File "${file.original_name}" dihapus permanen.` });
        }

        // Soft delete
        await supabase.from('files').update({ is_trash: true, updated_at: new Date().toISOString() }).eq('id', file.id);
        // Auto-cleanup: remove folder if it became empty after trashing this file
        await pruneEmptyFolders(userId);
        return ok(res, { message: `File "${file.original_name}" dipindahkan ke sampah.` });
      }

      // SQLite Fallback
      let file = !Number.isNaN(Number(id)) ? db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id)) : null;
      if (!file && cleanFallbackName) {
        file = db.prepare('SELECT * FROM files WHERE LOWER(original_name) = LOWER(?) AND is_trash = 0 LIMIT 1').get(cleanFallbackName);
      }
      if (!file) {
        const cleanName = String(id).replace(/^hapus\s+(file\s+|berkas\s+)?/i, '').replace(/["']/g, '').trim();
        file = db.prepare('SELECT * FROM files WHERE LOWER(original_name) = LOWER(?) AND is_trash = 0 LIMIT 1').get(cleanName);
      }
      if (!file) return notFound(res, `File "${cleanFallbackName || id}" tidak ditemukan`);

      if (permanent === 'true' || file.is_trash === 1) {
        removePhysicalFile(file);
        db.prepare('DELETE FROM files WHERE id = ?').run(Number(id));
        pruneEmptyFolders(null);
        return ok(res, { message: `File "${file.original_name}" dihapus permanen.` });
      }

      db.prepare('UPDATE files SET is_trash = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(id));
      pruneEmptyFolders(null);
      return ok(res, { message: `File "${file.original_name}" dipindahkan ke sampah.` });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Empty all trash
  emptyTrash: async (req, res) => {
    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        let query = supabase.from('files').select('id, storage_path, gdrive_file_id').eq('is_trash', true);
        if (userId) query = query.or(`user_id.eq.${userId},user_id.is.null`);
        const { data: trashFiles } = await query;

        const files = trashFiles || [];
        const paths = files.map(f => f.storage_path).filter(p => p && !p.startsWith('gdrive/'));
        if (paths.length > 0) {
          await supabase.storage.from(BUCKET_NAME).remove(paths);
        }

        // If user has provider token, also delete their GDrive trash files
        if (req.providerToken) {
          const gdriveFiles = files.filter(f => f.gdrive_file_id);
          if (gdriveFiles.length > 0) {
            try {
              const { deleteFromGoogleDrive } = await import('./driveController.js');
              for (const gf of gdriveFiles) {
                try {
                  await deleteFromGoogleDrive(req.providerToken, gf.gdrive_file_id);
                } catch {}
              }
            } catch {}
          }
        }

        const idsToDelete = files.map(f => f.id);
        if (idsToDelete.length > 0) {
          await supabase.from('files').delete().in('id', idsToDelete);
        }

        return ok(res, {
          message: `Mengosongkan ${files.length} file dari sampah cloud.`,
          count: files.length
        });
      }

      // SQLite Fallback
      const trashFiles = db.prepare('SELECT * FROM files WHERE is_trash = 1').all();

      let removedFromDisk = 0;
      for (const file of trashFiles) {
        if (removePhysicalFile(file)) removedFromDisk++;
      }

      db.prepare('DELETE FROM files WHERE is_trash = 1').run();

      return ok(res, {
        message: `Mengosongkan ${trashFiles.length} file dari sampah.`,
        count: trashFiles.length,
        removedFromDisk
      });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Download or inline stream file
  download: async (req, res) => {
    try {
      const { id } = req.params;
      const isInline = req.query.inline === 'true' || req.query.inline === '1';

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;
        let query = supabase.from('files').select('*');

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id).trim());
        if (isUuid) {
          query = query.eq('id', id);
        } else {
          query = query.or(`original_name.eq.${id},stored_name.eq.${id}`).order('created_at', { ascending: false }).limit(1);
        }

        if (userId) {
          query = query.or(`user_id.eq.${userId},user_id.is.null`);
        }

        const { data: file, error } = await query.maybeSingle();
        if (error || !file) return notFound(res, `File "${id}" tidak ditemukan`);

        if (file.gdrive_view_url || file.public_url) {
          if (file.storage_provider === 'gdrive' || file.gdrive_file_id) {
            return res.redirect(file.public_url || file.gdrive_view_url);
          }
          if (isInline) {
            return res.redirect(file.public_url);
          }
          const downloadUrl = file.public_url.includes('?')
            ? `${file.public_url}&download=${encodeURIComponent(file.original_name)}`
            : `${file.public_url}?download=${encodeURIComponent(file.original_name)}`;
          return res.redirect(downloadUrl);
        }

        // Fallback: download blob and stream
        const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET_NAME).download(file.storage_path);
        if (dlErr || !blob) return notFound(res, 'Isi file tidak ditemukan di penyimpanan');

        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const safeName = String(file.original_name || 'download').replace(/["\\]/g, '_');
        const disposition = isInline ? 'inline' : 'attachment';
        res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        return res.send(buffer);
      }

      // SQLite Fallback
      const numericId = Number(id);
      const file = Number.isInteger(numericId) && String(id).trim() !== ''
        ? db.prepare('SELECT * FROM files WHERE id = ?').get(numericId)
        : db.prepare('SELECT * FROM files WHERE original_name = ? OR stored_name = ? ORDER BY id DESC LIMIT 1').get(id, id);

      if (!file) return notFound(res, `File "${id}" tidak ditemukan`);

      const physicalPath = physicalPathOf(file);
      if (!fs.existsSync(physicalPath)) return notFound(res, 'File fisik tidak ditemukan di disk');

      const safeName = String(file.original_name || 'download').replace(/["\\]/g, '_');
      if (isInline) {
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
        return res.sendFile(path.resolve(physicalPath));
      }

      return res.download(physicalPath, file.original_name);
    } catch (err) {
      return fail(res, err);
    }
  },

  // Batch download multiple files as ZIP archive
  downloadZip: async (req, res) => {
    try {
      const rawIds = req.query.ids;
      if (!rawIds) return badRequest(res, 'Parameter ids (ID berkas dipisah koma) diperlukan');
      const idList = String(rawIds).split(',').map(s => s.trim()).filter(Boolean);
      if (idList.length === 0) return badRequest(res, 'Daftar ID berkas kosong');

      let targetFiles = [];
      const userId = req.user?.id || null;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        let query = supabase.from('files').select('*').in('id', idList);
        if (userId) query = query.or(`user_id.eq.${userId},user_id.is.null`);
        const { data, error } = await query;
        if (error) return fail(res, error);
        targetFiles = data || [];
      } else {
        const placeholders = idList.map(() => '?').join(',');
        targetFiles = db.prepare(`SELECT * FROM files WHERE id IN (${placeholders})`).all(...idList);
      }

      if (targetFiles.length === 0) {
        return notFound(res, 'Tidak ada berkas yang ditemukan untuk diunduh');
      }

      const zipName = `arka_batch_${Date.now()}.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

      const archiverModule = await import('archiver');
      let archive;
      if (typeof archiverModule.default === 'function') {
        archive = archiverModule.default('zip', { zlib: { level: 6 } });
      } else if (archiverModule.Archiver) {
        archive = new archiverModule.Archiver('zip', { zlib: { level: 6 } });
      } else if (typeof archiverModule === 'function') {
        archive = archiverModule('zip', { zlib: { level: 6 } });
      } else {
        throw new Error('Modul archiver tidak kompatibel');
      }
      archive.on('error', (err) => {
        console.error('[ZIP Error]', err);
        if (!res.headersSent) res.status(500).send({ error: err.message });
      });
      archive.pipe(res);

      const usedNames = new Set();
      for (const file of targetFiles) {
        let fileName = file.original_name || `file_${file.id}`;
        let ext = path.extname(fileName);
        let base = path.basename(fileName, ext);
        let counter = 1;
        while (usedNames.has(fileName.toLowerCase())) {
          fileName = `${base}_${counter}${ext}`;
          counter++;
        }
        usedNames.add(fileName.toLowerCase());

        try {
          if (isSupabaseConfigured() && file.storage_path) {
            const supabase = getSupabaseClient();
            const { data: blob } = await supabase.storage.from(BUCKET_NAME).download(file.storage_path);
            if (blob) {
              const buf = Buffer.from(await blob.arrayBuffer());
              archive.append(buf, { name: fileName });
            }
          } else {
            const p = physicalPathOf(file);
            if (fs.existsSync(p)) {
              archive.file(p, { name: fileName });
            }
          }
        } catch (fErr) {
          console.warn(`[ZIP] Failed to append file ${file.id}:`, fErr.message);
        }
      }

      await archive.finalize();
    } catch (err) {
      return fail(res, err);
    }
  }
};
