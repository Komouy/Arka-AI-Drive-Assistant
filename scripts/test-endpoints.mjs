#!/usr/bin/env node
/**
 * ARKA — Comprehensive Smoke Test
 *
 * Meng-cover semua fitur utama dalam satu run:
 *   Auth · Folders · Files (upload, rename, trash) · Inbox ·
 *   Prompts · Links · AI Agent · Drive Status
 *
 * Usage: npm test
 *        node scripts/test-endpoints.mjs
 *
 * Butuh server TIDAK berjalan — script membuat server sementara sendiri.
 * Semua data uji dibersihkan setelah test selesai.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ── Bootstrap ────────────────────────────────────────────────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { app } = await import(pathToFileURL(path.join(ROOT, 'server/app.js')).href);
const { getEnv } = await import(pathToFileURL(path.join(ROOT, 'server/config/env.js')).href);

// ── Test Runner ──────────────────────────────────────────────────────────────
const PASS = '\x1b[32m✅\x1b[0m';
const FAIL = '\x1b[31m❌\x1b[0m';
const WARN = '\x1b[33m⚠️ \x1b[0m';
const INFO = '\x1b[36mℹ️ \x1b[0m';

let passed = 0, failed = 0, warned = 0;
const results = [];

function section(title) {
  console.log(`\n\x1b[1m\x1b[34m── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}\x1b[0m`);
}

async function test(desc, fn, { optional = false } = {}) {
  try {
    const info = await fn();
    console.log(`  ${PASS} ${desc}${info ? `\x1b[90m  ${info}\x1b[0m` : ''}`);
    passed++;
    results.push({ desc, status: 'pass' });
  } catch (err) {
    if (optional) {
      console.log(`  ${WARN}${desc}: ${err.message}`);
      warned++;
      results.push({ desc, status: 'warn', msg: err.message });
    } else {
      console.error(`  ${FAIL} ${desc}: \x1b[31m${err.message}\x1b[0m`);
      failed++;
      results.push({ desc, status: 'fail', msg: err.message });
    }
  }
}

// ── HTTP Helpers ──────────────────────────────────────────────────────────────
function makeRequest(base, token) {
  return async function req(method, path, body, customHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...customHeaders,
    };
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    return { res, json, text };
  };
}

async function uploadFile(base, token, filePath, fields = {}) {
  const form = new FormData();
  const fileBlob = new Blob([fs.readFileSync(filePath)]);
  form.append('files', fileBlob, path.basename(filePath));
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  const res = await fetch(`${base}/api/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = await res.json();
  return { res, json };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function runTests() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const BASE = `http://127.0.0.1:${port}`;
  console.log(`\n\x1b[1mARKA Smoke Test\x1b[0m — ephemeral server on ${BASE}`);

  // Mutable state — resources created during tests for cleanup
  const cleanup = { folders: [], files: [], prompts: [], links: [] };
  let token = null;
  let req = makeRequest(BASE, null);

  try {
    // ── 1. Auth ───────────────────────────────────────────────────────────────
    section('AUTH');

    await test('GET /api/auth/config → success + authType field', async () => {
      const { res, json } = await req('GET', '/api/auth/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!json?.success) throw new Error(json?.error || 'no success flag');
      return `authType: ${json.data?.authType ?? '?'}`;
    });

    await test('POST /api/auth/login dengan password salah → 401', async () => {
      const { res } = await req('POST', '/api/auth/login', { username: 'Dhaifan', password: '___wrong___' });
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    });

    await test('POST /api/auth/login → token diterima', async () => {
      const password = getEnv('ARKA_PASSWORD');
      const username = getEnv('ARKA_USERNAME') || 'Dhaifan';
      const { res, json } = await req('POST', '/api/auth/login', { username, password });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!json?.token) throw new Error('Token tidak ada di response');
      token = json.token;
      req = makeRequest(BASE, token);
    });

    await test('GET /api/auth/verify → token valid', async () => {
      const { res, json } = await req('GET', '/api/auth/verify');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!json?.success) throw new Error('Verify gagal');
    });

    await test('Akses protected route tanpa token → 401', async () => {
      const noAuthReq = makeRequest(BASE, null);
      const { res } = await noAuthReq('GET', '/api/files');
      if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    });

    // ── 2. System ─────────────────────────────────────────────────────────────
    section('SYSTEM');

    await test('GET /api/status → stats lengkap', async () => {
      const { res, json } = await req('GET', '/api/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = json?.data?.stats;
      if (!s) throw new Error('stats tidak ada');
      // API mengembalikan totalFiles, inboxFiles (bukan files/inbox)
      const missing = ['totalFiles', 'folders', 'prompts', 'links', 'inboxFiles', 'trash']
        .filter(k => typeof s[k] !== 'number');
      if (missing.length) throw new Error(`Field missing: ${missing.join(', ')}`);
      return `files:${s.totalFiles} folders:${s.folders} prompts:${s.prompts} links:${s.links}`;
    });

    await test('GET / → serve HTML UI (express.static intercept)', async () => {
      // express.static melayani public/index.html untuk GET /, ini behavior BENAR.
      // Akses JSON via /api/status (sudah ditest di atas). Browser tetap dapat UI.
      const res = await fetch(`${BASE}/`);
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!text.includes('<!DOCTYPE') && !text.includes('<html')) {
        throw new Error('Seharusnya mengembalikan HTML UI');
      }
      return 'HTML UI OK';
    });

    // ── 3. Folders ────────────────────────────────────────────────────────────
    section('FOLDERS');

    let folderId = null, childId = null;

    await test('POST /api/folders nested path → 2 folder terbuat', async () => {
      const { res, json } = await req('POST', '/api/folders', { path_str: 'SmokeTest/SubFolder' });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error}`);
      if (!json?.data?.id) throw new Error('ID folder tidak ada');
      childId = json.data.id;
      folderId = json.data.parent_id;
      if (folderId) cleanup.folders.push(folderId);   // parent dihapus → cascade hapus child
      else cleanup.folders.push(childId);
      return `parent:${folderId} child:${childId}`;
    });

    await test('GET /api/folders → list berisi folder baru', async () => {
      const { res, json } = await req('GET', '/api/folders');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const found = json?.data?.some(f => f.id === (folderId || childId));
      if (!found) throw new Error('Folder baru tidak ada di list');
    });

    await test('PATCH /api/folders/:id → rename berhasil', async () => {
      const id = folderId || childId;
      if (!id) throw new Error('Tidak ada folder untuk di-rename');
      const { res, json } = await req('PATCH', `/api/folders/${id}`, { name: 'SmokeTest-Renamed' });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error}`);
    });

    await test('PATCH /api/folders cycle prevention → 400', async () => {
      if (!folderId || !childId) throw new Error('Butuh 2 folder — skip');
      const { res } = await req('PATCH', `/api/folders/${folderId}`, { parent_id: childId });
      if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    });

    // ── 4. Files — Upload & CRUD ──────────────────────────────────────────────
    section('FILES');

    // Buat file sementara untuk diupload
    const tmpTxt  = path.join(ROOT, 'scripts', '_smoke_test.txt');
    const tmpImg  = path.join(ROOT, 'scripts', '_smoke_test.png');
    fs.writeFileSync(tmpTxt, 'ARKA smoke test file — can be deleted safely.');
    // Buat 1x1 PNG valid (minimal PNG bytes)
    const PNG1x1 = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000009001' +
      '2e00000000c49444154789c6260000000020001e221bc330000000049454e44ae426082', 'hex'
    );
    fs.writeFileSync(tmpImg, PNG1x1);

    let fileId = null, imgFileId = null;

    await test('POST /api/files/upload (txt) → ID diterima', async () => {
      const { res, json } = await uploadFile(BASE, token, tmpTxt, { folder_id: folderId || '' });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error}`);
      const f = json?.data?.[0] ?? json?.data;
      if (!f?.id) throw new Error(`Tidak ada file ID. Response: ${JSON.stringify(json)}`);
      fileId = f.id;
      cleanup.files.push(fileId);
      return `id:${fileId} name:${f.original_name}`;
    });

    await test('POST /api/files/upload (png image) → ID diterima', async () => {
      const { res, json } = await uploadFile(BASE, token, tmpImg);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error}`);
      const f = json?.data?.[0] ?? json?.data;
      if (!f?.id) throw new Error('Tidak ada file ID');
      imgFileId = f.id;
      cleanup.files.push(imgFileId);
      return `id:${imgFileId}`;
    });

    await test('GET /api/files → list aktif (bukan trash)', async () => {
      const { res, json } = await req('GET', '/api/files');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!Array.isArray(json?.data)) throw new Error('Data bukan array');
      const found = json.data.some(f => f.id === fileId);
      if (!found) throw new Error('File yang baru diupload tidak muncul di list');
      return `total: ${json.data.length}`;
    });

    await test('GET /api/files/:id → detail file', async () => {
      if (!fileId) throw new Error('Tidak ada fileId');
      const { res, json } = await req('GET', `/api/files/${fileId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!json?.data?.id) throw new Error('Detail file kosong');
    });

    await test('PATCH /api/files/:id → rename file', async () => {
      if (!fileId) throw new Error('Tidak ada fileId');
      const { res, json } = await req('PATCH', `/api/files/${fileId}`, { name: 'renamed-smoke-test.txt' });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error}`);
    });

    await test('GET /api/files?trash=true → daftar sampah', async () => {
      const { res, json } = await req('GET', '/api/files?trash=true');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!Array.isArray(json?.data)) throw new Error('Trash bukan array');
    });

    await test('GET /api/files?folder_id=<id> → filter per folder', async () => {
      if (!folderId) throw new Error('Tidak ada folderId — skip');
      const { res, json } = await req('GET', `/api/files?folder_id=${folderId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!Array.isArray(json?.data)) throw new Error('Bukan array');
      return `${json.data.length} file di folder`;
    });

    await test('POST /api/files/:id/analyze → metadata AI (opsional jika AI tidak aktif)', async () => {
      if (!fileId) throw new Error('Tidak ada fileId');
      const { res, json } = await req('POST', `/api/files/${fileId}/analyze`);
      // 200 (berhasil) atau 503 (AI tidak tersedia) sama-sama valid
      if (res.status !== 200 && res.status !== 503 && res.status !== 422) {
        throw new Error(`Unexpected HTTP ${res.status}: ${json?.error}`);
      }
      return res.status === 200 ? 'AI OK' : `AI unavailable (${res.status})`;
    }, { optional: true });

    await test('POST /api/files/auto-organize-all → count ada', async () => {
      const { res, json } = await req('POST', '/api/files/auto-organize-all');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (typeof json?.count !== 'number') throw new Error('Tidak ada field count');
      return `organized: ${json.count}`;
    });

    // Download
    await test('GET /api/files/:id/download → 200 atau redirect', async () => {
      if (!fileId) throw new Error('Tidak ada fileId');
      const res = await fetch(`${BASE}/api/files/${fileId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'manual',
      });
      if (res.status !== 200 && res.status !== 302 && res.status !== 301) {
        throw new Error(`HTTP ${res.status}`);
      }
      return `HTTP ${res.status}`;
    });

    // ── 5. Inbox ──────────────────────────────────────────────────────────────
    section('INBOX');

    await test('GET /api/inbox → list', async () => {
      const { res, json } = await req('GET', '/api/inbox');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!Array.isArray(json?.data)) throw new Error('Bukan array');
      return `${json.data.length} item di inbox`;
    });

    // ── 6. Prompts ────────────────────────────────────────────────────────────
    section('PROMPTS');

    let promptId = null;

    await test('POST /api/prompts → create', async () => {
      const { res, json } = await req('POST', '/api/prompts', {
        title: '[SMOKE] Test Prompt — bisa hapus',
        content: 'Ini prompt untuk smoke test otomatis.',
        category: 'Testing',
        tags: ['smoke', 'automated'],
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error}`);
      promptId = json?.data?.id;
      if (!promptId) throw new Error('Tidak ada ID prompt');
      cleanup.prompts.push(promptId);
      return `id:${promptId}`;
    });

    await test('GET /api/prompts → list mengandung prompt baru', async () => {
      const { res, json } = await req('GET', '/api/prompts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const found = json?.data?.some(p => p.id === promptId);
      if (!found) throw new Error('Prompt tidak muncul di list');
    });

    await test('GET /api/prompts?search=SMOKE → search bekerja', async () => {
      const { res, json } = await req('GET', '/api/prompts?search=SMOKE');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!Array.isArray(json?.data)) throw new Error('Bukan array');
      return `${json.data.length} hasil`;
    });

    await test('GET /api/prompts?search=special(char,test) → tidak crash', async () => {
      const { res } = await req('GET', '/api/prompts?search=special(char%2Ctest)');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });

    await test('PATCH /api/prompts/:id → update', async () => {
      if (!promptId) throw new Error('Tidak ada promptId');
      const { res, json } = await req('PATCH', `/api/prompts/${promptId}`, {
        title: '[SMOKE] Updated',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error}`);
    });

    // ── 7. Links ──────────────────────────────────────────────────────────────
    section('LINKS');

    let linkId = null;

    await test('POST /api/links → create', async () => {
      const { res, json } = await req('POST', '/api/links', {
        url: 'https://example.com/smoke-test',
        title: '[SMOKE] Test Link',
        category: 'Tools',
        tags: 'smoke,test',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error}`);
      linkId = json?.data?.id;
      if (!linkId) throw new Error('Tidak ada ID link');
      cleanup.links.push(linkId);
      return `id:${linkId}`;
    });

    await test('GET /api/links → list mengandung link baru', async () => {
      const { res, json } = await req('GET', '/api/links');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const found = json?.data?.some(l => l.id === linkId);
      if (!found) throw new Error('Link tidak muncul di list');
    });

    await test('GET /api/links/:id → detail link', async () => {
      if (!linkId) throw new Error('Tidak ada linkId');
      const { res, json } = await req('GET', `/api/links/${linkId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!json?.data?.id) throw new Error('Detail link kosong');
    });

    await test('GET /api/links?search=SMOKE → search bekerja', async () => {
      const { res, json } = await req('GET', '/api/links?search=SMOKE');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return `${json?.data?.length ?? 0} hasil`;
    });

    await test('PATCH /api/links/:id → update', async () => {
      if (!linkId) throw new Error('Tidak ada linkId');
      const { res, json } = await req('PATCH', `/api/links/${linkId}`, {
        title: '[SMOKE] Updated Link',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error}`);
    });

    await test('POST /api/links/:id/analyze → AI analisis link (opsional)', async () => {
      if (!linkId) throw new Error('Tidak ada linkId');
      const { res, json } = await req('POST', `/api/links/${linkId}/analyze`);
      if (res.status !== 200 && res.status !== 503 && res.status !== 422) {
        throw new Error(`Unexpected HTTP ${res.status}: ${json?.error}`);
      }
      return res.status === 200 ? 'AI OK' : `AI unavailable (${res.status})`;
    }, { optional: true });

    // ── 8. AI ──────────────────────────────────────────────────────────────────
    section('AI');

    await test('GET /api/ai/status → provider info ada', async () => {
      const { res, json } = await req('GET', '/api/ai/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const p = json?.data?.providers;
      if (!p) throw new Error('Tidak ada field providers');
      const groqOk  = p.groq?.available  ? '✓' : `✗ (${p.groq?.error ?? 'unconfigured'})`;
      const gemOk   = p.gemini?.available ? '✓' : `✗ (${p.gemini?.error ?? 'unconfigured'})`;
      return `Groq: ${groqOk}  Gemini: ${gemOk}`;
    });

    await test('POST /api/ai/ask → jawaban diterima', async () => {
      const { res, json } = await req('POST', '/api/ai/ask', {
        query: 'Apa itu ARKA? Jawab singkat saja.',
        reset: true,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error}`);
      if (!json?.data?.answer) throw new Error('Tidak ada jawaban dari AI');
      return `"${json.data.answer.slice(0, 60)}…"`;
    }, { optional: true });  // opsional karena bergantung API key aktif

    await test('POST /api/ai/reset → memory di-reset', async () => {
      const { res, json } = await req('POST', '/api/ai/reset');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!json?.success) throw new Error('Reset gagal');
    });

    // ── 9. Drive ──────────────────────────────────────────────────────────────
    section('DRIVE');

    await test('GET /api/drive/status → response valid (butuh Google OAuth)', async () => {
      // Endpoint ini memerlukan header X-Provider-Token (Google OAuth token).
      // Tanpa token, server mengembalikan 400 — itu perilaku yang BENAR.
      const { res, json } = await req('GET', '/api/drive/status');
      if (res.status !== 400) throw new Error(`Expected 400 tanpa token, got ${res.status}`);
      if (json?.success !== false) throw new Error('Harus return success:false');
      return 'Token wajib → 400 OK';
    });

  } finally {

    // ── Cleanup ───────────────────────────────────────────────────────────────
    section('CLEANUP');

    // Hapus prompts
    for (const id of cleanup.prompts) {
      const { res } = await req('DELETE', `/api/prompts/${id}`);
      console.log(`  ${res.ok ? PASS : FAIL} DELETE /api/prompts/${id}`);
    }
    // Hapus links
    for (const id of cleanup.links) {
      const { res } = await req('DELETE', `/api/links/${id}`);
      console.log(`  ${res.ok ? PASS : FAIL} DELETE /api/links/${id}`);
    }
    // Hapus files (masuk ke trash dahulu → lalu empty trash untuk file tersebut)
    for (const id of cleanup.files) {
      const { res } = await req('DELETE', `/api/files/${id}`);
      console.log(`  ${res.ok ? PASS : FAIL} DELETE /api/files/${id} (trash)`);
    }
    // Empty trash
    if (cleanup.files.length) {
      const { res } = await req('DELETE', '/api/trash');
      console.log(`  ${res.ok ? PASS : FAIL} DELETE /api/trash (empty)`);
    }
    // Hapus folders (parent → cascade hapus child)
    for (const id of cleanup.folders) {
      const { res } = await req('DELETE', `/api/folders/${id}`);
      console.log(`  ${res.ok ? PASS : FAIL} DELETE /api/folders/${id}`);
    }

    // Hapus file temp dari disk
    for (const f of ['scripts/_smoke_test.txt', 'scripts/_smoke_test.png']) {
      try { fs.unlinkSync(path.join(ROOT, f)); } catch {}
    }

    server.close();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(55));
  console.log(`\x1b[1m  HASIL: \x1b[32m${passed} ✅ lulus\x1b[0m  \x1b[33m${warned} ⚠️  peringatan\x1b[0m  \x1b[31m${failed} ❌ gagal\x1b[0m`);
  console.log('═'.repeat(55) + '\n');

  if (failed > 0) {
    console.log('\x1b[31mTest GAGAL:\x1b[0m');
    results.filter(r => r.status === 'fail').forEach(r => console.log(`  ❌ ${r.desc}: ${r.msg}`));
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('\n[FATAL TEST ERROR]', err);
  process.exit(1);
});
