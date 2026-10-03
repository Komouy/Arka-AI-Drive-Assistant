/**
 * ARKA AI — Document Content Extractor & Smart RAG Windowing
 *
 * Supported formats:
 *   - PDF (.pdf) via pdf-parse v2 (PDFParse)
 *   - Word (.docx) via mammoth
 *   - Plain text / Markdown (.txt, .md, .rtf, .log)
 *   - Data / Spreadsheets (.csv, .tsv, .json)
 *   - Code files (.js, .ts, .py, .html, .css, .sql, .sh, .yml, .yaml, .xml, etc.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { extOf } from '../utils/fileTypes.js';

/** Maximum character length returned to AI model by default */
export const DEFAULT_MAX_EXTRACT_CHARS = 8000;

/** Quick preview length used during auto-categorization analysis */
export const DEFAULT_PREVIEW_CHARS = 2500;

// ── Text Cleaning ────────────────────────────────────────────────────────────
function cleanExtractedText(text = '') {
  if (!text || typeof text !== 'string') return '';
  return text
    // Remove null bytes and odd control chars but keep newlines/tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize Windows CRLF to LF
    .replace(/\r\n/g, '\n')
    // Remove excessive consecutive blank lines (more than 2)
    .replace(/\n{3,}/g, '\n\n')
    // Remove artifact footer lines like "-- 1 of 5 --" from pdf-parse
    .replace(/\n*--\s*\d+\s+of\s+\d+\s*--\n*/gi, '\n')
    .trim();
}

// ── PDF Extractor ────────────────────────────────────────────────────────────
async function extractPdf(buffer) {
  let parser = null;
  try {
    const { PDFParse } = await import('pdf-parse');
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = cleanExtractedText(result?.text || '');
    const totalPages = Number(result?.total || 1);
    return {
      text,
      totalPages,
      charCount: text.length
    };
  } catch (err) {
    console.warn('[DocExtractor] PDF extraction error:', err.message);
    return {
      text: '',
      totalPages: 0,
      charCount: 0,
      error: `Gagal mengekstrak teks PDF: ${err.message}`
    };
  } finally {
    if (parser && typeof parser.destroy === 'function') {
      try { await parser.destroy(); } catch {}
    }
  }
}

// ── DOCX Extractor ───────────────────────────────────────────────────────────
async function extractDocx(buffer) {
  try {
    const mammothModule = await import('mammoth');
    const mammoth = mammothModule.default || mammothModule;
    const result = await mammoth.extractRawText({ buffer });
    const text = cleanExtractedText(result?.value || '');
    return {
      text,
      totalPages: 1,
      charCount: text.length
    };
  } catch (err) {
    console.warn('[DocExtractor] DOCX extraction error:', err.message);
    return {
      text: '',
      totalPages: 0,
      charCount: 0,
      error: `Gagal mengekstrak dokumen Word: ${err.message}`
    };
  }
}

// ── Plain Text / Code / CSV Extractor ────────────────────────────────────────
function extractPlainText(buffer) {
  try {
    // Detect binary null bytes in initial sample
    const sampleSize = Math.min(buffer.length, 512);
    for (let i = 0; i < sampleSize; i++) {
      if (buffer[i] === 0) {
        return { text: '', totalPages: 1, charCount: 0, error: 'File biner tidak didukung sebagai teks' };
      }
    }
    const text = cleanExtractedText(buffer.toString('utf-8'));
    return { text, totalPages: 1, charCount: text.length };
  } catch (err) {
    return { text: '', totalPages: 1, charCount: 0, error: err.message };
  }
}

// ── Smart Excerpt / RAG Windowing ────────────────────────────────────────────
/**
 * If the document text exceeds `maxLength`, intelligently select the most
 * relevant portions based on keyword matching with `query`, while retaining
 * the opening header/introduction.
 */
function windowTextByRelevance(fullText, query = '', maxLength = DEFAULT_MAX_EXTRACT_CHARS) {
  if (!fullText || fullText.length <= maxLength) {
    return { text: fullText, truncated: false };
  }

  const cleanQuery = String(query || '').trim().toLowerCase();
  const queryTokens = cleanQuery
    .split(/\s+/)
    .map(t => t.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(t => t.length > 2);

  // If no query tokens, return the first `maxLength` characters with notice
  if (queryTokens.length === 0) {
    return {
      text: fullText.slice(0, maxLength) + '\n\n... [Sisa isi dokumen dipotong karena batas panjang teks]',
      truncated: true
    };
  }

  // Split into paragraphs / sections
  const paragraphs = fullText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length <= 1) {
    return {
      text: fullText.slice(0, maxLength) + '\n\n... [Dipilih bagian awal dokumen]',
      truncated: true
    };
  }

  // Reserve ~20% of max length for intro/header
  const introBudget = Math.floor(maxLength * 0.25);
  let introText = '';
  let introChars = 0;
  const remainingParagraphs = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (i < 2 && (introChars + p.length + 2) <= introBudget) {
      introText += (introText ? '\n\n' : '') + p;
      introChars += p.length + 2;
    } else {
      remainingParagraphs.push(p);
    }
  }

  // Score remaining paragraphs based on token hits
  const scored = remainingParagraphs.map(p => {
    const pLower = p.toLowerCase();
    let score = 0;
    for (const token of queryTokens) {
      if (pLower.includes(token)) score += 1;
    }
    return { paragraph: p, score };
  });

  // Sort by score descending, then retain original document flow
  scored.sort((a, b) => b.score - a.score);

  const selected = [];
  let currentLength = introChars;

  for (const item of scored) {
    if (item.score > 0 && (currentLength + item.paragraph.length + 6) <= maxLength) {
      selected.push(item.paragraph);
      currentLength += item.paragraph.length + 6;
    }
  }

  // If few hits, fill remainder with sequential paragraphs
  if (currentLength < maxLength) {
    for (const p of remainingParagraphs) {
      if (!selected.includes(p) && (currentLength + p.length + 6) <= maxLength) {
        selected.push(p);
        currentLength += p.length + 6;
      }
    }
  }

  let combined = introText;
  if (selected.length > 0) {
    combined += '\n\n--- [BAGIAN RELEVAN BERDASARKAN PERTANYAAN] ---\n' + selected.join('\n\n...\n\n');
  }
  combined += '\n\n... [Sebagian isi dokumen disaring agar sesuai konteks pertanyaan]';

  return { text: combined, truncated: true };
}

// ── Main Extractor Function ──────────────────────────────────────────────────
/**
 * Extract text from a document buffer or file path.
 *
 * @param {object} params
 * @param {Buffer} [params.buffer]
 * @param {string} [params.filePath]
 * @param {string} [params.mimeType]
 * @param {string} [params.filename]
 * @param {number} [params.maxLength]
 * @param {string} [params.query]
 * @returns {Promise<{
 *   ok: boolean,
 *   type: string,
 *   text: string,
 *   rawLength: number,
 *   totalPages: number,
 *   truncated: boolean,
 *   error?: string
 * }>}
 */
export async function extractDocumentContent({
  buffer = null,
  filePath = null,
  mimeType = '',
  filename = '',
  maxLength = DEFAULT_MAX_EXTRACT_CHARS,
  query = ''
} = {}) {
  let fileBuffer = buffer;

  if (!fileBuffer && filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fileBuffer = fs.readFileSync(filePath);
      }
    } catch (err) {
      return {
        ok: false,
        type: 'error',
        text: '',
        rawLength: 0,
        totalPages: 0,
        truncated: false,
        error: `Gagal membaca berkas fisik: ${err.message}`
      };
    }
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    return {
      ok: false,
      type: 'empty',
      text: '',
      rawLength: 0,
      totalPages: 0,
      truncated: false,
      error: 'Berkas kosong atau data tidak tersedia'
    };
  }

  const ext = extOf(filename).toLowerCase();
  const mime = String(mimeType || '').toLowerCase();

  let extractRes;
  let detectedType = 'text';

  if (ext === '.pdf' || mime.includes('pdf')) {
    detectedType = 'pdf';
    extractRes = await extractPdf(fileBuffer);
  } else if (ext === '.docx' || mime.includes('wordprocessingml')) {
    detectedType = 'docx';
    extractRes = await extractDocx(fileBuffer);
  } else {
    // Plain text, Markdown, CSV, JSON, code files
    detectedType = ext === '.csv' ? 'spreadsheet' : 'text';
    extractRes = extractPlainText(fileBuffer);
  }

  if (extractRes.error && !extractRes.text) {
    return {
      ok: false,
      type: detectedType,
      text: '',
      rawLength: 0,
      totalPages: extractRes.totalPages || 0,
      truncated: false,
      error: extractRes.error
    };
  }

  const rawText = extractRes.text || '';
  const { text: windowedText, truncated } = windowTextByRelevance(rawText, query, maxLength);

  return {
    ok: true,
    type: detectedType,
    text: windowedText,
    rawLength: rawText.length,
    totalPages: extractRes.totalPages || 1,
    truncated
  };
}

/**
 * Fast preview extraction for automatic AI categorization.
 * Extracts the initial ~2500 characters of a document so the analyzer has
 * authentic text from PDF, DOCX, and text files.
 */
export async function getFastDocumentPreview(filePath, mimeType = '', filename = '', maxChars = DEFAULT_PREVIEW_CHARS) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return '';
    const res = await extractDocumentContent({
      filePath,
      mimeType,
      filename,
      maxLength: maxChars
    });
    return res.ok ? res.text : '';
  } catch {
    return '';
  }
}

export default {
  extractDocumentContent,
  getFastDocumentPreview,
  DEFAULT_MAX_EXTRACT_CHARS,
  DEFAULT_PREVIEW_CHARS
};
