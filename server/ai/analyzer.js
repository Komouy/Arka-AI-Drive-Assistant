/**
 * ARKA AI — Smart Metadata Analyzer
 * 
 * Strategy:
 *   - Image/Video/Audio  → Gemini (multimodal vision/audio)
 *   - Text/Code/Doc      → Groq (fast text LLM)
 *   - Unknown/Other      → Groq fallback
 * 
 * Output shape:
 * {
 *   description: string,
 *   category:    string,
 *   topic:       string,
 *   tags:        string[],
 *   project:     string,
 *   suggestedFolder: string,
 *   provider:    'gemini' | 'groq',
 * }
 */

import fs from 'node:fs';
import { getGemini, groqChat, MODELS, describeAIError } from './providers.js';
import { isMultimodal, isTextLike, FILE_CATEGORIES } from '../utils/fileTypes.js';

/**
 * Inline multimodal payloads are capped by the provider request size (~20 MB),
 * so larger video/audio files are analysed through the text fallback instead of
 * being loaded fully into memory.
 */
export const MAX_INLINE_ANALYZE_BYTES = 18 * 1024 * 1024;

// ── Determine which AI to use per MIME type ──────────────────────────────────
function selectProvider(mimeType = '', filename = '') {
  // Raster images, video and audio need a multimodal model (Gemini).
  // SVG/XML and oversized media are handled by the text model instead.
  return isMultimodal(mimeType, filename) ? 'gemini' : 'groq';
}

// ── Prompt builder for text-only files ───────────────────────────────────────
function buildTextAnalysisPrompt(filename, mimeType, textPreview = '', hint = '') {
  return `You are ARKA, a personal AI workspace assistant. Analyze this file and respond ONLY with a valid JSON object.

File: "${filename}"
MIME: "${mimeType}"
${hint ? `Note: ${hint}\n` : ''}${textPreview ? `Content preview (first 500 chars):\n${textPreview.slice(0, 500)}` : ''}

Respond with ONLY this JSON (no markdown, no explanation):
{
  "description": "One clear sentence describing what this file contains or does",
  "category": "One of: Image, Video, Audio, Document, Code, Prompt, Archive, Other",
  "topic": "Main topic/subject in 2-5 words (e.g. 'Mobile App Design', 'Database Schema')",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "project": "Most likely project name this belongs to (e.g. 'Instagram', 'Programming', 'Personal', 'Website')",
  "suggestedFolder": "Best folder path suggestion (e.g. 'Projects/Instagram' or 'Programming')",
  "suggestedName": "A clean, human-readable, descriptive filename preserving the original extension (e.g. 'Database-Schema-Migration.sql' or 'API-Integration-Guide.md')"
}`;
}

// ── Analyze media (image/video/audio) with Gemini multimodal ─────────────────
async function analyzeWithGemini(filePath, mimeType, filename) {
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_INLINE_ANALYZE_BYTES) {
    throw new Error(
      `File is too large for inline multimodal analysis ` +
      `(${(stats.size / 1024 / 1024).toFixed(1)} MB > ${MAX_INLINE_ANALYZE_BYTES / 1024 / 1024} MB)`
    );
  }

  const gemini = getGemini();

  let fileBuffer;
  try {
    fileBuffer = fs.readFileSync(filePath);
  } catch (err) {
    throw new Error(`Could not read file for Gemini analysis: ${err.message}`);
  }

  const mediaPart = {
    inlineData: {
      data: fileBuffer.toString('base64'),
      mimeType: mimeType && mimeType !== 'application/octet-stream' ? mimeType : 'application/octet-stream'
    }
  };

  const textPart = `You are ARKA, a personal AI workspace assistant. Analyze this file and respond ONLY with a valid JSON object.

File name: "${filename}"

Respond with ONLY this JSON (no markdown, no explanation):
{
  "description": "One clear sentence describing what this file contains or shows",
  "category": "One of: Image, Video, Audio, Document, Code, Prompt, Archive, Other",
  "topic": "Main topic/subject in 2-5 words (e.g. 'Mobile App Design', 'Database Schema')",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "project": "Most likely project name this belongs to (e.g. 'Instagram', 'Programming', 'Personal', 'Website')",
  "suggestedFolder": "Best folder path suggestion (e.g. 'Projects/Instagram' or 'Programming')",
  "suggestedName": "A clean, human-readable, descriptive filename preserving the original extension (e.g. 'Receipt-Starbucks-Sep2026.jpg' or 'Figma-Wireframe.png')"
}`;

  const model = MODELS.gemini.flash;
  const result = await gemini.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: textPart },
          mediaPart
        ]
      }
    ]
  });

  const text = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { raw: text, provider: 'gemini' };
}

// ── Analyze text/code/doc with Groq ──────────────────────────────────────────
/** Read only the first `maxBytes` of a file (never load huge files fully). */
function readTextPreview(filePath, maxBytes = 2000) {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buffer = Buffer.alloc(maxBytes);
      const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

async function analyzeWithGroq(filePath, mimeType, filename, hint = '') {
  const textPreview = isTextLike(mimeType, filename) ? readTextPreview(filePath) : '';
  const prompt = buildTextAnalysisPrompt(filename, mimeType, textPreview, hint);
  const raw = await groqChat(
    [{ role: 'user', content: prompt }],
    { json: true, maxTokens: 512 }
  );
  return { raw, provider: 'groq' };
}

// ── Parse AI JSON response safely ─────────────────────────────────────────────
function parseAIResponse(raw = '', originalFilename = '') {
  const cleaned = String(raw).replace(/```json?/gi, '').replace(/```/g, '').trim();

  // Models sometimes wrap the JSON in prose — keep only the object body
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const candidate = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  try {
    const parsed = JSON.parse(candidate);

    const rawCategory = String(parsed.category || '').trim();
    const category = FILE_CATEGORIES.find(c => c.toLowerCase() === rawCategory.toLowerCase()) || 'Other';

    const rawTags = Array.isArray(parsed.tags)
      ? parsed.tags
      : String(parsed.tags || '').split(',');

    let suggestedName = String(parsed.suggestedName || '').trim().replace(/[/\\?%*:|"<>]/g, '-').slice(0, 150);
    if (suggestedName && originalFilename && originalFilename.includes('.')) {
      const ext = originalFilename.split('.').pop();
      if (ext && !suggestedName.toLowerCase().endsWith('.' + ext.toLowerCase())) {
        suggestedName = `${suggestedName}.${ext}`;
      }
    }

    return {
      description:     String(parsed.description || '').slice(0, 500),
      category,
      topic:           String(parsed.topic || '').slice(0, 100),
      tags:            [...new Set(rawTags.map(t => String(t).toLowerCase().trim()).filter(Boolean))].slice(0, 8),
      project:         String(parsed.project || '').slice(0, 100),
      suggestedFolder: String(parsed.suggestedFolder || parsed.project || '').slice(0, 200),
      suggestedName:   suggestedName || ''
    };
  } catch {
    console.warn('[ARKA AI] Could not parse AI response as JSON:', String(raw).slice(0, 200));
    return { description: '', category: 'Other', topic: '', tags: [], project: '', suggestedFolder: '', suggestedName: '' };
  }
}

// ── Main analyze function ─────────────────────────────────────────────────────
/**
 * Analyze a file and return structured metadata.
 *
 * @param {string} filePath  - Absolute path to the physical file
 * @param {string} mimeType  - MIME type of the file
 * @param {string} filename  - Original filename
 * @returns {Promise<{ok:boolean, provider:string, error?:string, description:string,
 *                    category:string, topic:string, tags:string[], project:string,
 *                    suggestedFolder:string, analyzedAt:string}>}
 *          `ok:false` means NO usable metadata was produced — callers must not
 *          persist it as if it was analysed successfully.
 */
export async function analyzeFile(filePath, mimeType, filename) {
  const preferred = selectProvider(mimeType, filename);
  const analyzedAt = new Date().toISOString();

  let raw = '';
  let usedProvider = preferred;
  let primaryError = null;

  try {
    const result = preferred === 'gemini'
      ? await analyzeWithGemini(filePath, mimeType, filename)
      : await analyzeWithGroq(filePath, mimeType, filename);
    raw = result.raw;
    usedProvider = result.provider;
  } catch (err) {
    // Fallback to the text model (Groq acts as the universal fallback)
    primaryError = err;
    console.warn(`[ARKA AI] Primary provider (${preferred}) failed for "${filename}": ${describeAIError(err)}`);

    try {
      const hint = `direct ${preferred} analysis was unavailable (${describeAIError(err)}), so only the file name and type are known.`;
      const result = await analyzeWithGroq(filePath, mimeType, filename, hint);
      raw = result.raw;
      usedProvider = 'groq-fallback';
    } catch (fallbackError) {
      console.error(`[ARKA AI] Both providers failed for "${filename}": ${describeAIError(fallbackError)}`);
      return {
        ok: false,
        provider: 'failed',
        error: describeAIError(fallbackError),
        primaryError: describeAIError(primaryError),
        description: '', category: 'Other', topic: '', tags: [], project: '', suggestedFolder: '',
        analyzedAt
      };
    }
  }

  const metadata = parseAIResponse(raw, filename);

  if (!metadata.description && metadata.tags.length === 0) {
    console.warn(`[ARKA AI] "${filename}": provider ${usedProvider} returned no usable metadata.`);
    return { ok: false, provider: usedProvider, error: 'AI response contained no usable metadata', ...metadata, analyzedAt };
  }

  console.log(`[ARKA AI] ✅ Analyzed "${filename}" via ${usedProvider}: [${metadata.tags.join(', ')}]`);
  return { ok: true, provider: usedProvider, ...metadata, analyzedAt };
}

// ── Batch analyze (for inbox triage) ─────────────────────────────────────────
/**
 * Analyze multiple files concurrently (max 3 at once to avoid rate limits).
 *
 * @param {Array<{fileId:number, filePath:string, mimeType:string, filename:string}>} fileList
 * @returns {Promise<Array<{fileId:number, metadata:object}>>}
 */
export async function analyzeFiles(fileList = []) {
  const CONCURRENCY = 3;
  const results = [];

  for (let i = 0; i < fileList.length; i += CONCURRENCY) {
    const batch = fileList.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(f => analyzeFile(f.filePath, f.mimeType, f.filename))
    );
    batchResults.forEach((result, idx) => {
      results.push({
        fileId: batch[idx].fileId,
        metadata: result.status === 'fulfilled'
          ? result.value
          : { ok: false, provider: 'failed', error: result.reason?.message || 'Unknown analyzer error' }
      });
    });
  }

  return results;
}

export default { analyzeFile, analyzeFiles };
