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
          const clean = s.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim();
          if (clean) {
            query = query.or(`url.ilike.%${clean}%,title.ilike.%${clean}%,description.ilike.%${clean}%,domain.ilike.%${clean}%`);
          }
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
        if (!link) return notFound(res, 'Link tidak ditemukan');
        return ok(res, { data: link });
      }

      const link = db.prepare('SELECT * FROM links WHERE id = ?').get(Number(id));
      if (!link) return notFound(res, 'Link tidak ditemukan');
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
      if (!cleanUrl) return badRequest(res, 'URL wajib diisi');

      // Add https:// if protocol is missing
      if (!/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = 'https://' + cleanUrl;
      }

      // Validate URL syntax
      try {
        const parsed = new URL(cleanUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return badRequest(res, 'Skema URL tidak valid. Hanya http dan https yang didukung.');
        }
      } catch {
        return badRequest(res, 'Format URL tidak valid');
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

        // Automatically analyze the link with AI (fast 3.5s timeout)
        try {
          const enriched = await Promise.race([
            performLinkAIAnalysis(created),
            new Promise(r => setTimeout(r, 3500))
          ]);
          if (enriched) return ok(res, { data: enriched, message: 'Link berhasil disimpan & dianalisis AI' }, 201);
        } catch (err) {
          console.warn('[ARKA AI] Inline link analysis error, background continuing:', err.message);
          performLinkAIAnalysis(created).catch(() => {});
        }

        return ok(res, { data: created, message: 'Link berhasil disimpan' }, 201);
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

      try {
        const enriched = await Promise.race([
          performLinkAIAnalysis(created),
          new Promise(r => setTimeout(r, 3500))
        ]);
        if (enriched) return ok(res, { data: enriched, message: 'Link berhasil disimpan & dianalisis AI' }, 201);
      } catch (err) {
        console.warn('[ARKA AI] Inline link analysis error (SQLite):', err.message);
        performLinkAIAnalysis(created).catch(() => {});
      }

      return ok(res, { data: created, message: 'Link berhasil disimpan' }, 201);
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
        if (!existing) return notFound(res, 'Link tidak ditemukan');

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
        if (!updated) return notFound(res, 'Link tidak ditemukan');
        return ok(res, { data: updated });
      }

      const link = db.prepare('SELECT * FROM links WHERE id = ?').get(Number(id));
      if (!link) return notFound(res, 'Link tidak ditemukan');

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
        if (count === 0) return notFound(res, 'Link tidak ditemukan');
        return ok(res, { message: 'Link berhasil dihapus' });
      }

      const info = db.prepare('DELETE FROM links WHERE id = ?').run(Number(id));
      if (info.changes === 0) return notFound(res, 'Link tidak ditemukan');
      return ok(res, { message: 'Link berhasil dihapus' });
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

      if (!link) return notFound(res, 'Link tidak ditemukan');

      const updated = await performLinkAIAnalysis(link);
      return ok(res, { data: updated || link, message: 'Link berhasil dianalisis dan diperkaya' });
    } catch (err) {
      return fail(res, err);
    }
  }
};

/**
 * Reusable AI analysis for links/bookmarks.
 * Analyzes webpage metadata, extracts summary, category, and tags,
 * and updates the database row automatically.
 */
export async function performLinkAIAnalysis(link) {
  if (!link || !link.id) return null;

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

  const prompt = `Analisis bookmark web ini dan balas HANYA dengan objek JSON yang valid.
URL: ${link.url}
Judul: ${link.title}
Domain: ${link.domain}
Cuplikan web: ${webSnippet || link.description || 'N/A'}

Balas HANYA dengan JSON berikut:
{
  "title": "Judul yang jelas dan rapi untuk bookmark ini",
  "description": "Satu kalimat ringkas dalam bahasa Indonesia yang merangkum tujuan atau isi situs",
  "category": "Satu kategori dari: Technology, Design, AI, News, Education, Tools, Documentation, Business, Personal",
  "tags": ["tag1", "tag2", "tag3", "tag4"]
}`;

  const { groqChat, getGemini, MODELS, describeAIError } = await import('../ai/providers.js');
  let rawText = '';
  try {
    rawText = await groqChat([
      { role: 'system', content: 'Kamu adalah ARKA, pengklasifikasi bookmark dan tautan yang cerdas. Selalu kembalikan JSON yang valid tanpa blok markdown.' },
      { role: 'user', content: prompt }
    ], { json: true, maxTokens: 400 });
  } catch (aiErr) {
    try {
      const gemini = getGemini();
      const geminiRes = await gemini.models.generateContent({
        model: MODELS.gemini.flash,
        contents: `Kamu adalah ARKA, pengklasifikasi bookmark dan tautan. Balas HANYA dengan JSON yang valid:\n${prompt}`,
        config: { responseMimeType: 'application/json' }
      });
      rawText = geminiRes.text || geminiRes.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (geminiErr) {
      console.warn('[ARKA AI] Link analysis fallback error:', describeAIError(geminiErr));
    }
  }

  let parsed = {};
  if (rawText) {
    try {
      const cleaned = String(rawText).replace(/```json?/gi, '').replace(/```/g, '').trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      const candidate = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
      parsed = JSON.parse(candidate);
    } catch {}
  }

  const newTitle = parsed.title || link.title;
  const newDesc = parsed.description || link.description;
  const newCategory = parsed.category || link.category || 'General';
  const newTags = Array.isArray(parsed.tags) ? parsed.tags : (link.tags || []);

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { data: updated, error: uErr } = await supabase.from('links').update({
      title: newTitle,
      description: newDesc,
      category: newCategory,
      tags: newTags,
      updated_at: new Date().toISOString()
    }).eq('id', link.id).select().maybeSingle();

    if (uErr) {
      console.warn('[ARKA AI] Could not update link in Supabase:', uErr.message);
      return link;
    }
    return updated || link;
  }

  const tagsStr = Array.isArray(newTags) ? newTags.join(',') : String(newTags || '');
  db.prepare(`
    UPDATE links
    SET title = ?, description = ?, category = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newTitle, newDesc, newCategory, tagsStr, Number(link.id));

  return db.prepare('SELECT * FROM links WHERE id = ?').get(Number(link.id));
}
