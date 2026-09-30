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
              role:      'Primary — text, agent, search, fast inference',
              error:     providers.groq.error
            },
            gemini: {
              available: providers.gemini.available,
              model:     MODELS.gemini.flash,
              role:      'Multimodal — image, video, audio analysis',
              error:     providers.gemini.error
            }
          },
          configured,
          tip: configured
            ? null
            : 'Add GROQ_API_KEY and GEMINI_API_KEY to your .env file, then restart the server.'
        }
      });
    } catch (err) {
      return fail(res, err);
    }
  },

  // POST /api/ai/ask — natural language query via the AI agent
  ask: async (req, res) => {
    try {
      const { query, reset } = req.body || {};
      if (!query || typeof query !== 'string' || !query.trim()) {
        return badRequest(res, 'Query is required');
      }

      const { runAgent } = await import('../ai/agent.js');
      // reset=true → forget the short conversation memory before answering
      const result = await runAgent(query.trim(), { reset: !!reset });

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
          answer:     result.answer,
          toolCalled: result.toolCalled,
          toolResult: result.toolResult,
          steps:      result.steps,
          truncated:  !!result.truncated
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
      resetAgentMemory();
      return ok(res, { data: { cleared: true } });
    } catch (err) {
      return fail(res, err);
    }
  }
};
