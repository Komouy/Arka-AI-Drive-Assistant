import { db } from '../database/db.js';
import { likePattern, ESCAPE_LIKE } from '../utils/search.js';
import { fail, badRequest, notFound, ok } from '../utils/http.js';

/** Extract domain from a URL safely */
function extractDomain(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/** Attempt to fetch title from an external webpage with a short timeout */
async function fetchPageTitle(rawUrl, timeoutMs = 2500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(rawUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (ARKA-AI-Assistant/1.0)' }
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim().replace(/\s+/g, ' ');
    }
  } catch {
    // If fetch times out or fails (e.g. offline/network restricted), silently fallback
  }
  return null;
}

export const linkController = {
  // List all links with filters
  getAll: (req, res) => {
    try {
      const { category, search, favorites } = req.query;
      let query = 'SELECT * FROM links WHERE 1=1';
      const params = [];

      if (category) {
        query += ' AND category = ?';
        params.push(category);
      }
      if (favorites === 'true') {
        query += ' AND is_favorite = 1';
      }
      if (search) {
        query += ` AND (url LIKE ? ${ESCAPE_LIKE} OR title LIKE ? ${ESCAPE_LIKE} OR description LIKE ? ${ESCAPE_LIKE} OR tags LIKE ? ${ESCAPE_LIKE} OR domain LIKE ? ${ESCAPE_LIKE})`;
        const pattern = likePattern(String(search).trim());
        params.push(pattern, pattern, pattern, pattern, pattern);
      }

      query += ' ORDER BY created_at DESC';
      const links = db.prepare(query).all(...params);

      // Categories summary
      const categories = db.prepare(`
        SELECT category, COUNT(*) as count 
        FROM links 
        GROUP BY category 
        ORDER BY category
      `).all();

      return ok(res, { count: links.length, data: links, categories });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Get link by ID
  getById: (req, res) => {
    try {
      const { id } = req.params;
      const link = db.prepare('SELECT * FROM links WHERE id = ?').get(Number(id));
      if (!link) return notFound(res, 'Link not found');
      return ok(res, { data: link });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Create new link
  create: async (req, res) => {
    try {
      let { url, title, description = '', category = 'General', tags = '' } = req.body;

      let cleanUrl = String(url || '').trim();
      if (!cleanUrl) return badRequest(res, 'URL is required');

      // Add https:// if protocol is missing
      if (!/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = 'https://' + cleanUrl;
      }

      const domain = extractDomain(cleanUrl);
      let cleanTitle = String(title || '').trim();

      // If title not provided, try fetching or fallback to domain
      if (!cleanTitle) {
        const fetchedTitle = await fetchPageTitle(cleanUrl);
        cleanTitle = fetchedTitle || domain || cleanUrl;
      }

      const info = db.prepare(`
        INSERT INTO links (url, title, description, category, tags, domain)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        cleanUrl,
        cleanTitle,
        String(description || '').trim(),
        String(category || 'General').trim(),
        String(tags || '').trim(),
        domain
      );

      const created = db.prepare('SELECT * FROM links WHERE id = ?').get(Number(info.lastInsertRowid));
      return ok(res, { data: created, message: 'Link successfully saved & categorized' }, 201);
    } catch (err) {
      return fail(res, err);
    }
  },

  // Update link
  update: (req, res) => {
    try {
      const { id } = req.params;
      const { url, title, description, category, tags, is_favorite } = req.body;

      const link = db.prepare('SELECT * FROM links WHERE id = ?').get(Number(id));
      if (!link) return notFound(res, 'Link not found');

      let newUrl = url !== undefined ? String(url).trim() : link.url;
      if (url !== undefined && !/^https?:\/\//i.test(newUrl)) {
        newUrl = 'https://' + newUrl;
      }
      const newDomain = url !== undefined ? extractDomain(newUrl) : link.domain;
      const newTitle = title !== undefined ? String(title).trim() : link.title;
      const newDesc = description !== undefined ? String(description).trim() : link.description;
      const newCategory = category !== undefined ? String(category).trim() : link.category;
      const newTags = tags !== undefined ? String(tags).trim() : link.tags;
      const newFavorite = is_favorite !== undefined ? (is_favorite ? 1 : 0) : link.is_favorite;

      db.prepare(`
        UPDATE links 
        SET url = ?, title = ?, description = ?, category = ?, tags = ?, domain = ?, is_favorite = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newUrl, newTitle, newDesc, newCategory, newTags, newDomain, newFavorite, Number(id));

      const updated = db.prepare('SELECT * FROM links WHERE id = ?').get(Number(id));
      return ok(res, { data: updated });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Delete link
  delete: (req, res) => {
    try {
      const { id } = req.params;
      const info = db.prepare('DELETE FROM links WHERE id = ?').run(Number(id));
      if (info.changes === 0) return notFound(res, 'Link not found');
      return ok(res, { message: 'Link deleted successfully' });
    } catch (err) {
      return fail(res, err);
    }
  }
};
