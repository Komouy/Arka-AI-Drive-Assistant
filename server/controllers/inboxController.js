import { db } from '../database/db.js';
import path from 'node:path';
import fs from 'node:fs';
import { UPLOADS_DIR } from '../config/env.js';
import { isSupabaseConfigured, getSupabaseClient } from '../config/supabase.js';
import { getFileTypeCategory } from '../utils/fileTypes.js';
import { resolveTargetFolder, getFolderPath } from '../utils/folders.js';
import { fail, badRequest, notFound, ok } from '../utils/http.js';

/** Enrich a file row for the API (category + public URL). */
export function formatInboxRecord(file) {
  const relPath = String(file?.path || file?.storage_path || '').replace(/\\/g, '/');
  return {
    ...file,
    typeCategory: getFileTypeCategory(file?.mime_type, file?.original_name),
    publicUrl: file?.public_url || `/storage/${relPath}`
  };
}

export const inboxController = {
  // Get all files currently in the Inbox
  getAll: async (req, res) => {
    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        let query = supabase
          .from('files')
          .select('*, folders(name), file_metadata(description, category, project, tags, ai_analyzed)')
          .eq('is_inbox', true)
          .eq('is_trash', false)
          .order('created_at', { ascending: false });

        if (userId) {
          query = query.or(`user_id.eq.${userId},user_id.is.null`);
        }

        const { data: files, error } = await query;

        if (error) return fail(res, error);

        const data = (files || []).map(f => {
          const meta = Array.isArray(f.file_metadata) ? f.file_metadata[0] : f.file_metadata;
          return {
            ...f,
            folder_name: f.folders?.name || null,
            description: meta?.description || null,
            category: meta?.category || null,
            project: meta?.project || null,
            tags: Array.isArray(meta?.tags) ? meta.tags.join(',') : (meta?.tags || ''),
            ai_analyzed: meta?.ai_analyzed ? 1 : 0,
            typeCategory: getFileTypeCategory(f.mime_type, f.original_name),
            publicUrl: f.gdrive_view_url || f.public_url || `/storage/${f.storage_path}`
          };
        });

        return ok(res, { count: data.length, data });
      }

      // SQLite Fallback
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
  organize: async (req, res) => {
    try {
      const { id } = req.params;
      const { folder_id, project_name } = req.body;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        const { data: file, error: fErr } = await supabase.from('files').select('*').eq('id', id).maybeSingle();
        if (fErr) return fail(res, fErr);
        if (!file) return notFound(res, 'File not found');

        // Multi-tenant check
        if (file.user_id && userId && file.user_id !== userId) {
          return notFound(res, 'File not found');
        }

        if (file.is_trash) {
          return badRequest(res, `"${file.original_name}" is in the trash — restore it first.`);
        }

        let targetFolderId = folder_id;
        if (!targetFolderId && project_name) {
          let folderQuery = supabase.from('folders').select('id').ilike('name', project_name);
          if (userId) {
            folderQuery = folderQuery.or(`user_id.eq.${userId},user_id.is.null`);
          }
          const { data: foundFolder } = await folderQuery.maybeSingle();
          if (foundFolder) {
            targetFolderId = foundFolder.id;
          } else {
            const { data: newF } = await supabase.from('folders').insert({ name: project_name, user_id: userId }).select().single();
            if (newF) targetFolderId = newF.id;
          }
        }

        if (!targetFolderId) {
          return badRequest(res, 'Destination folder id or project name is required');
        }

        const { data: updated, error: uErr } = await supabase.from('files').update({
          folder_id: targetFolderId,
          is_inbox: false,
          is_trash: false,
          updated_at: new Date().toISOString()
        }).eq('id', id).select('*, folders(name)').single();

        if (uErr) return fail(res, uErr);

        const folderName = updated.folders?.name || `Folder #${targetFolderId}`;
        return ok(res, {
          message: `File moved to "${folderName}"`,
          data: formatInboxRecord(updated),
          folder: { id: targetFolderId, path: folderName }
        });
      }

      // SQLite Fallback
      const file = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id));
      if (!file) return notFound(res, 'File not found');
      if (file.is_trash === 1) {
        return badRequest(res, `"${file.original_name}" is in the trash — restore it first (arka restore ${file.id}).`);
      }

      const targetFolderId = resolveTargetFolder(folder_id, project_name);
      if (!targetFolderId) {
        return badRequest(res, 'Destination folder id or project name is required');
      }

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
