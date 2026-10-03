import { db } from '../database/db.js';
import path from 'node:path';
import fs from 'node:fs';
import { STORAGE_DIR, INBOX_DIR } from '../config/env.js';
import { isSupabaseConfigured, getSupabaseClient } from '../config/supabase.js';
import { resolveTargetFolder, getFolderSubtreeIds, getFolderPath, splitFolderPath, pruneEmptyFolders } from '../utils/folders.js';
import { fail, badRequest, notFound, ok } from '../utils/http.js';

const DEFAULT_COLOR = '#6366f1';
const DEFAULT_ICON = 'folder';

function getFolderRow(id) {
  return db.prepare('SELECT * FROM folders WHERE id = ?').get(Number(id));
}

/** Recursively collect all descendant folder IDs in Supabase mode */
async function getFolderSubtreeIdsSupabase(supabase, folderId, userId = null) {
  let query = supabase.from('folders').select('id, parent_id');
  if (userId) query = query.or(`user_id.eq.${userId},user_id.is.null`);
  const { data: folders } = await query;
  const childMap = new Map();
  for (const f of (folders || [])) {
    const p = f.parent_id || 'root';
    if (!childMap.has(p)) childMap.set(p, []);
    childMap.get(p).push(f.id);
  }
  const result = [folderId];
  const queue = [folderId];
  while (queue.length > 0) {
    const curr = queue.shift();
    const children = childMap.get(curr) || [];
    for (const ch of children) {
      result.push(ch);
      queue.push(ch);
    }
  }
  return result;
}

/** Check if candidateParentId is a descendant of folderId in Supabase mode */
async function isFolderDescendantSupabase(supabase, folderId, candidateParentId, userId = null) {
  const subtreeIds = await getFolderSubtreeIdsSupabase(supabase, folderId, userId);
  return subtreeIds.includes(candidateParentId);
}

export const folderController = {
  // Get all folders (flat with parent references + child counts)
  getAll: async (req, res) => {
    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        let folderQuery = supabase.from('folders').select('*').order('name', { ascending: true });
        if (userId) {
          folderQuery = folderQuery.or(`user_id.eq.${userId},user_id.is.null`);
        }

        let filesQuery = supabase.from('files').select('folder_id').eq('is_trash', false);
        if (userId) {
          filesQuery = filesQuery.or(`user_id.eq.${userId},user_id.is.null`);
        }

        const [
          { data: folders, error: fErr },
          { data: files }
        ] = await Promise.all([folderQuery, filesQuery]);

        if (fErr) return fail(res, fErr);
        const fileCountMap = {};
        for (const f of (files || [])) {
          if (f.folder_id) fileCountMap[f.folder_id] = (fileCountMap[f.folder_id] || 0) + 1;
        }

        const folderMap = new Map((folders || []).map(f => [f.id, f]));
        const subCountMap = {};
        for (const f of (folders || [])) {
          if (f.parent_id) subCountMap[f.parent_id] = (subCountMap[f.parent_id] || 0) + 1;
        }

        function buildPath(folderId) {
          const parts = [];
          let curr = folderMap.get(folderId);
          const seen = new Set();
          while (curr && !seen.has(curr.id)) {
            seen.add(curr.id);
            parts.unshift(curr.name);
            curr = curr.parent_id ? folderMap.get(curr.parent_id) : null;
          }
          return parts.join('/');
        }

        const data = (folders || []).map(folder => ({
          ...folder,
          file_count: fileCountMap[folder.id] || 0,
          subfolder_count: subCountMap[folder.id] || 0,
          path: buildPath(folder.id)
        }));

        return ok(res, { count: data.length, data });
      }

      // SQLite Fallback
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
  create: async (req, res) => {
    try {
      const { name, parent_id = null, color = DEFAULT_COLOR, icon = DEFAULT_ICON, path_str } = req.body;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        // Handle nested path segments if path_str is provided
        if (path_str && typeof path_str === 'string') {
          const segments = splitFolderPath(path_str);
          if (segments.length === 0) return badRequest(res, 'Path folder tidak valid');

          let currentParentId = parent_id || null;
          let lastFolder = null;

          for (const segment of segments) {
            let query = supabase.from('folders').select('*').ilike('name', segment);
            if (currentParentId) {
              query = query.eq('parent_id', currentParentId);
            } else {
              query = query.is('parent_id', null);
            }
            if (userId) {
              query = query.or(`user_id.eq.${userId},user_id.is.null`);
            }
            const { data: existing } = await query.maybeSingle();

            if (existing) {
              currentParentId = existing.id;
              lastFolder = existing;
            } else {
              const { data: inserted, error: insErr } = await supabase.from('folders').insert({
                name: segment,
                parent_id: currentParentId,
                color,
                icon,
                user_id: userId
              }).select().single();
              if (insErr) return fail(res, insErr);
              currentParentId = inserted.id;
              lastFolder = inserted;
            }
          }

          return ok(res, { data: lastFolder }, 201);
        }

        const folderName = String(name || '').trim();
        if (!folderName) return badRequest(res, 'Nama folder wajib diisi');

        // Check for duplicates with same name and same parent (per-user)
        let dupQuery = supabase.from('folders').select('*').ilike('name', folderName);
        if (parent_id) {
          dupQuery = dupQuery.eq('parent_id', parent_id);
        } else {
          dupQuery = dupQuery.is('parent_id', null);
        }
        if (userId) {
          dupQuery = dupQuery.or(`user_id.eq.${userId},user_id.is.null`);
        }
        const { data: duplicate } = await dupQuery.maybeSingle();

        if (duplicate) {
          return ok(res, { data: duplicate, existing: true });
        }

        const { data: created, error: crErr } = await supabase.from('folders').insert({
          name: folderName,
          parent_id: parent_id || null,
          color,
          icon,
          user_id: userId
        }).select().single();

        if (crErr) return fail(res, crErr);
        return ok(res, { data: created }, 201);
      }

      // SQLite Fallback
      if (path_str && typeof path_str === 'string') {
        if (splitFolderPath(path_str).length === 0) {
          return badRequest(res, 'Path folder tidak valid');
        }

        const folderId = resolveTargetFolder(parent_id, path_str);
        if (!folderId) return badRequest(res, 'Path folder tidak valid');

        if (color !== DEFAULT_COLOR || icon !== DEFAULT_ICON) {
          db.prepare('UPDATE folders SET color = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(color, icon, folderId);
        }
        return ok(res, { data: getFolderRow(folderId) }, 201);
      }

      const folderName = String(name || '').trim();
      if (!folderName) return badRequest(res, 'Nama folder wajib diisi');

      let parentId = null;
      if (parent_id) {
        parentId = Number(parent_id);
        if (!getFolderRow(parentId)) return badRequest(res, `Parent folder ID ${parent_id} does not exist`);
      }

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
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, parent_id, color, icon } = req.body;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        const { data: folder, error: fetchErr } = await supabase.from('folders').select('*').eq('id', id).maybeSingle();
        if (fetchErr) return fail(res, fetchErr);
        if (!folder) return notFound(res, 'Folder tidak ditemukan');

        // Multi-tenant check
        if (folder.user_id && userId && folder.user_id !== userId) {
          return notFound(res, 'Folder tidak ditemukan');
        }

        const updates = { updated_at: new Date().toISOString() };
        if (name !== undefined) {
          const newName = String(name).trim();
          if (!newName) return badRequest(res, 'Nama folder tidak boleh kosong');
          updates.name = newName;
        }
        if (color !== undefined) updates.color = color;
        if (icon !== undefined) updates.icon = icon;
        if (parent_id !== undefined) {
          if (parent_id === id) return badRequest(res, 'Folder tidak boleh menjadi induk dirinya sendiri');
          if (parent_id) {
            const { data: parentFolder } = await supabase.from('folders').select('id').eq('id', parent_id).maybeSingle();
            if (!parentFolder) return badRequest(res, `Parent folder ID ${parent_id} tidak ditemukan`);
            const isDescendant = await isFolderDescendantSupabase(supabase, id, parent_id, userId);
            if (isDescendant) {
              return badRequest(res, 'Tidak bisa memindahkan folder ke dalam subfolder-nya sendiri');
            }
          }
          updates.parent_id = parent_id || null;
        }

        const { data: updated, error: updErr } = await supabase.from('folders').update(updates).eq('id', id).select().maybeSingle();
        if (updErr) return fail(res, updErr);
        return ok(res, { data: updated });
      }

      // SQLite Fallback
      const folder = getFolderRow(id);
      if (!folder) return notFound(res, 'Folder tidak ditemukan');
      const folderId = Number(id);

      const newName = name !== undefined ? String(name).trim() : folder.name;
      if (!newName) return badRequest(res, 'Nama folder tidak boleh kosong');

      const newColor = color !== undefined ? color : folder.color;
      const newIcon = icon !== undefined ? icon : folder.icon;

      let newParentId = folder.parent_id;
      if (parent_id !== undefined) {
        newParentId = parent_id ? Number(parent_id) : null;

        if (newParentId === folderId) {
          return badRequest(res, 'Folder tidak boleh menjadi induk dirinya sendiri');
        }
        if (newParentId !== null) {
          if (!getFolderRow(newParentId)) {
            return badRequest(res, `Parent folder ID ${newParentId} does not exist`);
          }
          if (getFolderSubtreeIds(folderId).includes(newParentId)) {
            return badRequest(res, 'Tidak bisa memindahkan folder ke dalam subfolder-nya sendiri');
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

  // Delete folder safely
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const fallbackNameRaw = req.query.name || req.body?.name || null;
      const cleanFallbackName = fallbackNameRaw
        ? String(fallbackNameRaw).replace(/^hapus\s+(folder\s+)?/i, '').replace(/["']/g, '').trim()
        : null;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        let folder = null;
        if (UUID_REGEX.test(id)) {
          const { data, error: fetchErr } = await supabase.from('folders').select('*').eq('id', id).maybeSingle();
          if (fetchErr) return fail(res, fetchErr);
          folder = data;
        }

        if (!folder) {
          // Fallback 1: search by folder name using id parameter
          const cleanName = String(id).replace(/^hapus\s+(folder\s+)?/i, '').replace(/["']/g, '').trim();
          let nameQuery = supabase.from('folders').select('*').ilike('name', cleanName);
          if (userId) {
            nameQuery = nameQuery.or(`user_id.eq.${userId},user_id.is.null`);
          }
          const { data: matched } = await nameQuery.limit(1);
          folder = matched?.[0] || null;
        }

        if (!folder && cleanFallbackName) {
          // Fallback 2: search by query/body name param
          let nameQuery = supabase.from('folders').select('*').ilike('name', cleanFallbackName);
          if (userId) {
            nameQuery = nameQuery.or(`user_id.eq.${userId},user_id.is.null`);
          }
          const { data: matched } = await nameQuery.limit(1);
          folder = matched?.[0] || null;
        }

        if (!folder) return notFound(res, `Folder "${cleanFallbackName || id}" tidak ditemukan`);

        // Multi-tenant check
        if (folder.user_id && userId && folder.user_id !== userId) {
          return notFound(res, 'Folder tidak ditemukan');
        }

        const targetFolderId = folder.id;

        // Collect all descendant folder IDs in this subtree
        const allSubtreeIds = await getFolderSubtreeIdsSupabase(supabase, targetFolderId, userId);

        // Move files in this folder and its subfolders to inbox (only for this user / shared)
        let fileMoveQuery = supabase.from('files').update({ folder_id: null, is_inbox: true, updated_at: new Date().toISOString() }).in('folder_id', allSubtreeIds);
        if (userId) {
          fileMoveQuery = fileMoveQuery.or(`user_id.eq.${userId},user_id.is.null`);
        }
        const { error: moveErr } = await fileMoveQuery;
        if (moveErr) console.warn('[Folder Delete] Peringatan memindahkan file ke inbox:', moveErr.message);

        // Delete this folder and all its descendant subfolders
        const { error: delErr } = await supabase.from('folders').delete().in('id', allSubtreeIds);
        if (delErr) return fail(res, delErr);

        return ok(res, { message: `Folder "${folder.name}" dihapus. File dipindahkan ke Inbox.`, deletedFolderIds: allSubtreeIds });
      }

      // SQLite Fallback
      let folder = null;
      if (!Number.isNaN(Number(id))) {
        folder = getFolderRow(id);
      }
      if (!folder) {
        const cleanName = String(id).replace(/^hapus\s+(folder\s+)?/i, '').replace(/["']/g, '').trim();
        folder = db.prepare('SELECT * FROM folders WHERE LOWER(name) = LOWER(?) LIMIT 1').get(cleanName);
      }
      if (!folder && cleanFallbackName) {
        folder = db.prepare('SELECT * FROM folders WHERE LOWER(name) = LOWER(?) LIMIT 1').get(cleanFallbackName);
      }
      if (!folder) return notFound(res, `Folder "${cleanFallbackName || id}" tidak ditemukan`);

      const folderId = Number(folder.id);
      const allFolderIds = getFolderSubtreeIds(folderId);
      const placeholders = allFolderIds.map(() => '?').join(',');

      const files = db.prepare(`SELECT * FROM files WHERE folder_id IN (${placeholders})`).all(...allFolderIds);

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
        message: `Folder "${folder.name}" dihapus. ${files.length} file dipindahkan ke Inbox.`,
        deletedFolderIds: allFolderIds,
        filesMovedToInbox: files.length
      });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Explicit endpoint to prune empty folders
  pruneEmpty: async (req, res) => {
    try {
      const userId = req.user?.id || null;
      const result = await pruneEmptyFolders(userId, { force: true });
      return ok(res, {
        message: result.prunedCount > 0
          ? `Berhasil membersihkan ${result.prunedCount} folder kosong.`
          : 'Tidak ada folder kosong yang perlu dibersihkan.',
        ...result
      });
    } catch (err) {
      return fail(res, err);
    }
  }
};
