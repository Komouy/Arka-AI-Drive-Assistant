/**
 * ARKA — Folder helpers
 *
 * `resolveTargetFolder()` used to live inside inboxController while
 * fileController imported it from there (and inboxController imported
 * getFileTypeCategory back from fileController) → circular dependency.
 * Both helpers now live in utils/, keeping the dependency graph acyclic.
 */

import { db } from '../database/db.js';

const MAX_SEGMENT_LENGTH = 64;

/**
 * Make one path segment safe to store and to rebuild physical paths from.
 * Neutralises traversal: "." and ".." collapse to an empty string and are
 * dropped by splitFolderPath, so "../../Windows" can never escape /storage.
 */
export function sanitizeFolderSegment(segment = '') {
  return String(segment)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/^\.+/, '')
    .replace(/[.\s]+$/, '')
    .trim()
    .slice(0, MAX_SEGMENT_LENGTH);
}

/** Split "Projects/Instagram" or "Projects\\Instagram" into clean segments. */
export function splitFolderPath(pathStr = '') {
  return String(pathStr)
    .split(/[/\\]/)
    .map(sanitizeFolderSegment)
    .filter(Boolean);
}

function findFolderByNameOnRoot(name) {
  return db.prepare('SELECT id FROM folders WHERE LOWER(name) = LOWER(?) AND parent_id IS NULL').get(name);
}

function findFolderByNameUnder(name, parentId) {
  return db.prepare('SELECT id FROM folders WHERE LOWER(name) = LOWER(?) AND parent_id = ?').get(name, parentId);
}

function findFolderAnywhere(name) {
  return db.prepare('SELECT id FROM folders WHERE LOWER(name) = LOWER(?) ORDER BY parent_id IS NOT NULL DESC LIMIT 1').get(name);
}

/**
 * Resolve a destination folder for uploads / triage.
 *
 * Accepts:
 *   • numeric id or numeric string  → validated, returns the folder id
 *   • "Instagram"                   → matches an existing folder anywhere
 *   • "Projects/Instagram"          → walks the hierarchy, creating missing segments
 *
 * @returns {number|null} folder id, or null when nothing usable was provided
 */
export function resolveTargetFolder(folderId, projectName) {
  if (folderId !== undefined && folderId !== null && folderId !== '') {
    const numericId = Number(folderId);
    if (Number.isInteger(numericId)) {
      const exists = db.prepare('SELECT id FROM folders WHERE id = ?').get(numericId);
      return exists ? exists.id : null;
    }
  }

  const segments = splitFolderPath(projectName);
  if (segments.length === 0) return null;

  // Single name → reuse an existing folder anywhere in the tree
  if (segments.length === 1) {
    const match = findFolderAnywhere(segments[0]);
    if (match) return match.id;
  }

  // Hierarchical resolution (auto-create the missing segments)
  let parentId = null;
  for (const segment of segments) {
    const existing = parentId === null
      ? findFolderByNameOnRoot(segment)
      : findFolderByNameUnder(segment, parentId);

    if (existing) {
      parentId = existing.id;
    } else {
      const info = db.prepare('INSERT INTO folders (name, parent_id) VALUES (?, ?)').run(segment, parentId);
      parentId = Number(info.lastInsertRowid);
    }
  }
  return parentId;
}

/** Ids of a folder plus every descendant folder (used for safe deletes). */
export function getFolderSubtreeIds(folderId) {
  const ids = [folderId];
  const walk = (parentId) => {
    const children = db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(parentId);
    for (const child of children) {
      ids.push(child.id);
      walk(child.id);
    }
  };
  walk(folderId);
  return ids;
}

/**
 * Resolve a folder given either an id or a name/path **without creating anything**.
 * Returns { id, name } or null.
 */
export function findFolder(identifier) {
  if (identifier === undefined || identifier === null || identifier === '') return null;

  const numericId = Number(identifier);
  if (Number.isInteger(numericId) && String(identifier).trim() !== '') {
    const byId = db.prepare('SELECT id, name FROM folders WHERE id = ?').get(numericId);
    if (byId) return byId;
  }

  const segments = splitFolderPath(identifier);
  if (segments.length === 0) return null;

  let parentId = null;
  let found = null;
  for (const segment of segments) {
    found = parentId === null ? findFolderByNameOnRoot(segment) : findFolderByNameUnder(segment, parentId);
    if (!found) return null;
    parentId = found.id;
  }
  return db.prepare('SELECT id, name FROM folders WHERE id = ?').get(parentId);
}

/** Human readable path for a folder, e.g. "Projects/Instagram". */
export function getFolderPath(folderId) {
  if (!folderId) return null;
  const parts = [];
  let current = db.prepare('SELECT id, name, parent_id FROM folders WHERE id = ?').get(Number(folderId));
  let guard = 0;
  while (current && guard++ < 32) {
    parts.unshift(current.name);
    current = current.parent_id
      ? db.prepare('SELECT id, name, parent_id FROM folders WHERE id = ?').get(current.parent_id)
      : null;
  }
  return parts.length ? parts.join('/') : null;
}

const inflightResolutions = new Map();

/**
 * Resolve or create destination folder in Supabase mode (supports hierarchical "Projects/Instagram" paths).
 * Includes concurrency lock to avoid creating duplicate folders during parallel auto-organize operations.
 */
export async function resolveTargetFolderSupabase(supabase, projectName, userId = null) {
  if (!projectName) return null;
  const lockKey = `${userId || 'anon'}:${String(projectName).trim().toLowerCase()}`;
  if (inflightResolutions.has(lockKey)) {
    return inflightResolutions.get(lockKey);
  }

  const promise = (async () => {
    const segments = splitFolderPath(projectName);
    if (segments.length === 0) return null;

    let currentParentId = null;
    for (const segment of segments) {
      let query = supabase.from('folders').select('id').ilike('name', segment);
      if (currentParentId) {
        query = query.eq('parent_id', currentParentId);
      } else {
        query = query.is('parent_id', null);
      }
      if (userId) {
        query = query.or(`user_id.eq.${userId},user_id.is.null`);
      }
      const { data: existingRows } = await query.limit(1);
      const existing = existingRows?.[0] || null;

      if (existing) {
        currentParentId = existing.id;
      } else {
        const { data: inserted, error } = await supabase.from('folders').insert({
          name: segment,
          parent_id: currentParentId,
          user_id: userId
        }).select('id').single();
        if (error || !inserted) {
          // If insert failed due to concurrent insert, re-query existing
          const { data: retryRows } = await query.limit(1);
          if (retryRows?.[0]) {
            currentParentId = retryRows[0].id;
            continue;
          }
          return currentParentId;
        }
        currentParentId = inserted.id;
      }
    }
    return currentParentId;
  })();

  inflightResolutions.set(lockKey, promise);
  try {
    return await promise;
  } finally {
    inflightResolutions.delete(lockKey);
  }
}

export default { resolveTargetFolder, resolveTargetFolderSupabase, findFolder, getFolderPath, getFolderSubtreeIds, splitFolderPath, sanitizeFolderSegment };
