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
import { getGroq, MODELS, describeAIError } from './providers.js';
import { getEnv } from '../config/env.js';
import { getFileTypeCategory } from '../utils/fileTypes.js';
import { getGuideText, guideTopicsText } from './usageGuide.js';

/** Escape SQL LIKE wildcards */
function likePattern(query = '') {
  const escaped = String(query).replace(/[\\%_]/g, ch => `\\${ch}`);
  return `%${escaped}%`;
}

// ── Tool Definitions ───────────────────────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for files by name, tags, or description. Use this when the user wants to find files.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query keyword' },
          type:  { type: 'string', description: 'File type filter: Image, Video, Audio, Document, Code, Prompt, Other' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_prompts',
      description: 'Search for saved prompts by title, content or tags.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_inbox',
      description: 'List all files currently in the Inbox awaiting organization.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_workspace_stats',
      description: 'Get workspace statistics: file count, storage usage, folder count.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_folders',
      description: 'List all folders in the workspace.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_usage_guide',
      description: `Get the official ARKA usage documentation for one topic, so you can tell the user how to use the web app. Topics: ${guideTopicsText()} (leave empty for an overview).`,
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: `One of: ${guideTopicsText()} — or empty for the overview` }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'answer',
      description: 'Respond to the user with a text answer when no tool action is needed.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The response text to the user' }
        },
        required: ['text']
      }
    }
  }
];

// ── Tool Implementations — Supabase + SQLite dual support ─────────────────────
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

        if (userId) query = query.eq('user_id', userId);

        const s = q.replace(/[%_]/g, c => `\\${c}`);
        query = query.or(`original_name.ilike.%${s}%`);

        const { data: rows = [] } = await query.order('created_at', { ascending: false }).limit(20);

        const filtered = args.type
          ? rows.filter(r => getFileTypeCategory(r.mime_type, r.original_name).toLowerCase() === String(args.type).toLowerCase())
          : rows;

        return { files: filtered.map(r => ({
          id: r.id,
          original_name: r.original_name,
          mime_type: r.mime_type,
          size: r.size,
          is_inbox: r.is_inbox,
          folder_name: r.folders?.name || null,
          description: r.file_metadata?.description || null,
          tags: r.file_metadata?.tags || null,
          category: r.file_metadata?.category || null
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
        const s = q.replace(/[%_]/g, c => `\\${c}`);
        let query = supabase.from('prompts').select('id, title, category, tags, content');
        if (userId) query = query.eq('user_id', userId);
        query = query.or(`title.ilike.%${s}%,content.ilike.%${s}%,tags.cs.{${q}}`);
        const { data: rows = [] } = await query.order('created_at', { ascending: false }).limit(10);
        return { prompts: rows, count: rows.length };
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

    case 'list_inbox': {
      if (useSupabase) {
        const supabase = getSupabaseClient();
        let query = supabase
          .from('files')
          .select(`id, original_name, mime_type, size, created_at,
                   file_metadata(description, tags, category)`)
          .eq('is_inbox', true)
          .eq('is_trash', false);
        if (userId) query = query.eq('user_id', userId);
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
        if (userId) {
          fQuery = fQuery.eq('user_id', userId);
          inboxQ = inboxQ.eq('user_id', userId);
          folderQ = folderQ.eq('user_id', userId);
          promptQ = promptQ.eq('user_id', userId);
        }
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
        if (userId) query = query.eq('user_id', userId);
        const { data: rows = [] } = await query.order('name');
        // Build parent name map
        const nameMap = Object.fromEntries((rows || []).map(r => [r.id, r.name]));
        return { folders: (rows || []).map(r => ({
          id: r.id, name: r.name, parent_id: r.parent_id,
          parent_name: r.parent_id ? nameMap[r.parent_id] || null : null,
          file_count: 0
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
    if (result.count === 0) return 'No matching files found.';
    return result.files.map(f =>
      `[ID:${f.id}] ${f.original_name} (${f.folder_name || 'Inbox/Root'}) - ${f.description || f.tags || ''}`
    ).join('\n');
  }
  if (name === 'search_prompts') {
    if (result.count === 0) return 'No matching prompts found.';
    return result.prompts.map(p =>
      `[Prompt ${p.id}] "${p.title}" [${p.category}] - ${Array.isArray(p.tags) ? p.tags.join(',') : (p.tags || '')}`
    ).join('\n');
  }
  if (name === 'list_inbox') {
    if (result.count === 0) return 'Inbox is empty.';
    return `${result.count} files in inbox:\n` + result.files.map(f =>
      `[ID:${f.id}] ${f.original_name} - ${f.category || 'Uncategorized'}`
    ).join('\n');
  }
  if (name === 'get_workspace_stats') {
    const mb = ((result.totalBytes || 0) / 1024 / 1024).toFixed(1);
    return `${result.totalFiles} files (${mb} MB), ${result.inboxFiles} in inbox, ${result.folders} folders, ${result.prompts} prompts.`;
  }
  if (name === 'list_folders') {
    return result.folders.map(f =>
      `${f.parent_name ? f.parent_name + '/' : ''}${f.name} (${f.file_count} files)`
    ).join('\n');
  }
  if (name === 'get_usage_guide') {
    return result.guide || 'No guide available for that topic.';
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

let memory      = [];
let memoryStamp = 0;

export function resetAgentMemory() {
  memory      = [];
  memoryStamp = Date.now();
}

function takeMemory() {
  if (Date.now() - memoryStamp > MEMORY_TTL_MS) memory = [];
  memoryStamp = Date.now();
  return memory.slice();
}

function remember(question, answer) {
  memory.push({ role: 'user',      content: String(question).slice(0, 800) });
  memory.push({ role: 'assistant', content: String(answer).slice(0, 1200) });
  if (memory.length > MEMORY_MAX_MESSAGES) memory = memory.slice(-MEMORY_MAX_MESSAGES);
  memoryStamp = Date.now();
}

async function askForFinalText(messages) {
  try {
    const groq = getGroq();
    const res  = await groq.chat.completions.create({
      model: MODELS.groq.fast,
      messages: [
        ...messages,
        { role: 'user', content: 'Jawab permintaan user tadi sekarang sebagai teks biasa (jangan panggil tool). Bahasa mengikuti user, maksimal 120 kata, kalimat penutup harus lengkap.' }
      ],
      max_tokens:  900,
      temperature: 0.3
    });
    const choice = res.choices?.[0];
    const text   = choice?.message?.content?.trim();
    if (!text) return null;
    return { answer: text, truncated: choice?.finish_reason === 'length' || looksCut(text) };
  } catch (err) {
    console.error('[ARKA AI] /ask final pass failed:', describeAIError(err));
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
  if (reset) resetAgentMemory();
  const result = await runOnce(userQuery, userId);
  if (!result.error && result.answer) remember(userQuery, result.answer);
  return result;
}

async function runOnce(userQuery, userId = null) {
  const systemPrompt = `You are ARKA, a personal AI workspace assistant for the ARKA web app (arkaapp.vercel.app). You help users manage their files, prompts, links, and workspace via the web UI.

Available tools let you search files, search prompts, list the inbox, check workspace stats, list folders, and read the ARKA usage guide.

Rules:
- Always use a tool when the user asks about files, prompts, or workspace data.
- After getting tool results, give a friendly, concise response.
- If unsure what to do, use the 'answer' tool to respond directly.
- Always respond in the same language the user used (Indonesian/English).
- Keep answers SHORT and COMPLETE: max ~100 words / 6 bullet lines, always end with a finished sentence — never trail off.
- Earlier turns of this chat are included. If the message is a follow-up ("yang lebih detail", "yg kedua"), continue that topic.
- NEVER invent features, URLs, or options that don't exist. Only mention what's in the usage guide or tool results.
- You are read-only: you cannot move, rename, delete, or upload files. Tell users to use the web UI for those actions.
- For organize/triage requests, use list_inbox first then suggest what the user can do in the web dashboard.`;

  const messages = [
    { role: 'system',  content: systemPrompt },
    ...takeMemory(),
    { role: 'user',    content: userQuery }
  ];

  let toolCalled = null;
  let toolResult = null;
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
      console.error('[ARKA AI] /ask provider error:', describeAIError(err));
      return {
        answer: `Maaf, layanan AI sedang bermasalah (${describeAIError(err)}). Coba lagi sebentar.`,
        toolCalled: null,
        toolResult: null,
        steps,
        error: describeAIError(err)
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

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: name !== 'answer'
            ? formatToolResult(name, toolResult)
            : (toolResult?.text && !callBroken
                ? 'Answer delivered to the user.'
                : 'The answer text was empty or truncated — write the answer again as plain text, briefly.')
        });

        if (name === 'answer' && toolResult?.text && !callBroken) answers.push(toolResult.text);
      }

      for (const skipped of msg.tool_calls.slice(4)) {
        messages.push({ role: 'tool', tool_call_id: skipped.id, content: 'Skipped: too many tool calls in one turn.' });
      }

      if (answers.length) {
        return {
          answer:     answers[0],
          toolCalled: 'answer',
          toolResult,
          steps,
          truncated:  truncated || brokenArgs || looksCut(answers[0])
        };
      }

      continue;
    }

    if (msg.content) {
      return {
        answer:     msg.content,
        toolCalled,
        toolResult,
        steps,
        truncated:  truncated || looksCut(msg.content)
      };
    }

    break;
  }

  const forced = await askForFinalText(messages);
  if (forced) {
    return { answer: forced.answer, toolCalled, toolResult, steps, truncated: forced.truncated };
  }

  return {
    answer:     'Aku belum bisa menjawab itu. Coba tulis pertanyaannya lebih lengkap.',
    toolCalled,
    toolResult: null,
    steps
  };
}

export default { runAgent, resetAgentMemory };
