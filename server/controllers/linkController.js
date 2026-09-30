import { db } from '../database/db.js';
import { isSupabaseConfigured, getSupabaseClient } from '../config/supabase.js';
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
  getAll: async (req, res) => {
    try {
      const { category, search, favorites } = req.query;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        let query = supabase.from('links').select('*');

        // Multi-tenant: show user's own links + shared owner links (user_id IS NULL)
        if (userId) {
          query = query.or(`user_id.eq.${userId},user_id.is.null`);
        }

        if (category) {
          query = query.eq('category', category);
        }
        if (favorites === 'true') {
          query = query.eq('is_favorite', true);
        }
        if (search) {
          const s = String(search).trim();
          query = query.or(`url.ilike.%${s}%,title.ilike.%${s}%,description.ilike.%${s}%,domain.ilike.%${s}%`);
        }

        query = query.order('created_at', { ascending: false });
        const { data: links, error } = await query;
        if (error) return fail(res, error);

        // Categories summary (scoped to user)
        let catQuery = supabase.from('links').select('category');
        if (userId) catQuery = catQuery.or(`user_id.eq.${userId},user_id.is.null`);
        const { data: allLinks } = await catQuery;
        const catMap = {};
        for (const l of (allLinks || [])) {
          const c = l.category || 'General';
          catMap[c] = (catMap[c] || 0) + 1;
        }
        const categories = Object.entries(catMap)
          .map(([cat, count]) => ({ category: cat, count }))
          .sort((a, b) => a.category.localeCompare(b.category));

        return ok(res, { count: (links || []).length, data: links || [], categories });
      }

      // SQLite Fallback
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
  getById: async (req, res) => {
    try {
      const { id } = req.params;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;
        let query = supabase.from('links').select('*').eq('id', id);
        if (userId) {
          query = query.or(`user_id.eq.${userId},user_id.is.null`);
        }
        const { data: link, error } = await query.maybeSingle();
        if (error) return fail(res, error);
        if (!link) return notFound(res, 'Link not found');
        return ok(res, { data: link });
      }

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

      // Validate URL syntax
      try {
        const parsed = new URL(cleanUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return badRequest(res, 'Invalid URL scheme. Only http and https are supported.');
        }
      } catch {
        return badRequest(res, 'Invalid URL format');
      }

      const domain = extractDomain(cleanUrl);
      let cleanTitle = String(title || '').trim();

      // If title not provided, try fetching or fallback to domain
      if (!cleanTitle) {
        const fetchedTitle = await fetchPageTitle(cleanUrl);
        cleanTitle = fetchedTitle || domain || cleanUrl;
      }

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;
        const tagsVal = Array.isArray(tags) ? tags : String(tags || '').split(',').map(t => t.trim()).filter(Boolean);

        const { data: created, error } = await supabase.from('links').insert({
          url: cleanUrl,
          title: cleanTitle,
          description: String(description || '').trim(),
          category: String(category || 'General').trim(),
          tags: tagsVal,
          domain,
          user_id: userId
        }).select().single();

        if (error) return fail(res, error);
        return ok(res, { data: created, message: 'Link successfully saved & categorized' }, 201);
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
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { url, title, description, category, tags, is_favorite } = req.body;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        // Check ownership
        let checkQuery = supabase.from('links').select('id, user_id').eq('id', id);
        if (userId) checkQuery = checkQuery.or(`user_id.eq.${userId},user_id.is.null`);
        const { data: existing } = await checkQuery.maybeSingle();
        if (!existing) return notFound(res, 'Link not found');

        const updates = { updated_at: new Date().toISOString() };

        if (url !== undefined) {
          let newUrl = String(url).trim();
          if (!/^https?:\/\//i.test(newUrl)) newUrl = 'https://' + newUrl;
          updates.url = newUrl;
          updates.domain = extractDomain(newUrl);
        }
        if (title !== undefined) updates.title = String(title).trim();
        if (description !== undefined) updates.description = String(description).trim();
        if (category !== undefined) updates.category = String(category).trim();
        if (tags !== undefined) {
          updates.tags = Array.isArray(tags) ? tags : String(tags || '').split(',').map(t => t.trim()).filter(Boolean);
        }
        if (is_favorite !== undefined) updates.is_favorite = Boolean(is_favorite);

        const { data: updated, error } = await supabase.from('links').update(updates).eq('id', id).select().maybeSingle();
        if (error) return fail(res, error);
        if (!updated) return notFound(res, 'Link not found');
        return ok(res, { data: updated });
      }

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
  delete: async (req, res) => {
    try {
      const { id } = req.params;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        let delQuery = supabase.from('links').delete({ count: 'exact' }).eq('id', id);
        if (userId) delQuery = delQuery.or(`user_id.eq.${userId},user_id.is.null`);
        const { error, count } = await delQuery;
        if (error) return fail(res, error);
        if (count === 0) return notFound(res, 'Link not found');
        return ok(res, { message: 'Link deleted successfully' });
      }

      const info = db.prepare('DELETE FROM links WHERE id = ?').run(Number(id));
      if (info.changes === 0) return notFound(res, 'Link not found');
      return ok(res, { message: 'Link deleted successfully' });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Analyze and auto-tag link with AI
  analyze: async (req, res) => {
    try {
      const { id } = req.params;
      let link = null;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.from('links').select('*').eq('id', id).maybeSingle();
        if (error) return fail(res, error);
        link = data;
      } else {
        link = db.prepare('SELECT * FROM links WHERE id = ?').get(Number(id));
      }

      if (!link) return notFound(res, 'Link not found');

      // Fetch brief web snippet if possible
      let webSnippet = '';
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const pageRes = await fetch(link.url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (ARKA-AI-Assistant/1.0)' }
        });
        clearTimeout(timer);
        if (pageRes.ok && (pageRes.headers.get('content-type') || '').includes('text/html')) {
          const html = await pageRes.text();
          const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
          if (metaMatch && metaMatch[1]) {
            webSnippet = metaMatch[1].trim();
          } else {
            const text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                             .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                             .replace(/<[^>]+>/g, ' ')
                             .replace(/\s+/g, ' ')
                             .trim();
            webSnippet = text.slice(0, 400);
          }
        }
      } catch {}

      const prompt = `Analyze this web bookmark and respond ONLY with a valid JSON object.
URL: ${link.url}
Title: ${link.title}
Domain: ${link.domain}
Web Snippet: ${webSnippet || link.description || 'N/A'}

Respond with ONLY this JSON:
{
  "title": "Clear and clean title for this bookmark",
  "description": "One concise sentence summarizing the site purpose or content",
  "category": "One category from: Technology, Design, AI, News, Education, Tools, Documentation, Business, Personal",
  "tags": ["tag1", "tag2", "tag3", "tag4"]
}`;

      const { groqChat } = await import('../ai/providers.js');
      const aiRes = await groqChat([
        { role: 'system', content: 'You are ARKA, an intelligent bookmark and link classifier. Always return strictly valid JSON without markdown fences.' },
        { role: 'user', content: prompt }
      ], { json: true });

      if (!aiRes.ok) {
        return res.status(502).json({ success: false, error: aiRes.error || 'AI analysis failed' });
      }

      let parsed = {};
      try {
        parsed = JSON.parse(aiRes.content);
      } catch {
        return res.status(502).json({ success: false, error: 'AI returned invalid JSON' });
      }

      const newTitle = parsed.title || link.title;
      const newDesc = parsed.description || link.description;
      const newCategory = parsed.category || link.category;
      const newTags = Array.isArray(parsed.tags) ? parsed.tags : (link.tags || []);

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const { data: updated, error: uErr } = await supabase.from('links').update({
          title: newTitle,
          description: newDesc,
          category: newCategory,
          tags: newTags,
          updated_at: new Date().toISOString()
        }).eq('id', id).select().single();

        if (uErr) return fail(res, uErr);
        return ok(res, { data: updated, message: 'Link analyzed and enriched successfully' });
      }

      const tagsStr = Array.isArray(newTags) ? newTags.join(',') : String(newTags || '');
      db.prepare(`
        UPDATE links
        SET title = ?, description = ?, category = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newTitle, newDesc, newCategory, tagsStr, Number(id));

      const updated = db.prepare('SELECT * FROM links WHERE id = ?').get(Number(id));
      return ok(res, { data: updated, message: 'Link analyzed and enriched successfully' });
    } catch (err) {
      return fail(res, err);
    }
  }
};
