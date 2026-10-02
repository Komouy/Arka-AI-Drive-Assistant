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
function buildTextAnalysisPrompt(filename, mimeType, textPreview = '', hint = '', existingFolders = []) {
  const folderListStr = existingFolders.length > 0
    ? existingFolders.join(', ')
    : 'Belum ada folder khusus';

  return `Kamu adalah ARKA, asisten workspace pribadi berbasis AI. Analisis file ini dan balas HANYA dengan objek JSON yang valid.

File: "${filename}"
MIME: "${mimeType}"
${hint ? `Catatan: ${hint}\n` : ''}${textPreview ? `Cuplikan isi (500 karakter pertama):\n${textPreview.slice(0, 500)}\n` : ''}
Daftar folder yang sudah ada di workspace pengguna:
[${folderListStr}]

ATURAN KETAT:
1. suggestedFolder: Jika isi/tipe file cocok dengan salah satu folder dari daftar di atas, KAMU WAJIB menggunakan nama folder yang ada tersebut (sama persis hurufnya). JANGAN membuat nama baru yang mirip atau bersinonim (misal jika sudah ada 'Dokumen', dilarang membuat 'Berkas' atau 'Documents'). Hanya jika benar-benar tidak ada yang relevan, usulkan nama folder baru yang singkat (1-2 kata).
2. tags: MAKSIMAL 5 tag, semuanya HURUF KECIL (lowercase), tanpa spasi (gunakan underscore jika perlu), tidak boleh ada kata yang bersinonim/duplikat dalam daftar tag.
3. suggestedName: Nama file yang rapi, ringkas, deskriptif dengan ekstensi asli dipertahankan (contoh: 'database_schema.sql' atau 'laporan_keuangan_q1.pdf').

Balas HANYA dengan JSON berikut (tanpa markdown, tanpa penjelasan):
{
  "description": "Satu kalimat jelas dalam bahasa Indonesia yang menjelaskan isi atau fungsi file ini",
  "category": "Salah satu dari: Image, Video, Audio, Document, Code, Archive, Other",
  "topic": "Topik utama dalam 2-4 kata",
  "tags": ["tag1", "tag2", "tag3"],
  "project": "Nama proyek atau kategori utama",
  "suggestedFolder": "Nama folder yang ada atau usulan baru yang sesuai aturan di atas",
  "suggestedName": "Nama file baru yang rapi beserta ekstensi aslinya"
}`;
}

// ── Analyze media (image/video/audio/pdf) with Gemini multimodal ─────────────
async function analyzeWithGemini(filePath, mimeType, filename, existingFolders = []) {
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_INLINE_ANALYZE_BYTES) {
    throw new Error(
      `File terlalu besar untuk analisis multimodal inline ` +
      `(${(stats.size / 1024 / 1024).toFixed(1)} MB > ${MAX_INLINE_ANALYZE_BYTES / 1024 / 1024} MB)`
    );
  }

  const gemini = getGemini();

  let fileBuffer;
  try {
    fileBuffer = fs.readFileSync(filePath);
  } catch (err) {
    throw new Error(`Tidak bisa membaca file untuk analisis Gemini: ${err.message}`);
  }

  const mediaPart = {
    inlineData: {
      data: fileBuffer.toString('base64'),
      mimeType: mimeType && mimeType !== 'application/octet-stream' ? mimeType : 'application/octet-stream'
    }
  };

  const folderListStr = existingFolders.length > 0
    ? existingFolders.join(', ')
    : 'Belum ada folder khusus';

  const textPart = `Kamu adalah ARKA, asisten workspace pribadi berbasis AI. Analisis file ini dan balas HANYA dengan objek JSON yang valid.

Nama file: "${filename}"
Daftar folder yang sudah ada di workspace pengguna:
[${folderListStr}]

ATURAN KETAT:
1. suggestedFolder: Jika isi/tampilan file cocok dengan salah satu folder dari daftar di atas, KAMU WAJIB menggunakan nama folder yang ada tersebut (sama persis hurufnya). JANGAN membuat nama baru yang mirip atau bersinonim (misal jika sudah ada 'Dokumen', dilarang membuat 'Berkas' atau 'Documents'). Hanya jika benar-benar tidak ada yang relevan, usulkan nama folder baru yang singkat (1-2 kata).
2. tags: MAKSIMAL 5 tag, semuanya HURUF KECIL (lowercase), tanpa spasi (gunakan underscore jika perlu), tidak boleh ada kata yang bersinonim/duplikat dalam daftar tag.
3. suggestedName: Nama file yang rapi, ringkas, deskriptif dengan ekstensi asli dipertahankan (contoh: 'nota_pembelian.jpg' atau 'desain_landing_page.png').

Balas HANYA dengan JSON berikut (tanpa markdown, tanpa penjelasan):
{
  "description": "Satu kalimat jelas dalam bahasa Indonesia yang menjelaskan isi atau tampilan file ini",
  "category": "Salah satu dari: Image, Video, Audio, Document, Code, Archive, Other",
  "topic": "Topik utama dalam 2-4 kata",
  "tags": ["tag1", "tag2", "tag3"],
  "project": "Nama proyek atau kategori utama",
  "suggestedFolder": "Nama folder yang ada atau usulan baru yang sesuai aturan di atas",
  "suggestedName": "Nama file baru yang rapi beserta ekstensi aslinya"
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
    ],
    config: {
      responseMimeType: 'application/json'
    }
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
      const slice = buffer.subarray(0, bytesRead);
      // Skip if binary null-bytes detected
      for (let i = 0; i < Math.min(slice.length, 256); i++) {
        if (slice[i] === 0) return '';
      }
      return slice.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

async function analyzeWithGroq(filePath, mimeType, filename, hint = '', existingFolders = []) {
  const textPreview = isTextLike(mimeType, filename) ? readTextPreview(filePath) : '';
  const prompt = buildTextAnalysisPrompt(filename, mimeType, textPreview, hint, existingFolders);
  const raw = await groqChat(
    [{ role: 'user', content: prompt }],
    { json: true, maxTokens: 800 }
  );
  return { raw, provider: 'groq' };
}

// ── Analyze text/code/doc with Gemini (Fallback or alternative) ────────────────
async function analyzeWithGeminiText(filePath, mimeType, filename, hint = '', existingFolders = []) {
  const textPreview = isTextLike(mimeType, filename) ? readTextPreview(filePath) : '';
  const prompt = buildTextAnalysisPrompt(filename, mimeType, textPreview, hint, existingFolders);
  const gemini = getGemini();
  const result = await gemini.models.generateContent({
    model: MODELS.gemini.flash,
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    config: {
      responseMimeType: 'application/json'
    }
  });
  const text = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { raw: text, provider: 'gemini' };
}

// ── Smart heuristic fallback if models fail ───────────────────────────────────
function generateSmartFallback(filename = '', mimeType = '') {
  const ext = filename.includes('.') ? filename.split('.').pop() : '';
  const baseName = filename.replace(/\.[^/.]+$/, '').replace(/[-_.]+/g, ' ').trim();
  const words = baseName.split(' ').filter(w => w.length > 2);
  const tags = [...new Set(words.map(w => w.toLowerCase().replace(/[\s-]+/g, '_')))].slice(0, 5);

  let category = 'Document';
  let folder = 'Documents';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext.toLowerCase())) {
    category = 'Image';
    folder = 'Images';
  } else if (['mp4', 'mkv', 'mov', 'webm'].includes(ext.toLowerCase())) {
    category = 'Video';
    folder = 'Videos';
  } else if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext.toLowerCase())) {
    category = 'Audio';
    folder = 'Audio';
  } else if (['js', 'ts', 'py', 'html', 'css', 'json', 'sql', 'sh'].includes(ext.toLowerCase())) {
    category = 'Code';
    folder = 'Code';
  }

  const cleanName = baseName
    .split(' ')
    .map(w => w.toLowerCase())
    .join('_');
  const suggestedName = ext ? `${cleanName}.${ext}` : cleanName;

  return {
    description: `File ${category.toLowerCase()} "${filename}".`,
    category,
    topic: baseName || filename,
    tags: tags.length ? tags : [category.toLowerCase()],
    project: folder,
    suggestedFolder: folder,
    suggestedName
  };
}

// ── Parse AI JSON response safely ─────────────────────────────────────────────
function parseAIResponse(raw = '', originalFilename = '', existingFolders = []) {
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

    let suggestedName = String(parsed.suggestedName || '').trim().replace(/[/\\?%*:|"<>]/g, '_').slice(0, 150);
    if (suggestedName && originalFilename && originalFilename.includes('.')) {
      const ext = originalFilename.split('.').pop();
      if (ext && !suggestedName.toLowerCase().endsWith('.' + ext.toLowerCase())) {
        suggestedName = `${suggestedName}.${ext}`;
      }
    }

    // Maksimal 5 tag unik, format lowercase tanpa spasi
    const tags = [...new Set(rawTags.map(t => String(t).toLowerCase().trim().replace(/[\s-]+/g, '_')).filter(Boolean))].slice(0, 5);
    const description = String(parsed.description || '').slice(0, 500);

    if (!description && tags.length === 0) {
      // Fallback to heuristic
      return generateSmartFallback(originalFilename);
    }

    let suggestedFolder = String(parsed.suggestedFolder || parsed.project || '').trim().slice(0, 200);
    // Snap folder ke folder yang sudah ada jika ada kesamaan nama (case-insensitive)
    if (Array.isArray(existingFolders) && existingFolders.length > 0 && suggestedFolder) {
      const matched = existingFolders.find(f => f.toLowerCase() === suggestedFolder.toLowerCase());
      if (matched) suggestedFolder = matched;
    }

    return {
      description,
      category,
      topic:           String(parsed.topic || parsed.category || '').slice(0, 100),
      tags,
      project:         String(parsed.project || '').slice(0, 100),
      suggestedFolder,
      suggestedName:   suggestedName || ''
    };
  } catch {
    console.warn('[ARKA AI] Could not parse AI response as JSON:', String(raw).slice(0, 200));
    return generateSmartFallback(originalFilename);
  }
}

// ── Main analyze function ─────────────────────────────────────────────────────
/**
 * Analyze a file and return structured metadata.
 *
 * @param {string} filePath  - Absolute path to the physical file
 * @param {string} mimeType  - MIME type of the file
 * @param {string} filename  - Original filename
 * @param {{ existingFolders?: string[] }} [options]
 * @returns {Promise<{ok:boolean, provider:string, error?:string, description:string,
 *                    category:string, topic:string, tags:string[], project:string,
 *                    suggestedFolder:string, suggestedName:string, analyzedAt:string}>}
 */
export async function analyzeFile(filePath, mimeType, filename, { existingFolders = [] } = {}) {
  const preferred = selectProvider(mimeType, filename);
  const analyzedAt = new Date().toISOString();

  let raw = '';
  let usedProvider = preferred;
  let primaryError = null;

  try {
    const result = preferred === 'gemini'
      ? await analyzeWithGemini(filePath, mimeType, filename, existingFolders)
      : await analyzeWithGroq(filePath, mimeType, filename, '', existingFolders);
    raw = result.raw;
    usedProvider = result.provider;
  } catch (err) {
    primaryError = err;
    console.warn(`[ARKA AI] Primary provider (${preferred}) failed for "${filename}": ${describeAIError(err)}`);

    const fallbackProvider = preferred === 'gemini' ? 'groq' : 'gemini';
    try {
      const hint = `analisis langsung via ${preferred} tidak tersedia (${describeAIError(err)}).`;
      const result = fallbackProvider === 'gemini'
        ? await analyzeWithGeminiText(filePath, mimeType, filename, hint, existingFolders)
        : await analyzeWithGroq(filePath, mimeType, filename, hint, existingFolders);
      raw = result.raw;
      usedProvider = `${fallbackProvider}-fallback`;
    } catch (fallbackError) {
      console.warn(`[ARKA AI] Both providers failed for "${filename}", activating smart fallback: ${describeAIError(fallbackError)}`);
      const fallbackMeta = generateSmartFallback(filename, mimeType);
      return {
        ok: true,
        provider: 'smart-heuristic',
        ...fallbackMeta,
        analyzedAt
      };
    }
  }

  const metadata = parseAIResponse(raw, filename, existingFolders);
  console.log(`[ARKA AI] ✅ Analyzed "${filename}" via ${usedProvider}: folder [${metadata.suggestedFolder}], tags [${metadata.tags.join(', ')}]`);
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
          : { ok: false, provider: 'failed', error: result.reason?.message || 'Kesalahan analisis tidak diketahui' }
      });
    });
  }

  return results;
}

export default { analyzeFile, analyzeFiles };
