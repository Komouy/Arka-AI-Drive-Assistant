import { db } from '../database/db.js';
import path from 'node:path';
import fs from 'node:fs';
import { UPLOADS_DIR } from '../config/env.js';
import { getFileTypeCategory } from '../utils/fileTypes.js';
import { resolveTargetFolder, getFolderPath } from '../utils/folders.js';
import { fail, badRequest, notFound, ok } from '../utils/http.js';

/** Enrich a file row for the API (category + public URL). */
export function formatInboxRecord(file) {
  const relPath = String(file?.path || '').replace(/\\/g, '/');
  return {
    ...file,
    typeCategory: getFileTypeCategory(file?.mime_type, file?.original_name),
    publicUrl: `/storage/${relPath}`
  };
}

export const inboxController = {
  // Get all files currently in the Inbox
  getAll: (req, res) => {
    try {
      const files = db.prepare(`
        SELECT f.*, m.description, m.category, m.project, m.tags, m.ai_analyzed
        FROM files f
        LEFT JOIN file_metadata m ON f.id = m.file_id
        WHERE f.is_inbox = 1 AND f.is_trash = 0
        ORDER BY f.created_at DESC
      `).all();

      const data = files.map(formatInboxRecord);
      return ok(res, { count: data.length, data });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Organize/Triage an inbox file into a destination folder or project
  organize: (req, res) => {
    try {
      const { id } = req.params;
      const { folder_id, project_name } = req.body;

      const file = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id));
      if (!file) return notFound(res, 'File not found');
      if (file.is_trash === 1) {
        return badRequest(res, `"${file.original_name}" is in the trash — restore it first (arka restore ${file.id}).`);
      }

      const targetFolderId = resolveTargetFolder(folder_id, project_name);
      if (!targetFolderId) {
        return badRequest(res, 'Destination folder id or project name is required');
      }

      // Move the physical file out of the inbox staging area
      const oldPath = path.resolve(UPLOADS_DIR, '..', file.path);
      const newPath = path.join(UPLOADS_DIR, file.stored_name);

      if (path.resolve(oldPath) !== path.resolve(newPath) && fs.existsSync(oldPath)) {
        if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        fs.renameSync(oldPath, newPath);
      }

      const newDbPath = `uploads/${file.stored_name}`;
      db.prepare(`
        UPDATE files 
        SET folder_id = ?, is_inbox = 0, is_trash = 0, path = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(targetFolderId, newDbPath, Number(id));

      const updated = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id));
      const folderPath = getFolderPath(targetFolderId) || `Folder #${targetFolderId}`;

      return ok(res, {
        message: `File moved to "${folderPath}"`,
        data: formatInboxRecord(updated),
        folder: { id: targetFolderId, path: folderPath }
      });
    } catch (err) {
      return fail(res, err);
    }
  }
};
