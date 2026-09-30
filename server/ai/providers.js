/**
 * ARKA AI — Provider Configuration
 * 
 * Groq  = Primary (text, agent, search, fast inference)
 * Gemini = Multimodal (image/video/audio analysis)
 * 
 * Model strategy (IDs diverifikasi berfungsi dengan key ARKA — Sep 2026):
 *   - Text/Agent tasks  → Groq qwen/qwen3.8-27b (cepat) / openai/gpt-oss-120b (lebih pintar)
 *   - Image/Video       → Gemini gemini-3.5-flash (multimodal)
 *   - Fallback          → Jika provider utama gagal, provider lain dicoba
 *
 * ⚠️  ID model provider sering dihentikan/diganti. Jika `arka ai-status` menampilkan ❌
 *     padahal API key valid, biasanya nama modelnya yang salah — lihat
 *     https://console.groq.com/docs/models dan
 *     https://ai.google.dev/gemini-api/docs/models, lalu perbarui MODELS di bawah.
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
    if (!key) throw new Error('GROQ_API_KEY belum diatur. Tambahkan ke file .env kamu.');
    groqClient = new Groq({ apiKey: key });
  }
  return groqClient;
}

// ── Gemini Client ────────────────────────────────────────────────────────────
let geminiClient = null;
export function getGemini() {
  if (!geminiClient) {
    const key = getApiKey('gemini');
    if (!key) throw new Error('GEMINI_API_KEY belum diatur. Tambahkan ke file .env kamu.');
    geminiClient = new GoogleGenAI({ apiKey: key });
  }
  return geminiClient;
}

export const MODELS = {
  // Groq — teks, tool-calling agent & metadata JSON (ID diverifikasi Sep 2026)
  groq: {
    fast:       'qwen/qwen3.8-27b',      // paling baik untuk tool-calling (agent) + JSON rapi
    smart:      'openai/gpt-oss-120b',   // penalaran umum yang lebih kuat
  },
  // Gemini — multimodal (cek https://ai.google.dev/gemini-api/docs/models untuk yang terbaru)
  gemini: {
    flash:      'gemini-3.5-flash',      // Cepat + multimodal (rekomendasi Google saat ini)
    pro:        'gemini-3.5-flash',      // Tier Pro butuh kuota berbayar → pakai flash yang sama
  }
};

export function describeAIError(err) {
  const raw = String(err?.message || err || 'Kesalahan AI tidak diketahui');
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
    if (!result.gemini.available) result.gemini.error = 'Model membalas dengan respons kosong';
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
