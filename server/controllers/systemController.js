import { db } from '../database/db.js';
import os from 'node:os';
import { APP } from '../config/env.js';
import { getFileTypeCategory } from '../utils/fileTypes.js';
import { fail, ok } from '../utils/http.js';

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
  getStatus: (req, res) => {
    try {
      const totalsRow = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as totalBytes FROM files WHERE is_trash = 0').get();
      const inboxRow = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(size), 0) as inboxBytes FROM files WHERE is_inbox = 1 AND is_trash = 0').get();
      const trashRow = db.prepare('SELECT COUNT(*) as count FROM files WHERE is_trash = 1').get();
      const folderCountRow = db.prepare('SELECT COUNT(*) as count FROM folders').get();
      const promptCountRow = db.prepare('SELECT COUNT(*) as count FROM prompts').get();
      const linkCountRow = db.prepare('SELECT COUNT(*) as count FROM links').get();

      // Category breakdown (single source of truth: utils/fileTypes)
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
