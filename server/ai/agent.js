/**
 * ARKA AI — Agent
 *
 * Handles natural language queries via POST /api/ai/ask
 *
 * Uses Groq (MODELS.groq.fast) for fast tool-call reasoning.
 * Read-only tools available to the model:
 *   - search_files        (name / description / tags / category, optional type filter)
 *   - search_prompts
 *   - list_inbox
 *   - get_workspace_stats
 *   - list_folders
 *   - get_usage_guide     (how to use ARKA web app — topics)
 *   - answer              (plain text response, terminates the loop)
 *
 * Supports both Supabase (Vercel/cloud) and SQLite (local dev).
 */

import { db } from '../database/db.js';
import { isSupabaseConfigured, getSupabaseClient } from '../config/supabase.js';
import { getGroq, getGemini, MODELS, describeAIError } from './providers.js';
import { getEnv } from '../config/env.js';
import { getFileTypeCategory } from '../utils/fileTypes.js';
import { likePattern } from '../utils/search.js';
import { getGuideText, guideTopicsText } from './usageGuide.js';

/**
 * Berapa banyak baris terbaru yang diambil dari Supabase sebelum difilter di JS.
 * Pencarian Supabase sengaja mengambil sejumlah baris terbaru lalu menyaring di
 * memori (bukan `.or()` PostgREST) agar perilakunya persis sama dengan query
 * SQLite dan aman terhadap karakter `%`, `_`, `,` pada input pengguna.
 */
const SEARCH_SCAN_LIMIT = 200;

// ── Tool Definitions ───────────────────────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Cari file berdasarkan nama, tag, atau deskripsi. Gunakan saat pengguna ingin menemukan file.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Kata kunci pencarian' },
          type:  { type: 'string', description: 'Filter tipe file: Image, Video, Audio, Document, Code, Archive, Other' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_prompts',
      description: 'Cari prompt tersimpan berdasarkan judul, isi, atau tag.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Kata kunci pencarian' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_inbox',
      description: 'Tampilkan semua file yang masih ada di Inbox dan belum dirapikan.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_workspace_stats',
      description: 'Ambil statistik workspace: jumlah file, pemakaian penyimpanan, jumlah folder.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_folders',
      description: 'Tampilkan semua folder di workspace.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_links',
      description: 'Cari tautan atau bookmark web yang tersimpan berdasarkan URL, judul, deskripsi, atau tag.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Kata kunci pencarian tautan' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_usage_guide',
      description: `Ambil dokumentasi resmi penggunaan ARKA untuk satu topik, agar kamu bisa menjelaskan cara memakai aplikasi web. Topik: ${guideTopicsText()} (biarkan kosong untuk ringkasan).`,
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: `Salah satu dari: ${guideTopicsText()} — atau kosong untuk ringkasan` }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_user_permission',
      description: 'Minta izin pengguna (Human-in-the-Loop) sebelum mengeksekusi perubahan seperti ganti nama file, pindah folder, hapus file atau hapus folder, buka pratinjau file, atau navigasi halaman. Cari file atau folder-nya terlebih dahulu dengan search_files atau list_folders untuk mendapatkan ID-nya, lalu panggil tool ini untuk memunculkan tombol konfirmasi kepada pengguna. KAMU WAJIB memanggil tool ini jika menjanjikan aksi.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Pesan penjelasan sopan kepada pengguna tentang aksi yang diajukan'
          },
          actions: {
            type: 'array',
            description: 'Daftar aksi yang butuh izin pengguna',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['rename_file', 'move_file', 'delete_file', 'delete_folder', 'open_preview', 'navigate'],
                  description: 'Tipe aksi'
                },
                label: {
                  type: 'string',
                  description: 'Label ringkas pada tombol aksi (contoh: "Ganti nama ke Proposal_2026.pdf")'
                },
                details: {
                  type: 'object',
                    file_id: { type: 'string', description: 'ID file target (dari [ID:xxx])' },
                    folder_id: { type: 'string', description: 'ID folder target (harus berupa ID dari [ID:xxx] hasil list_folders)' },
                    current_name: { type: 'string', description: 'Nama asli/murni file atau folder saat ini tanpa awalan kata perintah (contoh: "Cloud Projects")' },
                    new_name: { type: 'string', description: 'Nama baru file yang diusulkan (untuk rename_file)' },
                    target_folder_id: { type: 'string', description: 'ID atau nama folder tujuan (untuk move_file)' },
                    target_folder_name: { type: 'string', description: 'Nama folder tujuan yang akan ditampilkan' },
                    target: { type: 'string', description: 'Target navigasi (overview, files, images, prompts, links, trash)' },
                    reason: { type: 'string', description: 'Alasan perubahan' }
                  }
                }
              },
              required: ['type', 'label', 'details']
            }
          }
        },
        required: ['message', 'actions']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'answer',
      description: 'Jawab pengguna dengan teks biasa saat tidak perlu aksi tool.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Teks jawaban untuk pengguna' }
        },
        required: ['text']
      }
    }
  }
];

// ── Tool Implementations — Supabase + SQLite dual support ─────────────────────
/**
 * Terapkan pembatasan tenant yang sama seperti controller lain: baris milik user
 * saat ini PLUS data owner lama (user_id IS NULL) tetap terlihat. Tanpa ini agent
 * melaporkan workspace kosong untuk akun Google sementara UI web menampilkan datanya.
 */
function scopeToUser(query, userId) {
  return userId ? query.or(`user_id.eq.${userId},user_id.is.null`) : query;
}

async function executeTool(name, args, userId = null) {
  const useSupabase = isSupabaseConfigured();

  switch (name) {
    case 'search_files': {
      const q = String(args.query || '').trim();

      if (useSupabase) {
        const supabase = getSupabaseClient();
        let query = supabase
          .from('files')
          .select(`id, original_name, mime_type, size, is_inbox, created_at,
                   folders(name),
                   file_metadata(description, tags, category)`)
          .eq('is_trash', false);

        query = scopeToUser(query, userId);

        // Ambil baris terbaru dulu, lalu filter di JS supaya pencarian mencakup
        // nama + deskripsi AI + tags + kategori (sama seperti query SQLite) dan
        // tidak bergantung pada escaping `.or()` PostgREST yang rawan rusak.
        const { data: rows = [] } = await query
          .order('created_at', { ascending: false })
          .limit(SEARCH_SCAN_LIMIT);

        const filtered = rows
          .map(r => {
            const meta = Array.isArray(r.file_metadata) ? r.file_metadata[0] : r.file_metadata;
            return { r, meta };
          })
          .filter(({ r, meta }) => {
            const haystack = [r.original_name, meta?.description, meta?.category]
              .concat(Array.isArray(meta?.tags) ? meta.tags : [meta?.tags])
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            const matchesText = !q || haystack.includes(q.toLowerCase());
            const matchesType = !args.type ||
              getFileTypeCategory(r.mime_type, r.original_name).toLowerCase() === String(args.type).toLowerCase();
            return matchesText && matchesType;
          })
          .slice(0, 20);

        return { files: filtered.map(({ r, meta }) => ({
          id: r.id,
          original_name: r.original_name,
          mime_type: r.mime_type,
          size: r.size,
          is_inbox: r.is_inbox,
          folder_name: r.folders?.name || null,
          description: meta?.description || null,
          tags: meta?.tags || null,
          category: meta?.category || null
        })), count: filtered.length };
      }

      // SQLite fallback
      const pattern = likePattern(q);
      const rows = db.prepare(`
        SELECT f.id, f.original_name, f.mime_type, f.size, f.is_inbox, f.created_at,
               fl.name as folder_name,
               m.description, m.tags, m.category
        FROM files f
        LEFT JOIN folders fl ON f.folder_id = fl.id
        LEFT JOIN file_metadata m ON f.id = m.file_id
        WHERE f.is_trash = 0
          AND (f.original_name LIKE ? ESCAPE '\\'
            OR m.description LIKE ? ESCAPE '\\'
            OR m.tags LIKE ? ESCAPE '\\'
            OR m.category LIKE ? ESCAPE '\\')
        ORDER BY f.created_at DESC
        LIMIT 20
      `).all(pattern, pattern, pattern, pattern);

      const filtered = args.type
        ? rows.filter(r => getFileTypeCategory(r.mime_type, r.original_name).toLowerCase() === String(args.type).toLowerCase())
        : rows;

      return { files: filtered, count: filtered.length };
    }

    case 'search_prompts': {
      const q = String(args.query || '').trim();

      if (useSupabase) {
        const supabase = getSupabaseClient();
        let query = supabase.from('prompts').select('id, title, category, tags, content');
        query = scopeToUser(query, userId);
        const { data: rows = [] } = await query.order('created_at', { ascending: false }).limit(SEARCH_SCAN_LIMIT);

        // Saring di JS (judul + isi + kategori + tags) agar konsisten dengan SQLite
        // dan tidak lagi memakai `tags.cs.{...}` yang rapuh terhadap spasi/koma.
        const filtered = rows
          .filter(p => {
            const haystack = [p.title, p.content, p.category]
              .concat(Array.isArray(p.tags) ? p.tags : [p.tags])
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return !q || haystack.includes(q.toLowerCase());
          })
          .slice(0, 10);

        return { prompts: filtered, count: filtered.length };
      }

      const pattern = likePattern(q);
      const rows = db.prepare(`
        SELECT id, title, category, tags, content
        FROM prompts
        WHERE title LIKE ? ESCAPE '\\'
           OR content LIKE ? ESCAPE '\\'
           OR tags LIKE ? ESCAPE '\\'
        ORDER BY created_at DESC
        LIMIT 10
      `).all(pattern, pattern, pattern);
      return { prompts: rows, count: rows.length };
    }

    case 'search_links': {
      const q = String(args.query || '').trim();

      if (useSupabase) {
        const supabase = getSupabaseClient();
        let query = supabase.from('links').select('id, url, title, description, category, tags, domain');
        query = scopeToUser(query, userId);
        const { data: rows = [] } = await query.order('created_at', { ascending: false }).limit(SEARCH_SCAN_LIMIT);

        const filtered = rows
          .filter(l => {
            const haystack = [l.title, l.url, l.description, l.category, l.domain]
              .concat(Array.isArray(l.tags) ? l.tags : [l.tags])
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            return !q || haystack.includes(q.toLowerCase());
          })
          .slice(0, 10);

        return { links: filtered, count: filtered.length };
      }

      const pattern = likePattern(q);
      const rows = db.prepare(`
        SELECT id, url, title, description, category, tags, domain
        FROM links
        WHERE url LIKE ? ESCAPE '\\'
           OR title LIKE ? ESCAPE '\\'
           OR description LIKE ? ESCAPE '\\'
           OR tags LIKE ? ESCAPE '\\'
           OR domain LIKE ? ESCAPE '\\'
        ORDER BY created_at DESC
        LIMIT 10
      `).all(pattern, pattern, pattern, pattern, pattern);
      return { links: rows, count: rows.length };
    }

    case 'list_inbox': {
      if (useSupabase) {
        const supabase = getSupabaseClient();
        let query = supabase
          .from('files')
          .select(`id, original_name, mime_type, size, created_at,
                   file_metadata(description, tags, category)`)
          .eq('is_inbox', true)
          .eq('is_trash', false);
        query = scopeToUser(query, userId);
        const { data: rows = [] } = await query.order('created_at', { ascending: false });
        return { files: rows.map(r => ({
          id: r.id,
          original_name: r.original_name,
          mime_type: r.mime_type,
          size: r.size,
          description: r.file_metadata?.description || null,
          tags: r.file_metadata?.tags || null,
          category: r.file_metadata?.category || null
        })), count: rows.length };
      }

      const rows = db.prepare(`
        SELECT f.id, f.original_name, f.mime_type, f.size, f.created_at,
               m.description, m.tags, m.category
        FROM files f
        LEFT JOIN file_metadata m ON f.id = m.file_id
        WHERE f.is_inbox = 1 AND f.is_trash = 0
        ORDER BY f.created_at DESC
      `).all();
      return { files: rows, count: rows.length };
    }

    case 'get_workspace_stats': {
      if (useSupabase) {
        const supabase = getSupabaseClient();
        let fQuery = supabase.from('files').select('id, size', { count: 'exact' }).eq('is_trash', false);
        let inboxQ = supabase.from('files').select('id', { count: 'exact' }).eq('is_inbox', true).eq('is_trash', false);
        let folderQ = supabase.from('folders').select('id', { count: 'exact' });
        let promptQ = supabase.from('prompts').select('id', { count: 'exact' });
        fQuery = scopeToUser(fQuery, userId);
        inboxQ = scopeToUser(inboxQ, userId);
        folderQ = scopeToUser(folderQ, userId);
        promptQ = scopeToUser(promptQ, userId);
        const [{ data: files = [], count: fileCount }, { count: inboxCount }, { count: folderCount }, { count: promptCount }]
          = await Promise.all([fQuery, inboxQ, folderQ, promptQ]);
        const totalBytes = (files || []).reduce((s, f) => s + (f.size || 0), 0);
        return { totalFiles: fileCount || 0, totalBytes, inboxFiles: inboxCount || 0, folders: folderCount || 0, prompts: promptCount || 0 };
      }

      const total = db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(size),0) as b FROM files WHERE is_trash = 0').get();
      const inbox = db.prepare('SELECT COUNT(*) as c FROM files WHERE is_inbox = 1 AND is_trash = 0').get();
      const folders = db.prepare('SELECT COUNT(*) as c FROM folders').get();
      const prompts = db.prepare('SELECT COUNT(*) as c FROM prompts').get();
      return { totalFiles: total.c, totalBytes: total.b, inboxFiles: inbox.c, folders: folders.c, prompts: prompts.c };
    }

    case 'list_folders': {
      if (useSupabase) {
        const supabase = getSupabaseClient();
        let query = supabase.from('folders').select('id, name, parent_id');
        let filesQuery = supabase.from('files').select('folder_id').eq('is_trash', false);
        query = scopeToUser(query, userId);
        filesQuery = scopeToUser(filesQuery, userId);

        const [{ data: rows = [] }, { data: files = [] }] = await Promise.all([
          query.order('name'),
          filesQuery
        ]);

        // Hitung jumlah file per folder (dulu di-hardcode 0 → info folder salah)
        const countMap = {};
        for (const f of (files || [])) {
          if (f.folder_id) countMap[f.folder_id] = (countMap[f.folder_id] || 0) + 1;
        }

        // Build parent name map
        const nameMap = Object.fromEntries((rows || []).map(r => [r.id, r.name]));
        return { folders: (rows || []).map(r => ({
          id: r.id, name: r.name, parent_id: r.parent_id,
          parent_name: r.parent_id ? nameMap[r.parent_id] || null : null,
          file_count: countMap[r.id] || 0
        })), count: rows.length };
      }

      const rows = db.prepare(`
        SELECT f.id, f.name, f.parent_id, p.name as parent_name,
               COUNT(fi.id) as file_count
        FROM folders f
        LEFT JOIN folders p ON f.parent_id = p.id
        LEFT JOIN files fi ON fi.folder_id = f.id AND fi.is_trash = 0
        GROUP BY f.id
        ORDER BY f.parent_id IS NULL DESC, f.name
      `).all();
      return { folders: rows, count: rows.length };
    }

    case 'get_usage_guide': {
      return { topic: String(args.topic || 'overview'), guide: getGuideText(args.topic) };
    }

    case 'request_user_permission': {
      return {
        status: 'pending_user_approval',
        message: args.message || 'Permintaan izin aksi workspace',
        actions: Array.isArray(args.actions) ? args.actions : []
      };
    }

    case 'answer': {
      return { text: args.text };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Format tool result for LLM context ───────────────────────────────────────
function formatToolResult(name, result) {
  if (name === 'search_files') {
    if (result.count === 0) return 'Tidak ada file yang cocok.';
    return result.files.map(f =>
      `[ID:${f.id}] ${f.original_name} (${f.folder_name || 'Inbox/Root'}) - ${f.description || f.tags || ''}`
    ).join('\n');
  }
  if (name === 'search_prompts') {
    if (result.count === 0) return 'Tidak ada prompt yang cocok.';
    return result.prompts.map(p =>
      `[Prompt ${p.id}] "${p.title}" [${p.category}] - ${Array.isArray(p.tags) ? p.tags.join(',') : (p.tags || '')}`
    ).join('\n');
  }
  if (name === 'list_inbox') {
    if (result.count === 0) return 'Inbox kosong.';
    return `${result.count} file di inbox:\n` + result.files.map(f =>
      `[ID:${f.id}] ${f.original_name} - ${f.category || 'Tanpa kategori'}`
    ).join('\n');
  }
  if (name === 'get_workspace_stats') {
    const mb = ((result.totalBytes || 0) / 1024 / 1024).toFixed(1);
    return `${result.totalFiles} file (${mb} MB), ${result.inboxFiles} di inbox, ${result.folders} folder, ${result.prompts} prompt.`;
  }
  if (name === 'list_folders') {
    if (result.count === 0) return 'Belum ada folder.';
    return result.folders.map(f =>
      `[ID:${f.id}] ${f.parent_name ? f.parent_name + '/' : ''}${f.name} (${f.file_count} file)`
    ).join('\n');
  }
  if (name === 'request_user_permission') {
    return 'Permintaan izin aksi telah diajukan ke antarmuka pengguna dalam bentuk kartu persetujuan interaktif. Berikan penjelasan ramah kepada pengguna tentang apa yang kamu usulkan dan minta mereka menekan tombol Izinkan pada kartu tersebut.';
  }
  return JSON.stringify(result);
}

// ── Main Agent Run ──────────────────────────────────────────────────────────
const AGENT_MAX_TOKENS = Number(getEnv('ARKA_AGENT_MAX_TOKENS')) || 2400;

function looksCut(text = '') {
  const t = String(text).trim();
  if (t.length < 60) return false;
  return /[,;:]\s*$|[-–—([{]\s*$/.test(t);
}

// ── Short-term conversation memory ─────────────────────────────────────────
const MEMORY_TTL_MS       = 10 * 60 * 1000;
const MEMORY_MAX_MESSAGES = 8;

let userMemories = new Map();

export function resetAgentMemory(userId = 'guest') {
  userMemories.delete(userId);
}

function takeMemory(userId = 'guest') {
  const mem = userMemories.get(userId);
  if (!mem) return [];
  if (Date.now() - mem.stamp > MEMORY_TTL_MS) {
    userMemories.delete(userId);
    return [];
  }
  mem.stamp = Date.now();
  return mem.messages.slice();
}

function remember(userId = 'guest', question, answer) {
  let mem = userMemories.get(userId);
  if (!mem) {
    mem = { messages: [], stamp: Date.now() };
    userMemories.set(userId, mem);
  }
  mem.messages.push({ role: 'user',      content: String(question).slice(0, 800) });
  mem.messages.push({ role: 'assistant', content: String(answer).slice(0, 1200) });
  if (mem.messages.length > MEMORY_MAX_MESSAGES) mem.messages = mem.messages.slice(-MEMORY_MAX_MESSAGES);
  mem.stamp = Date.now();
}

async function askForFinalText(messages) {
  try {
    const groq = getGroq();
    const res  = await groq.chat.completions.create({
      model: MODELS.groq.fast,
      messages: [
        ...messages,
        { role: 'user', content: 'Jawab permintaan pengguna tadi sekarang sebagai teks biasa (jangan panggil tool). Gunakan bahasa Indonesia, maksimal 120 kata, kalimat penutup harus lengkap.' }
      ],
      max_tokens:  900,
      temperature: 0.3
    });
    const choice = res.choices?.[0];
    const text   = choice?.message?.content?.trim();
    if (!text) return null;
    return { answer: text, truncated: choice?.finish_reason === 'length' || looksCut(text) };
  } catch (err) {
    console.error('[ARKA AI] /ask final pass failed with Groq, trying Gemini:', describeAIError(err));
    try {
      const gemini = getGemini();
      const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';
      const geminiRes = await gemini.models.generateContent({
        model: MODELS.gemini.flash,
        contents: [
          {
            role: 'user',
            parts: [{ text: `Permintaan: ${lastUser}\n\nJawab sekarang sebagai teks biasa secara ringkas dalam bahasa Indonesia (maksimal 120 kata, kalimat penutup harus lengkap).` }]
          }
        ]
      });
      const text = geminiRes.text || geminiRes.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { answer: text.trim(), truncated: false };
    } catch (geminiErr) {
      console.error('[ARKA AI] Gemini final pass fallback also failed:', describeAIError(geminiErr));
    }
    return null;
  }
}

/**
 * Run the agent and remember the exchange.
 *
 * @param {string} userQuery
 * @param {{ reset?: boolean, userId?: string }} [options]
 */
export async function runAgent(userQuery, { reset = false, userId = null } = {}) {
  const memUserId = userId || 'guest';
  if (reset) resetAgentMemory(memUserId);
  const result = await runOnce(userQuery, userId);
  if (!result.error && result.answer) remember(memUserId, userQuery, result.answer);
  return result;
}

async function runOnce(userQuery, userId = null) {
  const memUserId = userId || 'guest';
  const systemPrompt = `Kamu adalah ARKA, asisten workspace pribadi berbasis AI untuk aplikasi web ARKA (arkaapp.vercel.app). Kamu membantu pengguna mengelola file, prompt, tautan, dan workspace lewat UI web.

Tool yang tersedia memungkinkanmu mencari file, mencari prompt, melihat daftar inbox, memeriksa statistik workspace, melihat daftar folder, dan membaca panduan penggunaan ARKA.

Aturan:
- SELALU gunakan bahasa Indonesia dalam setiap jawaban, apa pun bahasa yang dipakai pengguna.
- Selalu pakai tool saat pengguna bertanya tentang file, prompt, atau data workspace.
- Setelah mendapat hasil tool, beri jawaban yang ramah dan ringkas.
- Jika ragu, gunakan tool 'answer' untuk menjawab langsung.
- Jawaban harus SINGKAT dan LENGKAP: maksimal ~100 kata / 6 baris poin, selalu akhiri dengan kalimat yang utuh — jangan terputus.
- Percakapan sebelumnya disertakan. Jika pesan adalah lanjutan ("yang lebih detail", "yg kedua"), lanjutkan topik itu.
- JANGAN pernah mengarang fitur, URL, atau opsi yang tidak ada. Sebutkan hanya yang ada di panduan atau hasil tool.
- KONTROL WORKSPACE & PERIZINAN AKSI (Human-in-the-Loop):
  Jika pengguna meminta kamu melakukan perubahan atau kontrol workspace (seperti mengganti nama file, memindahkan file ke folder, menghapus file atau folder, membuka pratinjau file, atau berpindah navigasi):
  1. Cari dulu data file atau folder terkait menggunakan tool (search_files, list_folders) untuk mendapatkan ID-nya.
  2. Gunakan ID yang tertera di [ID:xxx] secara persis untuk parameter file_id atau folder_id.
  3. Untuk current_name dan label, gunakan HANYA nama bersih file/folder tanpa menambahkan kata perintah "Hapus" atau tanda petik (contoh: "Cloud Projects", bukan "Hapus Cloud Projects").
  4. KAMU WAJIB MEMANGGIL tool 'request_user_permission' untuk mengajukan proposal aksi. JANGAN HANYA MENULIS TEKS menyuruh pengguna menekan tombol. Jika kamu tidak memanggil tool-nya, tombolnya tidak akan pernah muncul!
  5. Setelah memanggil tool tersebut, baru kamu boleh memberikan teks jawaban singkat.
  JANGAN menolak dengan mengatakan kamu tidak bisa atau read-only jika aksi tersebut dapat diajukan via 'request_user_permission'!
- Untuk permintaan perapian/triage, pakai list_inbox dulu lalu sarankan langkah di dashboard web.`;

  const messages = [
    { role: 'system',  content: systemPrompt },
    ...takeMemory(memUserId),
    { role: 'user',    content: userQuery }
  ];

  let toolCalled = null;
  let toolResult = null;
  let pendingPermission = null;
  let steps = 0;
  const MAX_STEPS = 3;

  while (steps < MAX_STEPS) {
    steps++;

    const groq = getGroq();
    let response;
    try {
      response = await groq.chat.completions.create({
        model:       MODELS.groq.fast,
        messages,
        tools:       TOOLS,
        tool_choice: 'auto',
        max_tokens:  AGENT_MAX_TOKENS,
        temperature: 0.2
      });
    } catch (err) {
      console.warn('[ARKA AI] /ask Groq error, attempting Gemini fallback:', describeAIError(err));
      try {
        const gemini = getGemini();
        const geminiRes = await gemini.models.generateContent({
          model: MODELS.gemini.flash,
          contents: [
            {
              role: 'user',
              parts: [{
                text: `${systemPrompt}\n\nPertanyaan pengguna: ${userQuery}\n\nJawab dalam bahasa Indonesia, ramah, padat, ringkas, dan jelas.`
              }]
            }
          ]
        });
        const ans = geminiRes.text || geminiRes.candidates?.[0]?.content?.parts?.[0]?.text;
        if (ans) {
          return {
            answer: ans.trim(),
            toolCalled: 'gemini_fallback',
            toolResult: null,
            steps,
            proposedActions: null,
            permissionMessage: null
          };
        }
      } catch (geminiErr) {
        console.error('[ARKA AI] Gemini fallback also failed:', describeAIError(geminiErr));
      }
      return {
        answer: `Maaf, layanan AI sedang bermasalah (${describeAIError(err)}). Coba lagi sebentar.`,
        toolCalled: null,
        toolResult: null,
        steps,
        error: describeAIError(err),
        proposedActions: null,
        permissionMessage: null
      };
    }

    const choice = response.choices?.[0];
    const msg = choice?.message;
    const truncated = choice?.finish_reason === 'length';

    if (!msg) break;

    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const calls = msg.tool_calls.slice(0, 4);
      const answers = [];
      let brokenArgs = false;  // hoisted — used in answers check below

      messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });

      for (const call of calls) {
        const name = call.function?.name;
        let args = {};
        let callBroken = false;
        try {
          args = JSON.parse(call.function?.arguments || '{}') || {};
        } catch {
          args = {};
          callBroken = true;
          brokenArgs = true;
        }

        toolCalled = name;
        try {
          toolResult = await executeTool(name, args, userId);
        } catch (toolErr) {
          toolResult = { error: toolErr.message };
        }

        if (name === 'request_user_permission' && toolResult?.status === 'pending_user_approval') {
          pendingPermission = {
            message: toolResult.message,
            actions: toolResult.actions
          };
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: name !== 'answer'
            ? formatToolResult(name, toolResult)
            : (toolResult?.text && !callBroken
                ? 'Jawaban sudah disampaikan ke pengguna.'
                : 'Teks jawaban kosong atau terpotong — tulis ulang jawabannya sebagai teks biasa secara singkat.')
        });

        if (name === 'answer' && toolResult?.text && !callBroken) answers.push(toolResult.text);
      }

      for (const skipped of msg.tool_calls.slice(4)) {
        messages.push({ role: 'tool', tool_call_id: skipped.id, content: 'Dilewati: terlalu banyak pemanggilan tool dalam satu giliran.' });
      }

      if (answers.length) {
        return {
          answer:            answers[0],
          toolCalled:        'answer',
          toolResult,
          steps,
          truncated:         truncated || brokenArgs || looksCut(answers[0]),
          proposedActions:   pendingPermission?.actions || null,
          permissionMessage: pendingPermission?.message || null
        };
      }

      continue;
    }

    if (msg.content) {
      return {
        answer:            msg.content,
        toolCalled,
        toolResult,
        steps,
        truncated:         truncated || looksCut(msg.content),
        proposedActions:   pendingPermission?.actions || null,
        permissionMessage: pendingPermission?.message || null
      };
    }

    break;
  }

  const forced = await askForFinalText(messages);
  if (forced) {
    return {
      answer:            forced.answer,
      toolCalled,
      toolResult,
      steps,
      truncated:         forced.truncated,
      proposedActions:   pendingPermission?.actions || null,
      permissionMessage: pendingPermission?.message || null
    };
  }

  return {
    answer:            'Aku belum bisa menjawab itu. Coba tulis pertanyaannya lebih lengkap.',
    toolCalled,
    toolResult:        null,
    steps,
    proposedActions:   pendingPermission?.actions || null,
    permissionMessage: pendingPermission?.message || null
  };
}

export default { runAgent, resetAgentMemory };
