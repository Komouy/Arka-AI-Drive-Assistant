import { db } from '../database/db.js';
import path from 'node:path';
import fs from 'node:fs';
import { STORAGE_DIR, INBOX_DIR } from '../config/env.js';
import { resolveTargetFolder, getFolderSubtreeIds, getFolderPath, splitFolderPath } from '../utils/folders.js';
import { fail, badRequest, notFound, ok } from '../utils/http.js';

const DEFAULT_COLOR = '#6366f1';
const DEFAULT_ICON = 'folder';

function getFolderRow(id) {
  return db.prepare('SELECT * FROM folders WHERE id = ?').get(Number(id));
}

export const folderController = {
  // Get all folders (flat with parent references + child counts)
  getAll: (req, res) => {
    try {
      const folders = db.prepare(`
        SELECT f.*, 
          (SELECT COUNT(*) FROM files WHERE folder_id = f.id AND is_trash = 0) as file_count,
          (SELECT COUNT(*) FROM folders WHERE parent_id = f.id) as subfolder_count
        FROM folders f
        ORDER BY f.name ASC
      `).all();

      const data = folders.map(folder => ({ ...folder, path: getFolderPath(folder.id) }));
      return ok(res, { count: data.length, data });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Create folder (supports parent_id or nested path like "Instagram/Mobile App")
  create: (req, res) => {
    try {
      const { name, parent_id = null, color = DEFAULT_COLOR, icon = DEFAULT_ICON, path_str } = req.body;

      // Nested path → reuse the same resolver as upload/triage (case-insensitive,
      // auto-creates missing segments)
      if (path_str && typeof path_str === 'string') {
        if (splitFolderPath(path_str).length === 0) {
          return badRequest(res, 'Invalid folder path provided');
        }

        const folderId = resolveTargetFolder(parent_id, path_str);
        if (!folderId) return badRequest(res, 'Invalid folder path provided');

        if (color !== DEFAULT_COLOR || icon !== DEFAULT_ICON) {
          db.prepare('UPDATE folders SET color = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(color, icon, folderId);
        }
        return ok(res, { data: getFolderRow(folderId) }, 201);
      }

      const folderName = String(name || '').trim();
      if (!folderName) return badRequest(res, 'Folder name is required');

      let parentId = null;
      if (parent_id) {
        parentId = Number(parent_id);
        if (!getFolderRow(parentId)) return badRequest(res, `Parent folder ID ${parent_id} does not exist`);
      }

      // Reuse an existing folder with the same name instead of creating a duplicate
      const duplicate = parentId === null
        ? db.prepare('SELECT id FROM folders WHERE LOWER(name) = LOWER(?) AND parent_id IS NULL').get(folderName)
        : db.prepare('SELECT id FROM folders WHERE LOWER(name) = LOWER(?) AND parent_id = ?').get(folderName, parentId);

      if (duplicate) {
        return ok(res, { data: getFolderRow(duplicate.id), existing: true });
      }

      const info = db.prepare('INSERT INTO folders (name, parent_id, color, icon) VALUES (?, ?, ?, ?)')
        .run(folderName, parentId, color, icon);

      return ok(res, { data: getFolderRow(info.lastInsertRowid) }, 201);
    } catch (err) {
      return fail(res, err);
    }
  },

  // Update folder (rename, move parent, change color)
  update: (req, res) => {
    try {
      const { id } = req.params;
      const { name, parent_id, color, icon } = req.body;

      const folder = getFolderRow(id);
      if (!folder) return notFound(res, 'Folder not found');
      const folderId = Number(id);

      const newName = name !== undefined ? String(name).trim() : folder.name;
      if (!newName) return badRequest(res, 'Folder name cannot be empty');

      const newColor = color !== undefined ? color : folder.color;
      const newIcon = icon !== undefined ? icon : folder.icon;

      let newParentId = folder.parent_id;
      if (parent_id !== undefined) {
        newParentId = parent_id ? Number(parent_id) : null;

        if (newParentId === folderId) {
          return badRequest(res, 'A folder cannot be its own parent');
        }
        if (newParentId !== null) {
          if (!getFolderRow(newParentId)) {
            return badRequest(res, `Parent folder ID ${newParentId} does not exist`);
          }
          // Prevent cycles: the new parent must not live inside this folder
          if (getFolderSubtreeIds(folderId).includes(newParentId)) {
            return badRequest(res, 'Cannot move a folder into one of its own subfolders');
          }
        }
      }

      db.prepare(`
        UPDATE folders 
        SET name = ?, parent_id = ?, color = ?, icon = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newName, newParentId, newColor, newIcon, folderId);

      const updated = getFolderRow(folderId);
      return ok(res, { data: { ...updated, path: getFolderPath(folderId) } });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Delete folder safely (files are preserved in the Inbox)
  delete: (req, res) => {
    try {
      const { id } = req.params;
      const folder = getFolderRow(id);
      if (!folder) return notFound(res, 'Folder not found');

      const folderId = Number(id);
      const allFolderIds = getFolderSubtreeIds(folderId);
      const placeholders = allFolderIds.map(() => '?').join(',');

      const files = db.prepare(`SELECT * FROM files WHERE folder_id IN (${placeholders})`).all(...allFolderIds);

      // Move the physical files into the inbox staging folder
      for (const file of files) {
        try {
          const oldPhysical = path.resolve(STORAGE_DIR, file.path);
          const newPhysical = path.join(INBOX_DIR, file.stored_name);
          if (fs.existsSync(oldPhysical) && path.resolve(oldPhysical) !== path.resolve(newPhysical)) {
            if (!fs.existsSync(INBOX_DIR)) fs.mkdirSync(INBOX_DIR, { recursive: true });
            fs.renameSync(oldPhysical, newPhysical);
          }
        } catch (err) {
          console.warn(`Could not move "${file.original_name}" to inbox: ${err.message}`);
        }
      }

      // Reassign files to the Inbox and drop the folder tree in one transaction.
      // node:sqlite has no .transaction() helper, so the BEGIN/COMMIT pair is explicit.
      const updateFile = db.prepare(`
        UPDATE files
        SET folder_id = NULL, is_inbox = 1, path = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      const deleteFolders = db.prepare(`DELETE FROM folders WHERE id IN (${placeholders})`);

      db.exec('BEGIN');
      try {
        for (const file of files) updateFile.run(`inbox/${file.stored_name}`, file.id);
        deleteFolders.run(...allFolderIds);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      return ok(res, {
        message: `Folder "${folder.name}" deleted. ${files.length} file(s) moved to Inbox.`,
        deletedFolderIds: allFolderIds,
        filesMovedToInbox: files.length
      });
    } catch (err) {
      return fail(res, err);
    }
  }
};
