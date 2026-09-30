import { db } from '../database/db.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { UPLOADS_DIR, INBOX_DIR, STORAGE_DIR } from '../config/env.js';
import { isSupabaseConfigured, getSupabaseClient, BUCKET_NAME } from '../config/supabase.js';
import { uploadToGoogleDrive, deleteFromGoogleDrive } from './driveController.js';
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
 */
async function triggerAIAnalysis(fileId, filePath, mimeType, filename, fileBuffer = null) {
  try {
    const { analyzeFile } = await import('../ai/analyzer.js');
    const metadata = await analyzeFile(filePath, mimeType, filename);

    if (!metadata.ok) {
      console.warn(`[ARKA AI] ⚠️  Analysis failed for file ID ${fileId} (${filename}): ${metadata.error}. Metadata NOT saved.`);
      return metadata;
    }

    if (isSupabaseConfigured()) {
      await saveMetadataSupabase(fileId, metadata);
    } else {
      saveMetadata(fileId, metadata);
    }
    console.log(`[ARKA AI] 💾 Metadata saved for file ID ${fileId} (provider: ${metadata.provider})`);
    return metadata;
  } catch (err) {
    console.warn(`[ARKA AI] ⚠️  Analysis skipped for file ID ${fileId}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/** Upsert AI metadata in Supabase. */
export async function saveMetadataSupabase(fileId, metadata) {
  const supabase = getSupabaseClient();
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags
    : String(metadata.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const topic = metadata.topic || metadata.category || '';

  const { data: existing } = await supabase.from('file_metadata').select('id').eq('file_id', fileId).maybeSingle();
  if (existing) {
    await supabase.from('file_metadata').update({
      description: metadata.description || '',
      category: topic,
      project: metadata.project || '',
      tags,
      ai_analyzed: true
    }).eq('file_id', fileId);
  } else {
    await supabase.from('file_metadata').insert({
      file_id: fileId,
      description: metadata.description || '',
      category: topic,
      project: metadata.project || '',
      tags,
      ai_analyzed: true
    });
  }
}

/** Upsert AI metadata in SQLite. */
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

export { getFileTypeCategory };

export function formatFileRecord(file) {
  const relPath = String(file?.path || file?.storage_path || '').replace(/\\/g, '/');
  return {
    ...file,
    typeCategory: getFileTypeCategory(file?.mime_type, file?.original_name),
    publicUrl: file?.public_url || `/storage/${relPath}`
  };
}

/** Resolve the physical path of a stored file, guarding against path traversal. */
function physicalPathOf(file) {
  const storageRoot = STORAGE_DIR;
  const p = file.path || file.storage_path;
  const resolved = path.resolve(storageRoot, p);
  if (!resolved.startsWith(storageRoot)) throw new Error('Invalid file path');
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

export const fileController = {
  // Get files with filters
  getAll: async (req, res) => {
    try {
      const { folder_id, inbox, favorites, trash, search, type, limit = 200 } = req.query;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        let query = supabase
          .from('files')
          .select('*, folders(name), file_metadata(description, category, project, tags, ai_analyzed)');

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
          query = query.ilike('original_name', `%${s}%`);
        }

        query = query.order('created_at', { ascending: false }).limit(normalizeLimit(limit));
        const { data: files, error } = await query;
        if (error) return fail(res, error);

        let enriched = (files || []).map(f => {
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

        if (type && type !== 'All') {
          enriched = enriched.filter(f => f.typeCategory.toLowerCase() === String(type).toLowerCase());
        }

        return ok(res, { count: enriched.length, data: enriched });
      }

      // SQLite Fallback
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
  getById: async (req, res) => {
    try {
      const { id } = req.params;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        let query = supabase
          .from('files')
          .select('*, folders(name), file_metadata(description, category, project, tags, ai_analyzed)');

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id).trim());
        if (isUuid) {
          query = query.eq('id', id);
        } else {
          query = query.or(`original_name.eq.${id},stored_name.eq.${id}`).order('created_at', { ascending: false }).limit(1);
        }

        if (userId) {
          query = query.or(`user_id.eq.${userId},user_id.is.null`);
        }

        const { data: result, error } = await query.maybeSingle();
        if (error) return fail(res, error);
        if (!result) return notFound(res, `File "${id}" not found`);

        const meta = Array.isArray(result.file_metadata) ? result.file_metadata[0] : result.file_metadata;
        const fileObj = {
          ...result,
          folder_name: result.folders?.name || null,
          description: meta?.description || null,
          category: meta?.category || null,
          project: meta?.project || null,
          tags: Array.isArray(meta?.tags) ? meta.tags.join(',') : (meta?.tags || ''),
          ai_analyzed: meta?.ai_analyzed ? 1 : 0,
          typeCategory: getFileTypeCategory(result.mime_type, result.original_name),
          publicUrl: result.public_url || `/storage/${result.storage_path}`
        };

        return ok(res, { data: fileObj });
      }

      // SQLite Fallback
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
  upload: async (req, res) => {
    try {
      const uploadedFiles = req.files || (req.file ? [req.file] : []);
      if (!Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
        return badRequest(res, 'No files were uploaded');
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
            let folderQuery = supabase.from('folders').select('id').ilike('name', project);
            if (userId) folderQuery = folderQuery.or(`user_id.eq.${userId},user_id.is.null`);
            const { data: foundFolder } = await folderQuery.maybeSingle();
            if (foundFolder) {
              targetFolderId = foundFolder.id;
            } else {
              const { data: newF } = await supabase.from('folders').insert({ name: project, user_id: userId }).select().single();
              if (newF) targetFolderId = newF.id;
            }
          }
        }

        const savedRecords = [];

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
        }

        res.status(201).json({
          success: true,
          message: `Successfully uploaded ${savedRecords.length} file(s)${ useGDrive ? ' to Google Drive' : ' to cloud'}`,
          data: savedRecords.map(({ physicalPath, ...rest }) => rest)
        });

        // Trigger AI analysis asynchronously (only for non-GDrive files we have locally)
        for (const record of savedRecords) {
          const { id, physicalPath, mime_type, original_name } = record;
          if (physicalPath && fs.existsSync(physicalPath)) {
            setImmediate(() => {
              triggerAIAnalysis(id, physicalPath, mime_type, original_name)
                .catch(err => console.warn(`[ARKA AI] Analysis error for ID ${id}: ${err.message}`));
            });
          }
        }
        return;
      }

      // SQLite Fallback
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

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        let query = supabase.from('files').select('*').eq('id', id);
        if (userId) {
          query = query.or(`user_id.eq.${userId},user_id.is.null`);
        }
        const { data: file, error: fErr } = await query.maybeSingle();
        if (fErr) return fail(res, fErr);
        if (!file) return notFound(res, 'File not found');

        let tempPath = null;
        try {
          // Download file content from Supabase storage for local analysis
          const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET_NAME).download(file.storage_path);
          if (dlErr || !blob) {
            return res.status(502).json({ success: false, error: 'Could not fetch file from storage for analysis' });
          }

          const arrayBuffer = await blob.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const tmpDir = path.join(os.tmpdir(), 'arka-tmp');
          if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
          tempPath = path.join(tmpDir, `${Date.now()}-${file.stored_name}`);
          fs.writeFileSync(tempPath, buffer);

          const { analyzeFile } = await import('../ai/analyzer.js');
          const metadata = await analyzeFile(tempPath, file.mime_type, file.original_name);

          if (!metadata.ok) {
            return res.status(502).json({
              success: false,
              error: metadata.error || 'AI analysis failed',
              metadata
            });
          }

          await saveMetadataSupabase(id, metadata);

          const { data: updated } = await supabase
            .from('files')
            .select('*, folders(name), file_metadata(description, category, project, tags, ai_analyzed)')
            .eq('id', id)
            .single();

          const meta = Array.isArray(updated.file_metadata) ? updated.file_metadata[0] : updated.file_metadata;
          const enriched = {
            ...updated,
            folder_name: updated.folders?.name || null,
            description: meta?.description || null,
            category: meta?.category || null,
            project: meta?.project || null,
            tags: Array.isArray(meta?.tags) ? meta.tags.join(',') : (meta?.tags || ''),
            ai_analyzed: meta?.ai_analyzed ? 1 : 0,
            publicUrl: updated.public_url || `/storage/${updated.storage_path}`
          };

          return ok(res, { metadata, data: enriched });
        } finally {
          if (tempPath && fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch {}
          }
        }
      }

      // SQLite Fallback
      const file = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id));
      if (!file) return notFound(res, 'File not found');

      const physPath = physicalPathOf(file);
      if (!fs.existsSync(physPath)) return notFound(res, 'Physical file not found on disk');

      const { analyzeFile } = await import('../ai/analyzer.js');
      const metadata = await analyzeFile(physPath, file.mime_type, file.original_name);

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
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { original_name, folder_id, is_favorite, is_inbox, is_trash } = req.body;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        // Check ownership
        let checkQuery = supabase.from('files').select('id, user_id').eq('id', id);
        if (userId) checkQuery = checkQuery.or(`user_id.eq.${userId},user_id.is.null`);
        const { data: existing } = await checkQuery.maybeSingle();
        if (!existing) return notFound(res, 'File not found');

        const updates = { updated_at: new Date().toISOString() };

        if (original_name !== undefined) {
          const newName = String(original_name).trim();
          if (!newName) return badRequest(res, 'File name cannot be empty');
          updates.original_name = newName;
        }
        if (folder_id !== undefined) updates.folder_id = folder_id || null;
        if (is_favorite !== undefined) updates.is_favorite = Boolean(is_favorite);
        if (is_inbox !== undefined) updates.is_inbox = Boolean(is_inbox);
        if (is_trash !== undefined) updates.is_trash = Boolean(is_trash);

        const { data: updated, error } = await supabase
          .from('files')
          .update(updates)
          .eq('id', id)
          .select('*, folders(name)')
          .maybeSingle();

        if (error) return fail(res, error);
        if (!updated) return notFound(res, 'File not found');

        return ok(res, { data: formatFileRecord(updated) });
      }

      // SQLite Fallback
      const file = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id));
      if (!file) return notFound(res, 'File not found');

      const newName = original_name !== undefined ? String(original_name).trim() : file.original_name;
      if (!newName) return badRequest(res, 'File name cannot be empty');

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
  delete: async (req, res) => {
    try {
      const { id } = req.params;
      const { permanent } = req.query;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        let checkQuery = supabase.from('files').select('*').eq('id', id);
        if (userId) checkQuery = checkQuery.or(`user_id.eq.${userId},user_id.is.null`);
        const { data: file, error: fErr } = await checkQuery.maybeSingle();
        if (fErr) return fail(res, fErr);
        if (!file) return notFound(res, 'File not found');

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
          await supabase.from('files').delete().eq('id', id);
          return ok(res, { message: `File "${file.original_name}" permanently deleted.` });
        }

        // Soft delete
        await supabase.from('files').update({ is_trash: true, updated_at: new Date().toISOString() }).eq('id', id);
        return ok(res, { message: `File "${file.original_name}" moved to trash.` });
      }

      // SQLite Fallback
      const file = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(id));
      if (!file) return notFound(res, 'File not found');

      if (permanent === 'true' || file.is_trash === 1) {
        removePhysicalFile(file);
        db.prepare('DELETE FROM files WHERE id = ?').run(Number(id));
        return ok(res, { message: `File "${file.original_name}" permanently deleted.` });
      }

      db.prepare('UPDATE files SET is_trash = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(id));
      return ok(res, { message: `File "${file.original_name}" moved to trash.` });
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
          message: `Emptied ${files.length} file(s) from cloud trash.`,
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
        message: `Emptied ${trashFiles.length} file(s) from trash.`,
        count: trashFiles.length,
        removedFromDisk
      });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Download file
  download: async (req, res) => {
    try {
      const { id } = req.params;

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
        if (error || !file) return notFound(res, `File "${id}" not found`);

        if (file.gdrive_view_url || file.public_url) {
          return res.redirect(file.gdrive_view_url || file.public_url);
        }

        // Fallback: download blob and stream
        const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET_NAME).download(file.storage_path);
        if (dlErr || !blob) return notFound(res, 'File content not found in storage');

        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        return res.send(buffer);
      }

      // SQLite Fallback
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
