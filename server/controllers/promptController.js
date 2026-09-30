import { db } from '../database/db.js';
import { likePattern, ESCAPE_LIKE } from '../utils/search.js';
import { fail, badRequest, notFound, ok } from '../utils/http.js';

export const promptController = {
  // List all prompts with optional filter
  getAll: (req, res) => {
    try {
      const { category, search, favorites } = req.query;
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

      // Get categories summary
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
  create: (req, res) => {
    try {
      const { title, content, category = 'General', tags = '' } = req.body;

      const cleanTitle = String(title || '').trim();
      const cleanContent = String(content || '').trim();
      if (!cleanTitle) return badRequest(res, 'Title is required');
      if (!cleanContent) return badRequest(res, 'Content is required');

      const info = db.prepare('INSERT INTO prompts (title, content, category, tags) VALUES (?, ?, ?, ?)')
        .run(cleanTitle, cleanContent, String(category || 'General').trim(), String(tags || '').trim());

      const prompt = db.prepare('SELECT * FROM prompts WHERE id = ?').get(Number(info.lastInsertRowid));
      return ok(res, { data: prompt }, 201);
    } catch (err) {
      return fail(res, err);
    }
  },

  // Update prompt
  update: (req, res) => {
    try {
      const { id } = req.params;
      const { title, content, category, tags, is_favorite } = req.body;

      const prompt = db.prepare('SELECT * FROM prompts WHERE id = ?').get(Number(id));
      if (!prompt) return notFound(res, 'Prompt not found');

      const newTitle = title !== undefined ? String(title).trim() : prompt.title;
      const newContent = content !== undefined ? String(content).trim() : prompt.content;
      if (!newTitle) return badRequest(res, 'Title cannot be empty');
      if (!newContent) return badRequest(res, 'Content cannot be empty');

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
  delete: (req, res) => {
    try {
      const { id } = req.params;
      const info = db.prepare('DELETE FROM prompts WHERE id = ?').run(Number(id));

      // Never report success for a prompt that does not exist
      if (!info.changes) return notFound(res, `Prompt ID ${id} not found`);

      return ok(res, { message: 'Prompt deleted', id: Number(id) });
    } catch (err) {
      return fail(res, err);
    }
  }
};
