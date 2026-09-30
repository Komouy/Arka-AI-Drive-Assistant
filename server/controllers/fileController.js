import { db } from '../database/db.js';
import path from 'node:path';
import fs from 'node:fs';
import { UPLOADS_DIR, INBOX_DIR, STORAGE_DIR } from '../config/env.js';
import { getFileTypeCategory, resolveMimeType } from '../utils/fileTypes.js';
import { resolveTargetFolder } from '../utils/folders.js';
import { likePattern, ESCAPE_LIKE } from '../utils/search.js';
import { fail, badRequest, notFound, ok } from '../utils/http.js';

/** Clamp the `?limit=` query parameter to a sane range. */
function normalizeLimit(value, fallback = 200, max = 1000) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

/**
 * Run AI analysis for an uploaded file and persist the result.
 *
 * A failed analysis is **never** stored as if it succeeded (the old behaviour
 * wrote placeholder metadata with `ai_analyzed = 1`, hiding provider outages).
 */
async function triggerAIAnalysis(fileId, filePath, mimeType, filename) {
  try {
    const { analyzeFile } = await import('../ai/analyzer.js');
    const metadata = await analyzeFile(filePath, mimeType, filename);

    if (!metadata.ok) {
      console.warn(`[ARKA AI] ⚠️  Analysis failed for file ID ${fileId} (${filename}): ${metadata.error}. Metadata NOT saved.`);
      return metadata;
    }

    saveMetadata(fileId, metadata);
    console.log(`[ARKA AI] 💾 Metadata saved for file ID ${fileId} (provider: ${metadata.provider})`);
    return metadata;
  } catch (err) {
    console.warn(`[ARKA AI] ⚠️  Analysis skipped for file ID ${fileId}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/** Upsert AI metadata for a file. */
export function saveMetadata(fileId, metadata) {
  const tags = Array.isArray(metadata.tags) ? metadata.tags.join(',') : String(metadata.tags || '');
  const topic = metadata.topic || metadata.category || '';

  const existing = db.prepare('SELECT id FROM file_metadata WHERE file_id = ?').get(Number(fileId));
  if (existing) {
    db.prepare(`
      UPDATE file_metadata
      SET description = ?, category = ?, project = ?, tags = ?, ai_analyzed = 1
      WHERE file_id = ?
    `).run(metadata.description || '', topic, metadata.project || '', tags, Number(fileId));
  } else {
    db.prepare(`
      INSERT INTO file_metadata (file_id, description, category, project, tags, ai_analyzed)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(Number(fileId), metadata.description || '', topic, metadata.project || '', tags);
  }
}

// Path helpers shared by every controller action
const storageRoot = STORAGE_DIR;

export { getFileTypeCategory };

export function formatFileRecord(file) {
  const relPath = String(file?.path || '').replace(/\\/g, '/');
  return {
    ...file,
    typeCategory: getFileTypeCategory(file?.mime_type, file?.original_name),
    publicUrl: `/storage/${relPath}`
  };
}

/** Resolve the physical path of a stored file, guarding against path traversal. */
function physicalPathOf(file) {
  const resolved = path.resolve(storageRoot, file.path);
  if (!resolved.startsWith(storageRoot)) throw new Error('Invalid file path');
  return resolved;
}

/** Delete the physical file of a record (missing files are not an error). */
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

export const fileController = {
  // Get files with filters
  getAll: (req, res) => {
    try {
      const { folder_id, inbox, favorites, trash, search, type, limit = 200 } = req.query;

      let query = `
        SELECT f.*, 
               fl.name as folder_name,
               m.description, m.category, m.project, m.tags, m.ai_analyzed
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
  getById: (req, res) => {
    try {
      const { id } = req.params;
      const baseSelect = `
        SELECT f.*, fl.name as folder_name,
               m.description, m.category, m.project, m.tags, m.ai_analyzed
        FROM files f
        LEFT JOIN folders fl ON f.folder_id = fl.id
        LEFT JOIN file_metadata m ON f.id = m.file_id
      `;

      const numericId = Number(id);
      const file = Number.isInteger(numericId) && String(id).trim() !== ''
        ? db.prepare(`${baseSelect} WHERE f.id = ?`).get(numericId)
        : db.prepare(`${baseSelect} WHERE f.original_name = ? OR f.stored_name = ? ORDER BY f.id DESC LIMIT 1`).get(id, id);

      if (!file) return notFound(res, `File "${id}" not found`);
      return ok(res, { data: formatFileRecord(file) });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Upload files with intelligent target resolution
  upload: (req, res) => {
    try {
      const uploadedFiles = req.files || (req.file ? [req.file] : []);
      if (!Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
        return badRequest(res, 'No files were uploaded');
      }

      const folderIdInput = req.body.folder_id || req.query.folder_id;
      const project = req.body.project || req.query.project;
      const inbox = req.body.inbox || req.query.inbox;
      const toInbox = inbox === 'true' || inbox === true;

      // Explicit inbox uploads stay in the staging area, everything else must
      // resolve to a real folder — an unknown --project is an error, not a silent
      // fallback into the inbox.
      let targetFolderId = toInbox ? null : resolveTargetFolder(folderIdInput, project);
      if (!toInbox && project && !targetFolderId) {
        return badRequest(res, `Destination folder "${project}" could not be resolved`);
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

      res.status(201).json({
        success: true,
        message: `Successfully uploaded ${savedRecords.length} file(s)`,
        data: savedRecords.map(({ physicalPath, ...rest }) => rest)
      });

      // ── Async AI analysis (non-blocking, runs after the response is sent) ───
      for (const record of savedRecords) {
        const { id, physicalPath, mime_type, original_name } = record;
        setImmediate(() => {
          triggerAIAnalysis(id, physicalPath, mime_type, original_name)
            .catch(err => console.warn(`[ARKA AI] Analysis error for ID ${id}: ${err.message}`));
        });
      }

    } catch (err) {
      return fail(res, err);
    }
  },

  // Manually trigger AI analysis for a specific file
  analyze: async (req, res) => {
    try {
      const { id } = req.params;
      const file = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id));
      if (!file) return notFound(res, 'File not found');

      const physPath = physicalPathOf(file);
      if (!fs.existsSync(physPath)) return notFound(res, 'Physical file not found on disk');

      const { analyzeFile } = await import('../ai/analyzer.js');
      const metadata = await analyzeFile(physPath, file.mime_type, file.original_name);

      // Never pretend the file was analysed when every provider failed
      if (!metadata.ok) {
        return res.status(502).json({
          success: false,
          error: metadata.error || 'AI analysis failed',
          metadata
        });
      }

      saveMetadata(Number(id), metadata);

      const updated = db.prepare(`
        SELECT f.*, fl.name as folder_name, m.description, m.category, m.project, m.tags, m.ai_analyzed
        FROM files f
        LEFT JOIN folders fl ON f.folder_id = fl.id
        LEFT JOIN file_metadata m ON f.id = m.file_id
        WHERE f.id = ?
      `).get(Number(id));

      return ok(res, { metadata, data: formatFileRecord(updated) });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Update file (rename, move, favorite, trash/restore)
  update: (req, res) => {
    try {
      const { id } = req.params;
      const { original_name, folder_id, is_favorite, is_inbox, is_trash } = req.body;

      const file = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id));
      if (!file) return notFound(res, 'File not found');

      const newName = original_name !== undefined ? String(original_name).trim() : file.original_name;
      if (!newName) return badRequest(res, 'File name cannot be empty');

      // A folder id must point at a folder that really exists, otherwise the file
      // would silently disappear from every listing.
      let newFolderId = file.folder_id;
      if (folder_id !== undefined) {
        if (!folder_id) {
          newFolderId = null;
        } else {
          newFolderId = Number(folder_id);
          const folder = db.prepare('SELECT id FROM folders WHERE id = ?').get(newFolderId);
          if (!folder) return badRequest(res, `Folder ID ${folder_id} does not exist`);
        }
      }

      const newFavorite = is_favorite !== undefined ? (is_favorite ? 1 : 0) : file.is_favorite;
      const newInbox = is_inbox !== undefined ? (is_inbox ? 1 : 0) : file.is_inbox;
      const newTrash = is_trash !== undefined ? (is_trash ? 1 : 0) : file.is_trash;

      // Keep the physical file inside the matching storage subdirectory
      let newStoredPath = file.path;
      const oldPhysical = physicalPathOf(file);
      const desiredDir = newInbox === 1 ? INBOX_DIR : UPLOADS_DIR;
      const newPhysical = path.join(desiredDir, file.stored_name);

      if (path.resolve(oldPhysical) !== path.resolve(newPhysical)) {
        if (!fs.existsSync(desiredDir)) fs.mkdirSync(desiredDir, { recursive: true });
        if (fs.existsSync(oldPhysical)) fs.renameSync(oldPhysical, newPhysical);
        newStoredPath = `${newInbox === 1 ? 'inbox' : 'uploads'}/${file.stored_name}`;
      }

      db.prepare(`
        UPDATE files 
        SET original_name = ?, folder_id = ?, is_favorite = ?, is_inbox = ?, is_trash = ?, path = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newName, newFolderId, newFavorite, newInbox, newTrash, newStoredPath, Number(id));

      const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id));
      return ok(res, { data: formatFileRecord(updated) });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Delete file (soft-delete to trash or permanent removal)
  delete: (req, res) => {
    try {
      const { id } = req.params;
      const { permanent } = req.query;

      const file = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id));
      if (!file) return notFound(res, 'File not found');

      // Explicit --permanent, or the file is already in the trash → remove for good
      if (permanent === 'true' || file.is_trash === 1) {
        removePhysicalFile(file);
        db.prepare('DELETE FROM files WHERE id = ?').run(Number(id)); // metadata cascades
        return ok(res, { message: `File "${file.original_name}" permanently deleted.` });
      }

      // Soft delete: move to trash
      db.prepare('UPDATE files SET is_trash = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(id));
      return ok(res, { message: `File "${file.original_name}" moved to trash.` });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Empty all trash
  emptyTrash: (req, res) => {
    try {
      const trashFiles = db.prepare('SELECT * FROM files WHERE is_trash = 1').all();

      let removedFromDisk = 0;
      for (const file of trashFiles) {
        if (removePhysicalFile(file)) removedFromDisk++;
      }

      db.prepare('DELETE FROM files WHERE is_trash = 1').run(); // metadata cascades

      return ok(res, {
        message: `Emptied ${trashFiles.length} file(s) from trash.`,
        count: trashFiles.length,
        removedFromDisk
      });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Download file
  download: (req, res) => {
    try {
      const { id } = req.params;
      const numericId = Number(id);
      const file = Number.isInteger(numericId) && String(id).trim() !== ''
        ? db.prepare('SELECT * FROM files WHERE id = ?').get(numericId)
        : db.prepare('SELECT * FROM files WHERE original_name = ? OR stored_name = ? ORDER BY id DESC LIMIT 1').get(id, id);

      if (!file) return notFound(res, `File "${id}" not found`);

      const physicalPath = physicalPathOf(file);
      if (!fs.existsSync(physicalPath)) return notFound(res, 'Physical file not found on disk');

      return res.download(physicalPath, file.original_name);
    } catch (err) {
      return fail(res, err);
    }
  }
};
