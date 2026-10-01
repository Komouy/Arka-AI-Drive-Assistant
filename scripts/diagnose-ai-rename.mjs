#!/usr/bin/env node
/**
 * ARKA — AI Rename diagnostic
 *
 * Reproduces the "AI Rename tidak tersimpan" report end to end against the real
 * database the server is configured to use (Supabase when .env provides it,
 * otherwise SQLite):
 *
 *   1. /api/status        → is the Phase 4 AI schema (suggested_name/_folder) live?
 *   2. GET  /api/files    → do the rows expose the suggestion fields at all?
 *   3. PATCH /api/files/:id → rename to a name containing an apostrophe
 *                             (that is what crashed the old inline onclick UI)
 *   4. GET  /api/files/:id → did the new name survive a reload?
 *   5. HEAD public_url    → was the physical object renamed and still readable?
 *   6. restore            → the original name is put back afterwards
 *
 * Usage: npm run diagnose:rename   (or)   node scripts/diagnose-ai-rename.mjs
 * Optional: ARKA_DIAG_EMAIL / ARKA_DIAG_PASSWORD, otherwise the local .env
 * ARKA_USERNAME + ARKA_PASSWORD are used.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.ARKA_DIAG_PORT || 5099);
const BASE = `http://127.0.0.1:${PORT}/api`;

const results = [];
function check(label, passed, detail = '') {
  results.push({ label, passed, detail });
  console.log(`${passed ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// Boot the real app — the same code path the browser talks to.
process.env.PORT = String(PORT);
const { app } = await import(pathToFileURL(path.join(ROOT, 'server', 'app.js')).href);
const server = app.listen(PORT);

function readEnv(key) {
  try {
    const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    return env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const username = process.env.ARKA_DIAG_EMAIL || readEnv('ARKA_USERNAME') || 'Dhaifan';
const password = process.env.ARKA_DIAG_PASSWORD || readEnv('ARKA_PASSWORD');

let token = '';
try {
  const login = await (await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })).json();

  token = login.token;
  if (!token) {
    console.error('❌ Login failed — set ARKA_DIAG_EMAIL / ARKA_DIAG_PASSWORD and retry.');
    console.error(JSON.stringify(login));
    server.close();
    process.exit(1);
  }
  console.log(`🔑 Logged in as ${username}`);
} catch (err) {
  console.error('❌ Could not reach the local ARKA server:', err.message);
  server.close();
  process.exit(1);
}

const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };


/* ── 1. schema status ─────────────────────────────────────────────────────── */
console.log('\n1) Database schema');
try {
  const status = await (await fetch(`${BASE}/status`, { headers: H })).json();
  const ai = status.data?.ai || {};
  console.log(`   database: ${ai.database || status.data?.database} | suggestion columns ready: ${JSON.stringify(ai.ready)}`);
  if (ai.ready === false) {
    console.log('   ⚠️  Run phase4_smart_ai_triage.sql in the Supabase SQL editor, then restart the server.');
    console.log('       The app keeps working (it degrades to the base schema) but AI suggestions are not persisted.');
  }
} catch (err) {
  check('/api/status reachable', false, err.message);
}

/* ── 2. listing exposes the suggestion fields ─────────────────────────────── */
console.log('\n2) GET /api/files');
const list = await (await fetch(`${BASE}/files`, { headers: H })).json();
const rows = list.data || [];
check('list returns files', rows.length > 0, `${rows.length} file(s)`);
check('rows carry the suggested_name field', rows.length === 0 || ('suggested_name' in (rows[0] || {})));

rows.slice(0, 8).forEach((f) => {
  const sugg = f.suggested_name ? ` → "${f.suggested_name}"` : '';
  console.log(`   #${f.id} "${f.original_name}"${sugg}${f.ai_analyzed ? '' : '  (belum dianalisis)'}   [${f.typeCategory}]`);
});

/* ── 3-6. rename round trip on one file ───────────────────────────────────── */
console.log('\n3) Rename round trip');
const target = rows.find((f) => f.provider !== 'gdrive') || rows[0];
if (!target) {
  console.log('   ⏭  No file available — nothing to rename.');
} else {
  const originalName = target.original_name;
  // an apostrophe on purpose: it used to break the "Ganti Nama AI" button
  const testName = "ARKA Diagnose's Report.pdf";

  const patched = await (await fetch(`${BASE}/files/${target.id}`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ original_name: testName })
  })).json();

  check('PATCH accepts an apostrophe in the name', patched.success === true, patched.error || '');
  check('PATCH returns the new name', patched.data?.original_name === testName, String(patched.data?.original_name));
  (patched.renameNotes || []).forEach((n) => console.log(`   ℹ️  ${n}`));

  const after = await (await fetch(`${BASE}/files/${target.id}`, { headers: H })).json();
  check('rename persisted in the database', after.data?.original_name === testName, String(after.data?.original_name));

  const url = after.data?.publicUrl || after.data?.public_url || '';
  if (/^https?:\/\//.test(url)) {
    const head = await fetch(url, { method: 'HEAD' });
    check('renamed physical object still readable', head.ok, `HTTP ${head.status} — ${url.split('/').slice(-2).join('/')}`);
  } else {
    console.log(`   ℹ️  local storage URL: ${url}`);
  }

  const restored = await (await fetch(`${BASE}/files/${target.id}`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ original_name: originalName })
  })).json();
  check('original name restored', restored.data?.original_name === originalName, originalName);
}

/* ── summary ──────────────────────────────────────────────────────────────── */
const failed = results.filter((r) => !r.passed);
console.log(`\n${failed.length === 0 ? '✅ All checks passed' : `❌ ${failed.length} check(s) failed`}`);
failed.forEach((f) => console.log(`   • ${f.label}${f.detail ? ` — ${f.detail}` : ''}`));

server.close();
process.exit(failed.length === 0 ? 0 : 1);
