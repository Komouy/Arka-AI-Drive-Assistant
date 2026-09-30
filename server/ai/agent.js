/**
 * ARKA AI — Agent
 * 
 * Handles natural language commands via `arka ask "<query>"`
 * 
 * Uses Groq (MODELS.groq.fast) for fast tool-call reasoning.
 * Read-only tools available to the model:
 *   - search_files        (name / description / tags / category, optional type filter)
 *   - search_prompts
 *   - list_inbox
 *   - get_workspace_stats
 *   - list_folders
 *   - get_usage_guide     (how to use the CLI, by topic — see server/ai/usageGuide.js)
 *   - answer              (plain text response, terminates the loop)
 */

import { db } from '../database/db.js';
import { getGroq, MODELS, describeAIError } from './providers.js';
import { getEnv } from '../config/env.js';
import { getFileTypeCategory } from '../utils/fileTypes.js';
import { getGuideText, guideTopicsText } from './usageGuide.js';

/** Escape SQL LIKE wildcards so a query such as "50%" cannot match everything. */
function likePattern(query = '') {
  const escaped = String(query).replace(/[\\%_]/g, ch => `\\${ch}`);
  return `%${escaped}%`;
}

// ── Tool Definitions for the Agent ───────────────────────────────────────────
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
      description: `Get the official ARKA usage documentation for one topic, so you can tell the user exactly which command to run. Use this whenever the user asks how to do something with ARKA or which command exists. Topics: ${guideTopicsText()} (leave empty for an overview).`,
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

// ── Tool Implementations ──────────────────────────────────────────────────────
function executeTool(name, args) {
  switch (name) {
    case 'search_files': {
      const pattern = likePattern(args.query);
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

      // Optional type filter (Image / Video / Audio / Document / Code / Archive / Other)
      const filtered = args.type
        ? rows.filter(row => getFileTypeCategory(row.mime_type, row.original_name).toLowerCase() === String(args.type).toLowerCase())
        : rows;

      return { files: filtered, count: filtered.length };
    }

    case 'search_prompts': {
      const pattern = likePattern(args.query);
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
      const total = db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(size),0) as b FROM files WHERE is_trash = 0').get();
      const inbox = db.prepare('SELECT COUNT(*) as c FROM files WHERE is_inbox = 1 AND is_trash = 0').get();
      const folders = db.prepare('SELECT COUNT(*) as c FROM folders').get();
      const prompts = db.prepare('SELECT COUNT(*) as c FROM prompts').get();
      return {
        totalFiles: total.c,
        totalBytes: total.b,
        inboxFiles: inbox.c,
        folders: folders.c,
        prompts: prompts.c
      };
    }

    case 'list_folders': {
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
      `[Prompt ${p.id}] "${p.title}" [${p.category}] - ${p.tags || ''}`
    ).join('\n');
  }
  if (name === 'list_inbox') {
    if (result.count === 0) return 'Inbox is empty.';
    return `${result.count} files in inbox:\n` + result.files.map(f =>
      `[ID:${f.id}] ${f.original_name} - ${f.category || 'Uncategorized'}`
    ).join('\n');
  }
  if (name === 'get_workspace_stats') {
    const mb = (result.totalBytes / 1024 / 1024).toFixed(1);
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

// ── Main Agent Run ─────────────────────────────────────────────────────────────
// ── Output-length guard ─────────────────────────────────────────────────────
// Groq's reasoning models bill hidden "thinking" tokens against max_tokens, so
// long answers get cut off mid-sentence. Override with ARKA_AGENT_MAX_TOKENS.
const AGENT_MAX_TOKENS = Number(getEnv('ARKA_AGENT_MAX_TOKENS')) || 2400;

/**
 * finish_reason is the primary "cut off" signal, but a completion that stops on
 * a connector ("… lalu arka upload --") is obviously unfinished as well.
 */
function looksCut(text = '') {
  const t = String(text).trim();
  if (t.length < 60) return false;
  // Only the END of the text matters: a trailing connector means it stopped mid-thought.
  return /[,;:]\s*$|[-–—([{]\s*$/.test(t);
}

// ── Short-term conversation memory ──────────────────────────────────────────
// `arka ask` is a one-shot CLI call, so a follow-up such as "yang lebih detail"
// loses its context. The (single-user, local) server keeps the last few
// exchanges until they go stale or the user runs `arka ask --reset`.
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

/**
 * Last resort: ask once more with no tools at all, so the user always gets a
 * real reply instead of a canned apology.
 */
async function askForFinalText(messages) {
  try {
    const groq = getGroq();
    const res  = await groq.chat.completions.create({
      model: MODELS.groq.fast,
      messages: [
        ...messages,
        { role: 'user', content: "Jawab permintaan user tadi sekarang sebagai teks biasa (jangan panggil tool). Bahasa mengikuti user, maksimal 120 kata, kalimat penutup harus lengkap." }
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
 * Run the agent and remember the exchange, so short follow-ups keep context.
 *
 * @param {string} userQuery
 * @param {{ reset?: boolean }} [options] clear the conversation before asking
 */
export async function runAgent(userQuery, { reset = false } = {}) {
  if (reset) resetAgentMemory();
  const result = await runOnce(userQuery);
  if (!result.error && result.answer) remember(userQuery, result.answer);
  return result;
}


/**
 * Run the ARKA agent with a natural language query.
 * 
 * @param {string} userQuery       - Natural language input from user
 * @returns {Promise<{
 *   answer: string,
 *   toolCalled: string | null,
 *   toolResult: any,
 *   steps: number
 * }>}
 */
async function runOnce(userQuery) {
  const systemPrompt = `You are ARKA, a personal AI workspace assistant. You help users manage their files, prompts, and workspace.

Available tools let you search files, search prompts, list the inbox, check workspace stats, list folders, and read the ARKA usage guide.

Rules:
- Always use a tool when the user asks about files, prompts, or workspace data.
- After getting tool results, give a friendly, concise response.
- If unsure what to do, use the 'answer' tool to respond directly.
- Always respond in the same language the user used (Indonesian/English).
- Keep answers SHORT and COMPLETE: max ~100 words / 6 bullet lines, and always end with a finished sentence — never trail off. For long details point the user to 'arka guide <topik>' instead of pasting everything.
- Earlier turns of this chat are included. If the message is a follow-up ("yang lebih detail", "yg kedua"), continue that topic — but call get_usage_guide for it FIRST, then quote only what the guide says.
- NEVER invent commands, flags, options, ports, URLs or file paths. Anything you show must exist in the usage guide or in a tool result (e.g. --inbox and --project are real; --dry-run, --folder, --tag on upload are NOT). If you are not sure a flag exists, do not mention it.
- For "rapikan inbox" or organize requests, use list_inbox first then explain what you found.
- When the user asks HOW to use ARKA or which command to run, call get_usage_guide (topic like 'mulai', 'upload', 'inbox', 'ai') and relay the real commands verbatim — never invent commands. Pick the 3-5 most important commands for that topic only.
- You are read-only: you cannot move, rename, delete, or upload files. Suggest the exact CLI command (arka triage / arka move / arka rm / arka upload) instead of claiming you did it.`;

  const messages = [
    { role: 'system',  content: systemPrompt },
    ...takeMemory(),                  // lets "yang lebih detail…" keep its context
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
        max_tokens:  AGENT_MAX_TOKENS,  // reasoning models spend part of this on hidden tokens
        temperature: 0.2
      });
    } catch (err) {
      // Provider/network failure → surface a readable message instead of a raw dump
      console.error('[ARKA AI] /ask provider error:', describeAIError(err));
      return {
        answer: `Maaf, layanan AI sedang bermasalah (${describeAIError(err)}). Coba lagi sebentar atau jalankan 'arka ai-status'.`,
        toolCalled: null,
        toolResult: null,
        steps,
        error: describeAIError(err)
      };
    }

    const choice = response.choices?.[0];
    const msg = choice?.message;
    // finish_reason 'length' = the model was cut off mid-answer by max_tokens
    const truncated = choice?.finish_reason === 'length';

    if (!msg) break;

    // If the model wants to call tools, run every requested tool
    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const calls = msg.tool_calls.slice(0, 4); // keep the loop bounded
      const answers = [];

      messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });

      for (const call of calls) {
        const name = call.function?.name;
        let args = {};
        let brokenArgs = false;
        try {
          args = JSON.parse(call.function?.arguments || '{}') || {};
        } catch {
          args = {};
          brokenArgs = true;   // the JSON string was cut off by max_tokens
        }

        toolCalled = name;
        toolResult = executeTool(name, args);

        // Every tool_call must get a tool message back, otherwise the next
        // request to the provider fails with a 400 (broken message sequence).
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: name !== 'answer'
            ? formatToolResult(name, toolResult)
            : (toolResult?.text && !brokenArgs
                ? 'Answer delivered to the user.'
                : 'The answer text was empty or truncated — write the answer again as plain text, briefly.')
        });

        if (name === 'answer' && toolResult?.text && !brokenArgs) answers.push(toolResult.text);
      }

      // Calls we chose not to run still need a placeholder response
      for (const skipped of msg.tool_calls.slice(4)) {
        messages.push({ role: 'tool', tool_call_id: skipped.id, content: 'Skipped: too many tool calls in one turn.' });
      }

      // The 'answer' tool is a terminal response for the user — note that it can
      // be cut off by max_tokens too, so report truncation here as well.
      if (answers.length) {
        return {
          answer:     answers[0],
          toolCalled: 'answer',
          toolResult,
          steps,
          truncated:  truncated || brokenArgs || looksCut(answers[0])
        };
      }

      // Continue loop to get the final natural-language answer
      continue;
    }

    // Model gave a direct text response
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

  // Out of steps (or the model never produced text): one forced text-only pass
  // so the user gets a real reply instead of a canned apology.
  const forced = await askForFinalText(messages);
  if (forced) {
    return { answer: forced.answer, toolCalled, toolResult, steps, truncated: forced.truncated };
  }

  return {
    answer:     'Aku belum bisa menjawab itu. Coba tulis pertanyaannya lebih lengkap, atau baca dokumentasi lewat \'arka guide\' (daftar topik) dan \'arka guide <topik>\'.',
    toolCalled,
    toolResult: null,
    steps
  };
}

export default { runAgent, resetAgentMemory };
