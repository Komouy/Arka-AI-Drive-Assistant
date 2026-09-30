import { db } from '../database/db.js';
import { isSupabaseConfigured, getSupabaseClient } from '../config/supabase.js';
import { likePattern, ESCAPE_LIKE } from '../utils/search.js';
import { fail, badRequest, notFound, ok } from '../utils/http.js';

export const promptController = {
  // List all prompts with optional filter
  getAll: async (req, res) => {
    try {
      const { category, search, favorites } = req.query;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        let query = supabase.from('prompts').select('*');

        // Multi-tenant: show user's own prompts + shared owner prompts (user_id IS NULL)
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
          query = query.or(`title.ilike.%${s}%,content.ilike.%${s}%`);
        }

        query = query.order('created_at', { ascending: false });
        const { data: prompts, error } = await query;
        if (error) return fail(res, error);

        // Get categories summary (scoped to user)
        let catQuery = supabase.from('prompts').select('category');
        if (userId) catQuery = catQuery.or(`user_id.eq.${userId},user_id.is.null`);
        const { data: allPrompts } = await catQuery;
        const catMap = {};
        for (const p of (allPrompts || [])) {
          const c = p.category || 'General';
          catMap[c] = (catMap[c] || 0) + 1;
        }
        const categories = Object.entries(catMap)
          .map(([cat, count]) => ({ category: cat, count }))
          .sort((a, b) => a.category.localeCompare(b.category));

        return ok(res, { count: (prompts || []).length, data: prompts || [], categories });
      }

      // SQLite Fallback
      let query = 'SELECT * FROM prompts WHERE 1=1';
      const params = [];

      if (category) {
        query += ' AND category = ?';
        params.push(category);
      }
      if (favorites === 'true') {
        query += ' AND is_favorite = 1';
      }
      if (search) {
        query += ` AND (title LIKE ? ${ESCAPE_LIKE} OR content LIKE ? ${ESCAPE_LIKE} OR tags LIKE ? ${ESCAPE_LIKE})`;
        const pattern = likePattern(String(search).trim());
        params.push(pattern, pattern, pattern);
      }

      query += ' ORDER BY created_at DESC';
      const prompts = db.prepare(query).all(...params);

      const categories = db.prepare(`
        SELECT category, COUNT(*) as count 
        FROM prompts 
        GROUP BY category
        ORDER BY category
      `).all();

      return ok(res, { count: prompts.length, data: prompts, categories });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Create prompt
  create: async (req, res) => {
    try {
      const { title, content, category = 'General', tags = '' } = req.body;

      const cleanTitle = String(title || '').trim();
      const cleanContent = String(content || '').trim();
      if (!cleanTitle) return badRequest(res, 'Judul wajib diisi');
      if (!cleanContent) return badRequest(res, 'Konten wajib diisi');

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;
        const tagsVal = Array.isArray(tags) ? tags : String(tags || '').split(',').map(t => t.trim()).filter(Boolean);

        const { data: prompt, error } = await supabase.from('prompts').insert({
          title: cleanTitle,
          content: cleanContent,
          category: String(category || 'General').trim(),
          tags: tagsVal,
          user_id: userId
        }).select().single();

        if (error) return fail(res, error);
        return ok(res, { data: prompt }, 201);
      }

      const info = db.prepare('INSERT INTO prompts (title, content, category, tags) VALUES (?, ?, ?, ?)')
        .run(cleanTitle, cleanContent, String(category || 'General').trim(), String(tags || '').trim());

      const prompt = db.prepare('SELECT * FROM prompts WHERE id = ?').get(Number(info.lastInsertRowid));
      return ok(res, { data: prompt }, 201);
    } catch (err) {
      return fail(res, err);
    }
  },

  // Update prompt
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { title, content, category, tags, is_favorite } = req.body;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        // Check ownership
        let checkQuery = supabase.from('prompts').select('id, user_id').eq('id', id);
        if (userId) checkQuery = checkQuery.or(`user_id.eq.${userId},user_id.is.null`);
        const { data: existing } = await checkQuery.maybeSingle();
        if (!existing) return notFound(res, 'Prompt tidak ditemukan');

        const updates = { updated_at: new Date().toISOString() };

        if (title !== undefined) {
          const cleanTitle = String(title).trim();
          if (!cleanTitle) return badRequest(res, 'Judul tidak boleh kosong');
          updates.title = cleanTitle;
        }
        if (content !== undefined) {
          const cleanContent = String(content).trim();
          if (!cleanContent) return badRequest(res, 'Konten tidak boleh kosong');
          updates.content = cleanContent;
        }
        if (category !== undefined) updates.category = String(category).trim();
        if (tags !== undefined) {
          updates.tags = Array.isArray(tags) ? tags : String(tags || '').split(',').map(t => t.trim()).filter(Boolean);
        }
        if (is_favorite !== undefined) updates.is_favorite = Boolean(is_favorite);

        const { data: updated, error } = await supabase.from('prompts').update(updates).eq('id', id).select().maybeSingle();
        if (error) return fail(res, error);
        if (!updated) return notFound(res, 'Prompt tidak ditemukan');
        return ok(res, { data: updated });
      }

      const prompt = db.prepare('SELECT * FROM prompts WHERE id = ?').get(Number(id));
      if (!prompt) return notFound(res, 'Prompt tidak ditemukan');

      const newTitle = title !== undefined ? String(title).trim() : prompt.title;
      const newContent = content !== undefined ? String(content).trim() : prompt.content;
      if (!newTitle) return badRequest(res, 'Judul tidak boleh kosong');
      if (!newContent) return badRequest(res, 'Konten tidak boleh kosong');

      const newCategory = category !== undefined ? String(category).trim() : prompt.category;
      const newTags = tags !== undefined ? String(tags).trim() : prompt.tags;
      const newFavorite = is_favorite !== undefined ? (is_favorite ? 1 : 0) : prompt.is_favorite;

      db.prepare(`
        UPDATE prompts 
        SET title = ?, content = ?, category = ?, tags = ?, is_favorite = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newTitle, newContent, newCategory, newTags, newFavorite, Number(id));

      const updated = db.prepare('SELECT * FROM prompts WHERE id = ?').get(Number(id));
      return ok(res, { data: updated });
    } catch (err) {
      return fail(res, err);
    }
  },

  // Delete prompt
  delete: async (req, res) => {
    try {
      const { id } = req.params;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        const userId = req.user?.id || null;

        let delQuery = supabase.from('prompts').delete({ count: 'exact' }).eq('id', id);
        if (userId) delQuery = delQuery.or(`user_id.eq.${userId},user_id.is.null`);
        const { error, count } = await delQuery;
        if (error) return fail(res, error);
        if (count === 0) return notFound(res, `Prompt ID ${id} tidak ditemukan`);
        return ok(res, { message: 'Prompt berhasil dihapus', id });
      }

      const info = db.prepare('DELETE FROM prompts WHERE id = ?').run(Number(id));
      if (!info.changes) return notFound(res, `Prompt ID ${id} tidak ditemukan`);

      return ok(res, { message: 'Prompt berhasil dihapus', id: Number(id) });
    } catch (err) {
      return fail(res, err);
    }
  }
};
