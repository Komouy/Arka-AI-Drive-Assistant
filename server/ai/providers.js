/**
 * ARKA AI — Provider Configuration
 * 
 * Groq  = Primary (text, agent, search, fast inference)
 * Gemini = Multimodal (image/video/audio analysis)
 * 
 * Model strategy (IDs verified working with ARKA's keys — Sep 2026):
 *   - Text/Agent tasks  → Groq qwen/qwen3.8-27b (fast) / openai/gpt-oss-120b (smart)
 *   - Image/Video       → Gemini gemini-3.8-flash (multimodal)
 *   - Fallback          → If primary fails, other provider is tried
 *
 * ⚠️  Provider model IDs get retired regularly. If `arka ai-status` shows ❌
 *     while the API key is valid, the model name is the usual culprit — see
 *     https://console.groq.com/docs/models and
 *     https://ai.google.dev/gemini-api/docs/models, then update MODELS below.
 */

import Groq from 'groq-sdk';
import { GoogleGenAI } from '@google/genai';
import { getApiKey, loadEnv } from '../config/env.js';

// Root .env is loaded through the shared config module (single implementation)
loadEnv();

// ── Groq Client ─────────────────────────────────────────────────────────────
let groqClient = null;
export function getGroq() {
  if (!groqClient) {
    const key = getApiKey('groq');
    if (!key) throw new Error('GROQ_API_KEY not set. Add it to your .env file.');
    groqClient = new Groq({ apiKey: key });
  }
  return groqClient;
}

// ── Gemini Client ────────────────────────────────────────────────────────────
let geminiClient = null;
export function getGemini() {
  if (!geminiClient) {
    const key = getApiKey('gemini');
    if (!key) throw new Error('GEMINI_API_KEY not set. Add it to your .env file.');
    geminiClient = new GoogleGenAI({ apiKey: key });
  }
  return geminiClient;
}

export const MODELS = {
  // Groq — text, agent tool-calling & JSON metadata (IDs verified Sep 2026)
  groq: {
    fast:       'qwen/qwen3.8-27b',      // best tool-calling (agent) + clean JSON
    smart:      'openai/gpt-oss-120b',   // stronger general reasoning
  },
  // Gemini — multimodal (check https://ai.google.dev/gemini-api/docs/models for latest)
  gemini: {
    flash:      'gemini-3.5-flash',      // Fast + multimodal (Google's current recommendation)
    pro:        'gemini-3.8-flash',      // Pro tier needs paid quota → reuse flash
  }
};

export function describeAIError(err) {
  const raw = String(err?.message || err || 'Unknown AI error');
  const status = err?.status || err?.code || '';
  const jsonStart = raw.indexOf('{');

  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      const message = parsed?.error?.message || parsed?.message;
      if (message) return status ? `${status} — ${message}` : message;
    } catch {
      /* fall through to raw text */
    }
  }
  return status ? `${status} — ${raw}` : raw;
}

// ── Status Check ─────────────────────────────────────────────────────────────
/**
 * Live-check both providers.
 * @returns {Promise<{ groq: {available:boolean, error:string|null},
 *                     gemini: {available:boolean, error:string|null},
 *                     configured: boolean }>}
 */
export async function checkAIProviders() {
  const result = {
    groq:   { available: false, error: null },
    gemini: { available: false, error: null }
  };

  try {
    const groq = getGroq();
    await groq.chat.completions.create({
      model: MODELS.groq.fast,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5
    });
    result.groq.available = true;
  } catch (err) {
    result.groq.error = describeAIError(err);
  }

  try {
    const gemini = getGemini();
    const response = await gemini.models.generateContent({
      model: MODELS.gemini.flash,
      contents: 'ping'
    });
    result.gemini.available = !!(response?.text || response?.candidates?.length);
    if (!result.gemini.available) result.gemini.error = 'Model replied with an empty response';
  } catch (err) {
    result.gemini.error = describeAIError(err);
  }

  result.configured = result.groq.available || result.gemini.available;
  return result;
}

// ── Safe Groq Chat ────────────────────────────────────────────────────────────
/**
 * Call Groq chat completion with automatic error handling.
 * Returns the assistant message string, or throws on failure.
 */
export async function groqChat(messages, opts = {}) {
  const groq = getGroq();
  const response = await groq.chat.completions.create({
    model: opts.model || MODELS.groq.fast,
    messages,
    max_tokens:   opts.maxTokens   || 1024,
    temperature:  opts.temperature || 0.3,
    response_format: opts.json ? { type: 'json_object' } : undefined,
  });
  return response.choices[0]?.message?.content || '';
}

export default { getGroq, getGemini, MODELS, groqChat, checkAIProviders, describeAIError };
