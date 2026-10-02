/**
 * ARKA AI — Controller
 * Handles: /api/ai/status, /api/ai/ask
 * (file analysis lives in fileController: /api/files/:id/analyze)
 */

import { fail, badRequest, ok } from '../utils/http.js';

export const aiController = {

  // GET /api/ai/status — live check of both providers (with the reason when offline)
  status: async (req, res) => {
    try {
      const { checkAIProviders, MODELS } = await import('../ai/providers.js');
      const providers = await checkAIProviders();
      const configured = providers.groq.available || providers.gemini.available;

      return ok(res, {
        data: {
          providers: {
            groq: {
              available: providers.groq.available,
              model:     MODELS.groq.fast,
              role:      'Utama — teks, agent, pencarian, inferensi cepat',
              error:     providers.groq.error
            },
            gemini: {
              available: providers.gemini.available,
              model:     MODELS.gemini.flash,
              role:      'Multimodal — analisis gambar, video, audio',
              error:     providers.gemini.error
            }
          },
          configured,
          tip: configured
            ? null
            : 'Tambahkan GROQ_API_KEY dan GEMINI_API_KEY ke file .env, lalu jalankan ulang server.'
        }
      });
    } catch (err) {
      return fail(res, err);
    }
  },

  // POST /api/ai/ask — natural language query via the AI agent
  ask: async (req, res) => {
    try {
      const { query, reset, history } = req.body || {};
      if (!query || typeof query !== 'string' || !query.trim()) {
        return badRequest(res, 'Query wajib diisi');
      }

      const { runAgent } = await import('../ai/agent.js');
      const userId = req.user?.id || null;
      // reset=true → forget the short conversation memory before answering
      const result = await runAgent(query.trim(), { reset: !!reset, userId, history });

      // A provider outage is reported as 502 with the real reason, never as success
      if (result.error) {
        return res.status(502).json({
          success: false,
          error: result.error,
          data: { answer: result.answer, toolCalled: result.toolCalled, toolResult: result.toolResult, steps: result.steps }
        });
      }

      return ok(res, {
        data: {
          answer:            result.answer,
          toolCalled:        result.toolCalled,
          toolResult:        result.toolResult,
          steps:             result.steps,
          truncated:         !!result.truncated,
          proposedActions:   result.proposedActions || null,
          permissionMessage: result.permissionMessage || null
        }
      });
    } catch (err) {
      console.error('[ARKA AI] /ask error:', err.message);
      return fail(res, err);
    }
  },

  // POST /api/ai/reset — forget the short conversation memory used by /ai/ask
  resetMemory: async (req, res) => {
    try {
      const { resetAgentMemory } = await import('../ai/agent.js');
      const userId = req.user?.id || 'guest';
      resetAgentMemory(userId);
      return ok(res, { data: { cleared: true } });
    } catch (err) {
      return fail(res, err);
    }
  }
};
