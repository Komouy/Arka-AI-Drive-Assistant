import { db } from '../database/db.js';
import os from 'node:os';
import { APP } from '../config/env.js';
import { isSupabaseConfigured, getSupabaseClient } from '../config/supabase.js';
import { getFileTypeCategory } from '../utils/fileTypes.js';
import { fail, ok } from '../utils/http.js';
import { probeSuggestionSchema, suggestionSchemaStatus } from './fileController.js';

// API category → plural label used by the CLI breakdown
const BREAKDOWN_LABELS = {
  Image: 'Images',
  Video: 'Videos',
  Audio: 'Audio',
  Document: 'Documents',
  Code: 'Code',
  Archive: 'Archives',
  Other: 'Others'
};

export const systemController = {
  // Get ARKA system status and storage analytics
  getStatus: async (req, res) => {
    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        // Verifies (once per process) that the Phase 4 AI columns exist, so the
        // dashboard can warn when `phase4_smart_ai_triage.sql` was never applied.
        await probeSuggestionSchema();

        let filesQuery = supabase.from('files').select('mime_type, original_name, size, is_inbox, is_trash');
        let foldersQuery = supabase.from('folders').select('*', { count: 'exact', head: true });
        let promptsQuery = supabase.from('prompts').select('*', { count: 'exact', head: true });
        let linksQuery = supabase.from('links').select('*', { count: 'exact', head: true });

        if (userId) {
          filesQuery = filesQuery.or(`user_id.eq.${userId},user_id.is.null`);
          foldersQuery = foldersQuery.or(`user_id.eq.${userId},user_id.is.null`);
          promptsQuery = promptsQuery.or(`user_id.eq.${userId},user_id.is.null`);
          linksQuery = linksQuery.or(`user_id.eq.${userId},user_id.is.null`);
        }

        const [
          { data: allFiles, error: filesErr },
          { count: folderCount },
          { count: promptCount },
          { count: linkCount }
        ] = await Promise.all([
          filesQuery,
          foldersQuery,
          promptsQuery,
          linksQuery
        ]);

        if (filesErr) return fail(res, filesErr);

        const files = allFiles || [];
        let totalFiles = 0;
        let totalBytes = 0;
        let inboxFiles = 0;
        let inboxBytes = 0;
        let trashCount = 0;

        const breakdown = Object.fromEntries(
          Object.values(BREAKDOWN_LABELS).map(label => [label, { count: 0, bytes: 0 }])
        );

        for (const file of files) {
          const size = Number(file.size) || 0;
          if (file.is_trash) {
            trashCount += 1;
            continue;
          }
          totalFiles += 1;
          totalBytes += size;
          if (file.is_inbox) {
            inboxFiles += 1;
            inboxBytes += size;
          }

          const label = BREAKDOWN_LABELS[getFileTypeCategory(file.mime_type, file.original_name)] || 'Others';
          breakdown[label].count += 1;
          breakdown[label].bytes += size;
        }

        return ok(res, {
          data: {
            app: APP.name,
            version: APP.version,
            platform: os.platform(),
            nodeVersion: process.version,
            uptimeSeconds: Math.floor(process.uptime()),
            database: 'supabase',
            ai: suggestionSchemaStatus(),
            stats: {
              totalFiles,
              totalBytes,
              inboxFiles,
              inboxBytes,
              folders: folderCount || 0,
              prompts: promptCount || 0,
              links: linkCount || 0,
              trash: trashCount
            },
            breakdown
          }
        });
      }

      // SQLite Fallback
      const totalsRow = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as totalBytes FROM files WHERE is_trash = 0').get();
      const inboxRow = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as inboxBytes FROM files WHERE is_inbox = 1 AND is_trash = 0').get();
      const trashRow = db.prepare('SELECT COUNT(*) as count FROM files WHERE is_trash = 1').get();
      const folderCountRow = db.prepare('SELECT COUNT(*) as count FROM folders').get();
      const promptCountRow = db.prepare('SELECT COUNT(*) as count FROM prompts').get();
      const linkCountRow = db.prepare('SELECT COUNT(*) as count FROM links').get();

      const breakdown = Object.fromEntries(
        Object.values(BREAKDOWN_LABELS).map(label => [label, { count: 0, bytes: 0 }])
      );
      const allFiles = db.prepare('SELECT mime_type, original_name, size FROM files WHERE is_trash = 0').all();

      for (const file of allFiles) {
        const label = BREAKDOWN_LABELS[getFileTypeCategory(file.mime_type, file.original_name)] || 'Others';
        breakdown[label].count += 1;
        breakdown[label].bytes += file.size;
      }

      return ok(res, {
        data: {
          app: APP.name,
          version: APP.version,
          platform: os.platform(),
          nodeVersion: process.version,
          uptimeSeconds: Math.floor(process.uptime()),
          database: 'sqlite',
          ai: suggestionSchemaStatus(),
          stats: {
            totalFiles: totalsRow.count,
            totalBytes: totalsRow.totalBytes,
            inboxFiles: inboxRow.count,
            inboxBytes: inboxRow.inboxBytes,
            folders: folderCountRow.count,
            prompts: promptCountRow.count,
            links: linkCountRow.count,
            trash: trashRow.count
          },
          breakdown
        }
      });
    } catch (err) {
      return fail(res, err);
    }
  }
};
