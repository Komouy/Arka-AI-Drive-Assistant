#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// Config file in user's home directory: ~/.arkarc
const CONFIG_FILE = path.join(os.homedir(), '.arkarc');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write ~/.arkarc:', e.message);
  }
}

const config = loadConfig();
const API_BASE = process.env.ARKA_API || config.apiUrl || 'http://localhost:5000/api';

// Grayscale & Monochrome ANSI Palette (CMD, PowerShell, Termux)
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  white: '\x1b[97m',
  light: '\x1b[37m',
  gray: '\x1b[90m',
  darkGray: '\x1b[38;5;238m',
  inv: '\x1b[7m',
  // Backward-compatibility aliases (all mapped into crisp monochrome tones)
  cyan: '\x1b[97m',
  indigo: '\x1b[37m',
  green: '\x1b[97m',
  yellow: '\x1b[37m',
  rose: '\x1b[97m',
  blue: '\x1b[37m',
  magenta: '\x1b[97m'
};

function formatBytes(bytes) {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/** Clean aligned ID tag: "[#12]   " in gray/white */
function idTag(id) {
  const raw = `[#${id}]`;
  const pad = ' '.repeat(Math.max(0, 8 - raw.length));
  return `${c.gray}[${c.white}#${id}${c.gray}]${c.reset}${pad}`;
}

// ── Command Typo & Fuzzy Matching Helper ────────────────────────────────────
function levenshtein(a, b) {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = [];
  for (let i = 0; i <= bn; i++) matrix[i] = [i];
  for (let j = 0; j <= an; j++) matrix[0][j] = j;
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[bn][an];
}

const CANONICAL_COMMANDS = [
  'status', 'ls', 'info', 'view', 'mkdir', 'upload',
  'download', 'move', 'rm', 'restore', 'trash',
  'inbox', 'triage', 'prompt', 'link', 'search',
  'config', 'ai-status', 'ask', 'analyze',
  'start', 'stop', 'install', 'guide', 'help'
];

function findClosestCommand(input, validList = CANONICAL_COMMANDS) {
  if (!input) return null;
  const target = input.toLowerCase();
  let best = null;
  let minDistance = Infinity;

  for (const cmd of validList) {
    if (cmd === target) return cmd;

    let dist = levenshtein(target, cmd);

    // Give priority boost if input is a strong prefix/contains
    if (cmd.startsWith(target) && target.length >= 2) {
      dist = Math.min(dist, 1);
    } else if (target.startsWith(cmd) && cmd.length >= 3) {
      dist = Math.min(dist, 1);
    }

    if (dist < minDistance) {
      minDistance = dist;
      best = cmd;
    }
  }

  // Adaptive threshold based on word length
  const maxAllowed = target.length <= 3 ? 1 : (target.length <= 5 ? 2 : 3);
  return minDistance <= maxAllowed ? best : null;
}


const __filename = fileURLToPath(import.meta.url);
const CLI_DIR = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(CLI_DIR, '..', '..');

// Read version from root package.json (single source of truth, not hardcoded)
function readCliVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).version || '1.0.0';
  } catch { return '1.0.0'; }
}

function printBanner() {
  const ver = readCliVersion();
  console.log(`
${c.white}${c.bold}   ___    ____    __ __   ___ 
  / _ |  / _  |  / //_/  / _ |
 / __ | / , _/  / ,<    / __ |  ${c.white}PERSONAL AI WORKSPACE${c.reset}
${c.white}/_/ |_|/_/|_|  /_/|_|  /_/ |_|  ${c.gray}CLI v${ver} · Terminal & Termux Hub${c.reset}
  `);
}

// ── Built-in usage guide ─────────────────────────────────────────────────────
// Mirrors server/ai/usageGuide.js (that copy answers `arka ask "cara pakai"`;
// this one works offline and in Termux, where only this file is installed).
// Keep both in sync when commands change.
const GUIDE = {
  mulai: {
    title: 'MENYALAKAN & MENGHENTIKAN ARKA',
    lines: [
      "arka install                daftarkan 'arka' ke user PATH (sekali saja) -> buka terminal baru",
      '  --dry-run                 pratinjau saja, tidak mengubah PATH',
      'arka start                  nyalakan ARKA Core di background (log: storage/logs/server.log)',
      '  --foreground | -f         server di terminal ini, Ctrl+C untuk berhenti',
      '  --port 5001               ganti port default 5000',
      'arka  /  arka status        cek koneksi + statistik + rincian storage',
      'arka stop                   matikan Core (hanya proses node pada port target)',
      'arka config show            lihat alamat API aktif (~/.arkarc)',
      'arka config set-url URL     ganti alamat API (mis. http://192.168.1.5:5000/api)'
    ]
  },
  upload: {
    title: 'UPLOAD & INGEST HUB (PORTAL & CLI)',
    lines: [
      'arka upload                             buka Portal Web interaktif di browser:',
      '                                        - Drag & drop file bebas (sortir ke folder/inbox)',
      '                                        - Input catatan teks & prompt AI (masuk Knowledge Hub)',
      '                                        - Input link & bookmark web (tersortir terpisah)',
      'arka upload --native                    buka picker file native Windows Explorer',
      'arka upload "foto.jpg"                  upload langsung via CLI ke root workspace',
      'arka upload "catatan.txt" --inbox       upload langsung ke Inbox (belum dikelompokkan)',
      'arka upload "C:\\Aset" --project "Website"  upload folder rekursif ke project tertentu',
      'Catatan: Maks 500 MB/file. Setelah upload, AI otomatis membuat deskripsi + tag.'
    ]
  },
  link: {
    title: 'LINK & BOOKMARK HUB (TERORGANISIR TERPISAH)',
    lines: [
      'arka link ls                               daftar link & bookmark tersimpan',
      'arka link add "https://..."                simpan link baru (otomatis ambil judul & domain)',
      '  --title "Judul"                          judul kustom',
      '  --category "Dev Tools"                   kategori link (Dev Tools, Video, Referensi, dll)',
      '  --desc "catatan singkat"                 catatan alasan simpan',
      'arka link open <id>                        buka link di browser default',
      'arka link rm <id>                          hapus link',
      'Link ikut dicari oleh "arka search" dan tampil di portal "arka upload".'
    ]
  },
  inbox: {
    title: 'INBOX & TRIAGE (MERAPIKAN)',
    lines: [
      'arka inbox               daftar file yang belum masuk folder',
      'arka triage              mode interaktif per file:',
      '  <Enter>                terima saran folder dari AI',
      '  <nama/id folder>       pindah ke sana ("A/B/C" atau ID dibuat otomatis)',
      '  s                      lewati file ini   |   q berhenti (hasil sebelumnya tersimpan)',
      'arka move <file> <folder>                pindah manual',
      'arka mkdir "Instagram/Mockups"           buat folder bersarang'
    ]
  },
  file: {
    title: 'MELIHAT, MEMBACA, MENGUNDUH',
    lines: [
      'arka ls                   struktur folder + jumlah file',
      'arka ls Instagram         isi satu folder',
      'arka info <id|nama>       metadata lengkap (ukuran, tipe, folder, hasil AI)',
      'arka view <id|nama>       baca isi teks/kode di terminal (biner ditolak, >512 KB dipotong)',
      'arka download <id|nama>   unduh ke folder aktif (tidak menimpa: jadi "nama (1).ext")',
      'Setiap listing menampilkan [ID n]; ID bisa dipakai di semua perintah yang butuh file.'
    ]
  },
  trash: {
    title: 'Sampah — Hapus & Pulihkan',
    lines: [
      'arka rm <id|nama>              pindah ke sampah (masih bisa dipulihkan)',
      'arka rm <id|nama> --permanent  hapus permanen (file fisik ikut terhapus)',
      'arka restore <id|nama>         kembalikan dari sampah',
      'arka trash                     lihat isi sampah',
      'arka trash empty               kosongkan sampah permanen',
      'Menghapus folder tidak menghapus file di dalamnya (dipindah ke Inbox).'
    ]
  },
  prompt: {
    title: 'PROMPT / KNOWLEDGE HUB',
    lines: [
      'arka prompt ls                                   daftar prompt',
      'arka prompt show <id>                            baca isi lengkap',
      'arka prompt add "Judul" --content "isi" --category Tech --tags a,b',
      'arka prompt edit <id> --content "versi baru"     (+ --title/--category/--tags)',
      'arka prompt rm <id>                              hapus',
      'Prompt ikut dicari oleh "arka search" dan "arka ask".'
    ]
  },
  search: {
    title: 'PENCARIAN',
    lines: [
      'arka search "kata"    cari di nama file, deskripsi AI, tag, kategori, dan prompt',
      'Masih substring (SQL LIKE), bukan semantik -> pakai kata kunci pendek.',
      'Hasil "arka analyze" membuat file lebih mudah ditemukan.'
    ]
  },
  ai: {
    title: 'FITUR AI (GROQ + GEMINI)',
    lines: [
      'arka ai-status          ONLINE/OFFLINE per provider + alasannya (key invalid, model retired, dll.)',
      'arka ask "..."          agen bahasa alami: cari file/prompt, list inbox, statistik, panduan',
      '                        agen READ-ONLY -> aksi file tetap lewat arka triage/move/rm',
      '                        pertanyaan lanjutan ("yang lebih detail") diingat maks 10 menit',
      'arka ask --reset        lupa konteks percakapan AI; jawab ulang dari nol',
      'arka analyze <id|nama>  analisis ulang 1 file (gambar/video/audio -> Gemini; teks -> Groq)',
      'Analisis otomatis jalan saat upload; bila gagal tidak disimpan sebagai metadata palsu.',
      'API key dibaca dari .env di root project (GROQ_API_KEY, GEMINI_API_KEY).'
    ]
  },
  termux: {
    title: 'ARKA DI ANDROID (TERMUX)',
    lines: [
      'bash setup-termux.sh http://<IP_PC>:5000/api    sekali: pasang node, ~/.arkarc, arka global',
      'arka config set-url http://<IP_PC>:5000/api     hubungkan HP ke Core di PC',
      'arka upload ~/storage/shared/DCIM/Camera/IMG_001.jpg --inbox',
      'arka ask "cari video terbaru saya"',
      "Server tidak berjalan di HP ('arka start' hanya untuk PC); HP dan PC harus satu jaringan."
    ]
  }
};

function printGuide(topic) {
  const keys = Object.keys(GUIDE);
  const key = String(topic || '').toLowerCase();

  if (!key || key === 'all' || key === 'semua') {
    console.log(`\n${c.white}${c.bold}── ARKA USAGE GUIDE ──────────────────────────────────────────${c.reset}\n`);
    console.log(`${c.gray}Alur harian: arka start → arka upload <file> --inbox → arka triage → arka search / arka ask${c.reset}\n`);
    keys.forEach(k => console.log(`  ${c.white}${k.padEnd(10)}${c.reset} ${c.light}${GUIDE[k].title}${c.reset}`));
    console.log(`\n${c.gray}Detail topik : ${c.white}arka guide <topik>${c.gray}  (contoh: arka guide mulai)${c.reset}`);
    console.log(`${c.gray}Semua flag   : ${c.white}arka help${c.reset}\n`);
    return;
  }

  const entry = GUIDE[key];
  if (!entry) {
    console.log(`\n${c.white}[!] Topik "${topic}" tidak ditemukan.${c.reset} ${c.gray}Tersedia: ${keys.join(', ')}${c.reset}\n`);
    return;
  }

  console.log(`\n${c.white}${c.bold}── ${entry.title} ──${c.reset}\n`);
  entry.lines.forEach(line => {
    const cut = line.search(/\s{2,}/);
    const cmd = cut > 0 ? line.slice(0, cut) : '';
    const trimmed = cmd.trim();
    const isCmd = /^(arka|--|<)/.test(trimmed) || /^[a-z]$/.test(trimmed);
    if (isCmd) console.log(`  ${c.white}${cmd}${c.reset}${c.gray}${line.slice(cut)}${c.reset}`);
    else console.log(`  ${c.gray}${line}${c.reset}`);
  });
  console.log(`\n${c.gray}Topik lain: arka guide (daftar semua topik)${c.reset}\n`);
}

function printHelp() {
  printBanner();
  console.log(`${c.bold}Usage:${c.reset} ${c.white}arka <command> [arguments] [options]${c.reset}

${c.gray}── Core Storage ──────────────────────────────────────────────${c.reset}
  ${c.white}arka status${c.reset}                    ${c.gray}Check server health, file statistics & storage${c.reset}
  ${c.white}arka ls [folder]${c.reset}               ${c.gray}List workspace folder tree or files in a folder${c.reset}
  ${c.white}arka info <id_or_name>${c.reset}         ${c.gray}Show detailed file metadata and storage path${c.reset}
  ${c.white}arka view <id_or_name>${c.reset}         ${c.gray}Print text/code/document content in terminal${c.reset}
  ${c.white}arka mkdir <path>${c.reset}              ${c.gray}Create folder (e.g. 'arka mkdir "Instagram/Mockups"')${c.reset}
  ${c.white}arka upload${c.reset}                    ${c.gray}Launch interactive Web Portal (Files, Prompts, Links)${c.reset}
  ${c.white}arka upload [files...]${c.reset}         ${c.gray}Direct upload via CLI (--project <folder>, --inbox, --native)${c.reset}
  ${c.white}arka download <id_or_name>${c.reset}     ${c.gray}Download file to current folder${c.reset}
  ${c.white}arka move <id_or_name> <dest>${c.reset}  ${c.gray}Move file to target folder (e.g. 'arka move file.png Instagram')${c.reset}
  ${c.white}arka rm <id_or_name>${c.reset}           ${c.gray}Move file to trash (or --permanent to delete)${c.reset}
  ${c.white}arka restore <id_or_name>${c.reset}      ${c.gray}Restore file from trash${c.reset}

${c.gray}── Inbox & Triage ────────────────────────────────────────────${c.reset}
  ${c.white}arka inbox${c.reset}                     ${c.gray}List unorganized files in Inbox${c.reset}
  ${c.white}arka triage${c.reset}                    ${c.gray}Interactive helper to organize Inbox items${c.reset}

${c.gray}── Trash Management ──────────────────────────────────────────${c.reset}
  ${c.white}arka trash${c.reset}                     ${c.gray}List all items currently in trash${c.reset}
  ${c.white}arka trash empty${c.reset}               ${c.gray}Permanently delete all trash files${c.reset}

${c.gray}── Prompt & Knowledge Hub ────────────────────────────────────${c.reset}
  ${c.white}arka prompt ls${c.reset}                 ${c.gray}List all saved prompts${c.reset}
  ${c.white}arka prompt show <id>${c.reset}          ${c.gray}Display full prompt text${c.reset}
  ${c.white}arka prompt add "<title>"${c.reset}       ${c.gray}Add prompt (--content "..." [--category X --tags a,b])${c.reset}
  ${c.white}arka prompt edit <id>${c.reset}            ${c.gray}Update a prompt (--content "..." [--title X --category X])${c.reset}
  ${c.white}arka prompt rm <id>${c.reset}            ${c.gray}Delete a prompt${c.reset}

${c.gray}── Link & Bookmark Hub ───────────────────────────────────────${c.reset}
  ${c.white}arka link ls${c.reset}                   ${c.gray}List all saved links & bookmarks${c.reset}
  ${c.white}arka link show <id>${c.reset}            ${c.gray}Show full details of a saved link${c.reset}
  ${c.white}arka link search <keyword>${c.reset}     ${c.gray}Search links by title, URL, or tags${c.reset}
  ${c.white}arka link add "<url>"${c.reset}          ${c.gray}Add link (--title X --category X --desc X)${c.reset}
  ${c.white}arka link open <id>${c.reset}            ${c.gray}Open saved link in browser${c.reset}
  ${c.white}arka link rm <id>${c.reset}              ${c.gray}Delete a link${c.reset}

${c.gray}── AI Features (Groq + Gemini) ───────────────────────────────${c.reset}
  ${c.white}arka ask "<query>"${c.reset}            ${c.gray}Ask ARKA anything in natural language${c.reset}
  ${c.white}arka analyze <id_or_name>${c.reset}    ${c.gray}Re-analyze a file with AI (updates tags & description)${c.reset}
  ${c.white}arka ai-status${c.reset}               ${c.gray}Check which AI providers are active${c.reset}

${c.gray}── Search & Config ───────────────────────────────────────────${c.reset}
  ${c.white}arka search <query>${c.reset}            ${c.gray}Search files, metadata tags, and prompts${c.reset}
  ${c.white}arka config set-url <url>${c.reset}      ${c.gray}Set ARKA Core API address (useful for Termux)${c.reset}
  ${c.white}arka config show${c.reset}               ${c.gray}Show current target API address${c.reset}

${c.gray}── Server & Setup ────────────────────────────────────────────${c.reset}
  ${c.white}arka start${c.reset}                     ${c.gray}Start ARKA Core in the background (--foreground, --port N)${c.reset}
  ${c.white}arka stop${c.reset}                      ${c.gray}Stop the ARKA Core running on the target port${c.reset}
  ${c.white}arka install${c.reset}                   ${c.gray}Add ARKA to PATH so 'arka' works from any folder${c.reset}

${c.gray}── Panduan (Bahasa Indonesia) ────────────────────────────────${c.reset}
  ${c.white}arka guide${c.reset}                     ${c.gray}Daftar topik panduan pemakaian${c.reset}
  ${c.white}arka guide <topik>${c.reset}              ${c.gray}Detail topik: mulai, upload, inbox, file, trash, prompt, search, ai, termux${c.reset}
  ${c.white}arka ask "cara pakai ..."${c.reset}        ${c.gray}Tanya AI ARKA, jawaban berdasarkan dokumentasi resmi${c.reset}

${c.gray}Tip: 'arka' tanpa perintah = 'arka status'. Mulai dari 'arka guide'.${c.reset}
`);
}

// ── MIME helpers (kept local: the CLI runs standalone on Termux with zero deps) ─
const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv',
  '.json': 'application/json', '.xml': 'application/xml', '.html': 'text/html', '.css': 'text/css',
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/typescript', '.py': 'text/x-python',
  '.sql': 'application/sql', '.sh': 'text/x-shellscript', '.zip': 'application/zip'
};

/** Guess a MIME type from the file extension (browser clients send this too). */
function guessMime(filename = '') {
  return MIME_BY_EXT[path.extname(String(filename)).toLowerCase()] || 'application/octet-stream';
}

/** Recursively collect files from a directory (README promises "whole folder"). */
function collectFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, acc);
    else if (entry.isFile()) acc.push(full);
  }
  return acc;
}

/** Always work with an array, even when the API omits `data`. */
function listOf(response) {
  return Array.isArray(response?.data) ? response.data : [];
}

/** Prompt the user for a line of input (works in CMD, PowerShell and Termux). */
async function ask(question) {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function api(endpoint, options = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, options);
  } catch (err) {
    console.error(`\n${c.white}${c.bold}[ERROR] Connection failed:${c.reset} Cannot reach ARKA Core at ${c.white}${API_BASE}${c.reset}`);
    console.error(`  ${c.gray}• On PC: run 'arka start' (or 'npm run server' in the ARKA directory)${c.reset}`);
    console.error(`  ${c.gray}• On Termux: run 'arka config set-url http://<PC_LOCAL_IP>:5000/api'${c.reset}\n`);
    process.exit(1);
  }

  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = null; // e.g. an HTML error page from a proxy
  }

  if (!json) {
    const reason = res.status === 413
      ? 'file too large for the server upload limit'
      : `HTTP ${res.status} ${res.statusText}`.trim();
    return { success: false, error: `Unexpected server response (${reason})` };
  }

  // Normalise transport-level failures into the same { success:false, error } shape
  if (!res.ok && json.success !== false) {
    return { ...json, success: false, error: json.error || `HTTP ${res.status} ${res.statusText}`.trim() };
  }

  return json;
}

// Windows native File Explorer picker using PowerShell
function openWindowsNativePicker() {
  try {
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms;
      $dialog = New-Object System.Windows.Forms.OpenFileDialog;
      $dialog.Multiselect = $true;
      $dialog.Title = 'ARKA — Select Files to Upload';
      $dialog.Filter = 'All Files (*.*)|*.*|Images (*.png;*.jpg;*.webp)|*.png;*.jpg;*.webp|Videos (*.mp4;*.mkv)|*.mp4;*.mkv|Documents (*.pdf;*.docx;*.txt)|*.pdf;*.docx;*.txt';
      if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $dialog.FileNames -join '|'
      }
    `.replace(/\r?\n/g, ' ');

    let output = '';
    for (const shell of ['powershell', 'pwsh']) {
      try {
        output = execSync(`${shell} -NoProfile -Command "${psScript}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        break;
      } catch {
        // try the next PowerShell flavour (Windows PowerShell vs PowerShell 7)
      }
    }

    if (!output) return [];
    return output.split('|').map(p => p.trim()).filter(Boolean);
  } catch (err) {
    console.warn(`${c.gray}[WARN] Could not launch GUI file picker: ${err.message}${c.reset}`);
    return [];
  }
}

/** Open target URL in user's default web browser across platforms */
function openBrowser(url) {
  const platform = os.platform();
  try {
    if (platform === 'win32') {
      execSync(`start "" "${url}"`, { shell: 'cmd.exe', stdio: 'ignore' });
    } else if (platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    }
  } catch (err) {
    // If auto-open fails, CLI output will provide the manual link
  }
}

// Upload implementation using native fetch + FormData
async function uploadFiles(filePaths, options = {}) {
  if (!filePaths || filePaths.length === 0) {
    console.log(`${c.gray}[INFO] Upload cancelled: no files selected.${c.reset}`);
    return;
  }

  console.log(`\n${c.white}Uploading ${filePaths.length} file(s) to ARKA...${c.reset}`);

  const formData = new FormData();
  let validFilesCount = 0;

  if (options.project) {
    formData.append('project', options.project);
    console.log(`  ${c.gray}Target Project : ${c.white}${options.project}${c.reset}`);
  }
  if (options.inbox) {
    formData.append('inbox', 'true');
    console.log(`  ${c.gray}Destination    : ${c.white}Inbox${c.reset}`);
  }

  for (const fpath of filePaths) {
    const resolved = path.resolve(fpath);
    if (!fs.existsSync(resolved)) {
      console.error(`  ${c.white}[!] File not found:${c.reset} ${c.gray}${resolved}${c.reset}`);
      continue;
    }

    const stat = fs.statSync(resolved);
    const paths = stat.isDirectory() ? collectFiles(resolved) : [resolved];
    if (stat.isDirectory()) {
      console.log(`  ${c.gray}Scanning folder: ${path.basename(resolved)} (${paths.length} file(s))${c.reset}`);
    }

    for (const filePath of paths) {
      const buffer = fs.readFileSync(filePath);
      const filename = path.basename(filePath);
      // Send the real MIME type so the server stores accurate metadata
      formData.append('files', new Blob([buffer], { type: guessMime(filename) }), filename);
      validFilesCount++;
      console.log(`  ${c.gray}+ Added:${c.reset} ${filename} ${c.gray}(${formatBytes(buffer.length)})${c.reset}`);
    }
  }

  if (validFilesCount === 0) {
    console.log(`${c.white}[!] No valid files found to upload.${c.reset}`);
    return;
  }

  const queryParams = new URLSearchParams();
  if (options.project) queryParams.set('project', options.project);
  if (options.inbox) queryParams.set('inbox', 'true');

  const res = await api(`/files/upload?${queryParams.toString()}`, {
    method: 'POST',
    body: formData
  });

  if (res.success) {
    console.log(`\n${c.white}[OK] Upload complete: ${res.data?.length || 0} file(s) stored.${c.reset}`);
    res.data?.forEach(f => {
      console.log(`  → ${idTag(f.id)} ${f.original_name} ${c.gray}(${f.typeCategory})${c.reset}`);
    });
  } else {
    console.error(`\n${c.white}[ERROR] Upload failed:${c.reset} ${res.error}`);
  }
}

// ── Local server helpers (arka start / stop / install) ───────────────────────
// Paths come from this file's own location, so every command works no matter
// which folder the terminal was opened in.
const SERVER_ENTRY = path.join(PROJECT_ROOT, 'server', 'index.js');
const RUNTIME_DIR = path.join(PROJECT_ROOT, 'storage', 'logs');
const PID_FILE = path.join(RUNTIME_DIR, 'server.pid');
const LOG_FILE = path.join(RUNTIME_DIR, 'server.log');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Port the CLI is talking to — used to locate the server process. */
function apiPort(fallback = 5000) {
  try {
    return Number(new URL(API_BASE).port) || fallback;
  } catch {
    return fallback;
  }
}

/** The /status payload when ARKA Core answers, otherwise null. */
async function probeServer(timeoutMs = 900) {
  try {
    const res = await fetch(`${API_BASE}/status`, { signal: AbortSignal.timeout(timeoutMs) });
    const json = await res.json().catch(() => null);
    return json?.success ? (json.data || {}) : null;
  } catch {
    return null;
  }
}

/** Last N lines of a file — shown when a background start-up fails. */
function tailFile(file, lines = 10) {
  try {
    return fs.readFileSync(file, 'utf8').trimEnd().split(/\r?\n/).slice(-lines);
  } catch {
    return [];
  }
}

function readPidFile() {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcess(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    return true;
  } catch (err) {
    console.error(`${c.gray}[WARN] Could not stop PID ${pid}: ${err.message}${c.reset}`);
    return false;
  }
}

/** PIDs listening on `port` (best effort — empty list when tools are missing). */
function listenersOn(port) {
  const pids = new Set();
  try {
    if (process.platform === 'win32') {
      for (const line of execSync('netstat -ano', { encoding: 'utf8' }).split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5 || !/LISTENING/i.test(parts[3])) continue;
        if (parts[1].endsWith(`:${port}`)) pids.add(Number(parts[parts.length - 1]));
      }
    } else {
      execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' })
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach(pid => pids.add(Number(pid)));
    }
  } catch {
    // Nothing listening, or netstat/lsof unavailable — not an error.
  }
  return [...pids];
}

/** Guard so 'arka stop' never kills an unrelated service that grabbed the port. */
function isNodeProcess(pid) {
  try {
    if (process.platform === 'win32') {
      return /node(\.exe)?"/i.test(execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' }));
    }
    return /node/i.test(execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' }));
  } catch {
    return false;
  }
}

/** Run a PowerShell one-liner (used by 'arka install' to edit the user PATH). */
function runPowerShell(script) {
  return execSync(`powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`, {
    encoding: 'utf8'
  }).trim();
}


async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  switch (command) {
    case 'status': {
      printBanner();
      const res = await api('/status');
      if (!res.success) {
        console.error(`${c.white}[ERROR] Could not read workspace status: ${res.error}${c.reset}`);
        break;
      }

      const { stats = {}, breakdown = {}, uptimeSeconds = 0, platform = 'unknown' } = res.data || {};
      console.log(`${c.white}${c.bold}── ARKA CORE ──────────────────────────────────────────────────${c.reset}`);
      console.log(`  ${c.gray}Status       :${c.reset} ${c.white}${c.bold}[ONLINE]${c.reset}`);
      console.log(`  ${c.gray}Connected API:${c.reset} ${c.light}${API_BASE}${c.reset}`);
      console.log(`  ${c.gray}System Info  :${c.reset} ${c.light}${platform} · Uptime: ${uptimeSeconds}s${c.reset}`);
      console.log();
      console.log(`${c.white}${c.bold}── WORKSPACE SUMMARY ──────────────────────────────────────────${c.reset}`);
      console.log(`  ${c.gray}Total Files  :${c.reset} ${c.white}${c.bold}${stats.totalFiles ?? 0}${c.reset} ${c.gray}(${formatBytes(stats.totalBytes ?? 0)})${c.reset}`);
      console.log(`  ${c.gray}Inbox        :${c.reset} ${c.white}${stats.inboxFiles ?? 0}${c.reset} ${c.gray}pending triage${c.reset}`);
      console.log(`  ${c.gray}Folders      :${c.reset} ${c.white}${stats.folders ?? 0}${c.reset}`);
      console.log(`  ${c.gray}Prompts      :${c.reset} ${c.white}${stats.prompts ?? 0}${c.reset}`);
      console.log(`  ${c.gray}Links        :${c.reset} ${c.white}${stats.links ?? 0}${c.reset}`);
      console.log(`  ${c.gray}Trash        :${c.reset} ${c.white}${stats.trash ?? 0}${c.reset} ${c.gray}items${c.reset}`);
      console.log();
      console.log(`${c.white}${c.bold}── STORAGE BREAKDOWN ──────────────────────────────────────────${c.reset}`);
      const entries = Object.entries(breakdown).filter(([, data]) => data.count > 0);
      if (entries.length === 0) {
        console.log(`  ${c.gray}No files yet — upload files with 'arka upload <file>'${c.reset}`);
      } else {
        entries.forEach(([cat, data]) => {
          console.log(`  ${c.gray}•${c.reset} ${c.white}${cat.padEnd(12)}${c.reset}: ${String(data.count).padStart(3)} file(s)  ${c.gray}(${formatBytes(data.bytes)})${c.reset}`);
        });
      }
      console.log(`${c.gray}───────────────────────────────────────────────────────────────${c.reset}\n`);
      break;
    }

    case 'ls': {
      const folderTarget = args[1];
      const [foldersRes, filesRes] = await Promise.all([api('/folders'), api('/files')]);

      if (!foldersRes.success || !filesRes.success) {
        console.error(`${c.white}[ERROR] ${foldersRes.error || filesRes.error || 'Could not list workspace'}${c.reset}`);
        return;
      }

      const folders = listOf(foldersRes);
      const files = listOf(filesRes);

      if (folderTarget) {
        const matched = folders.find(f => f.name.toLowerCase() === folderTarget.toLowerCase() || f.id === Number(folderTarget));
        if (!matched) {
          console.log(`${c.white}[!] Folder "${folderTarget}" not found.${c.reset}`);
          return;
        }
        console.log(`\n${c.white}${c.bold}── Folder: ${matched.path || matched.name}/ ────────────────────────${c.reset}\n`);
        const folderFiles = files.filter(f => f.folder_id === matched.id);
        if (folderFiles.length === 0) {
          console.log(`  ${c.gray}(empty folder)${c.reset}\n`);
        } else {
          folderFiles.forEach(f => {
            console.log(`  ${idTag(f.id)} ${f.original_name.padEnd(30)} ${formatBytes(f.size).padStart(10)}  ${c.gray}[${f.typeCategory}]${c.reset}`);
          });
          console.log();
        }
        return;
      }

      console.log(`\n${c.white}${c.bold}── WORKSPACE EXPLORER ─────────────────────────────────────────${c.reset}\n`);

      // Render the full folder tree (any depth)
      const renderTree = (parentId, indent) => {
        folders
          .filter(f => (f.parent_id ?? null) === parentId)
          .forEach(f => {
            const count = f.file_count ?? files.filter(x => x.folder_id === f.id).length;
            console.log(`${indent}${c.white}${f.name}/${c.reset} ${c.gray}(${count} files)${c.reset}`);
            renderTree(f.id, `${indent}   `);
          });
      };
      renderTree(null, '  ');

      // Show root files
      const rootFiles = files.filter(f => !f.folder_id && !f.is_inbox);
      if (rootFiles.length > 0) {
        console.log(`\n${c.gray}── Root Files ──${c.reset}`);
        rootFiles.forEach(f => {
          console.log(`  ${idTag(f.id)} ${f.original_name.padEnd(28)} ${c.gray}(${formatBytes(f.size)})${c.reset}`);
        });
      }
      console.log();
      break;
    }

    case 'inbox': {
      const res = await api('/inbox');
      const items = listOf(res);
      console.log(`\n${c.white}${c.bold}── INBOX (${res.count ?? items.length} items awaiting triage) ──────────────────────────${c.reset}\n`);

      if (items.length === 0) {
        console.log(`  ${c.gray}[OK] Inbox is completely clear.${c.reset}\n`);
      } else {
        items.forEach(f => {
          console.log(`  ${idTag(f.id)} ${f.original_name.padEnd(30)} ${formatBytes(f.size).padStart(10)}  ${c.gray}[${f.typeCategory}]${c.reset}`);
        });
        console.log(`\n${c.gray}Tip: Run '${c.white}arka triage${c.gray}' to sort them or '${c.white}arka move <id> <folder>${c.gray}'.${c.reset}\n`);
      }
      break;
    }

    case 'triage': {
      const inboxRes = await api('/inbox');
      const items = listOf(inboxRes);

      console.log(`\n${c.white}${c.bold}── ARKA TRIAGE (${items.length} file(s) in inbox) ───────────────────────${c.reset}\n`);

      if (items.length === 0) {
        console.log(`  ${c.gray}[OK] Nothing to triage — inbox is empty.${c.reset}\n`);
        return;
      }

      let moved = 0;
      let skipped = 0;

      // Fetch folders once up front — avoids N+1 API calls inside the loop
      const cachedFolders = listOf(await api('/folders'));

      for (let i = 0; i < items.length; i++) {
        const file = items[i];
        const suggestion = file.project || '';
        const category = file.category || file.typeCategory || 'Other';

        console.log(`${c.white}${c.bold}[${i + 1}/${items.length}]${c.reset} ${idTag(file.id)} ${c.white}${file.original_name}${c.reset} ${c.gray}(${category}, ${formatBytes(file.size)})${c.reset}`);
        if (file.description) console.log(`   ${c.gray}${String(file.description).slice(0, 90)}${c.reset}`);
        if (suggestion) console.log(`   ${c.light}AI suggestion: ${suggestion}${c.reset}`);

        const hint = suggestion ? `${c.gray}[Enter = accept "${suggestion}"]${c.reset} ` : '';
        let answer = await ask(`   Destination folder ${hint}${c.gray}[s = skip, q = quit]${c.reset}: `);

        if (answer.toLowerCase() === 'q') {
          console.log(`\n${c.white}[INFO] Triage stopped.${c.reset} ${c.gray}${moved} file(s) sorted, ${skipped} skipped.${c.reset}\n`);
          return;
        }
        if (answer.toLowerCase() === 's' || answer === '-' ) {
          skipped++;
          console.log(`   ${c.gray}→ skipped${c.reset}\n`);
          continue;
        }
        if (!answer) {
          if (!suggestion) {
            console.log(`   ${c.gray}[WARN] No suggestion available — type a folder name or 's' to skip.${c.reset}\n`);
            i--;
            continue;
          }
          answer = suggestion;
        }

        // Accept either a folder id or a name/path (resolved & auto-created server-side)
        const body = /^\d+$/.test(answer) && cachedFolders.some(f => f.id === Number(answer))
          ? { folder_id: Number(answer) }
          : { project_name: answer };

        const res = await api(`/inbox/${file.id}/organize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (res.success) {
          moved++;
          console.log(`   ${c.white}[OK] → ${res.folder?.path || answer}${c.reset}\n`);
        } else {
          console.log(`   ${c.white}[ERROR] ${res.error}${c.reset}\n`);
        }
      }

      console.log(`${c.white}[OK] Triage complete:${c.reset} ${moved} sorted, ${skipped} skipped.\n`);
      break;
    }

    case 'info': {
      const targetIdentifier = args[1];
      if (!targetIdentifier) {
        console.error(`${c.white}[ERROR] Usage: arka info <id_or_name>${c.reset}`);
        return;
      }
      const res = await api(`/files/${encodeURIComponent(targetIdentifier)}`);
      if (!res.success) {
        console.error(`${c.white}[!] File "${targetIdentifier}" not found.${c.reset}`);
        return;
      }
      const f = res.data;
      console.log(`\n${c.white}${c.bold}── FILE INFORMATION ───────────────────────────────────────────${c.reset}`);
      console.log(`  ${c.gray}ID         :${c.reset} ${idTag(f.id)}`);
      console.log(`  ${c.gray}Name       :${c.reset} ${c.white}${f.original_name}${c.reset}`);
      console.log(`  ${c.gray}Category   :${c.reset} ${c.white}${f.typeCategory}${c.reset}`);
      console.log(`  ${c.gray}MIME Type  :${c.reset} ${c.light}${f.mime_type}${c.reset}`);
      console.log(`  ${c.gray}Size       :${c.reset} ${formatBytes(f.size)} (${f.size} bytes)`);
      console.log(`  ${c.gray}Location   :${c.reset} ${f.is_inbox ? 'Inbox' : (f.folder_name || 'Root')}`);
      console.log(`  ${c.gray}Path       :${c.reset} storage/${f.path}`);
      console.log(`  ${c.gray}Created At :${c.reset} ${f.created_at}`);
      if (f.description) console.log(`  ${c.gray}Description:${c.reset} ${f.description}`);
      if (f.project)     console.log(`  ${c.gray}Project    :${c.reset} ${f.project}`);
      if (f.tags)        console.log(`  ${c.gray}Tags       :${c.reset} ${f.tags}`);
      console.log();
      break;
    }

    case 'view':
    case 'cat': {
      const targetIdentifier = args[1];
      if (!targetIdentifier) {
        console.error(`${c.white}[ERROR] Usage: arka view <id_or_name>${c.reset}`);
        return;
      }
      const res = await api(`/files/${encodeURIComponent(targetIdentifier)}`);
      if (!res.success) {
        console.error(`${c.white}[!] File "${targetIdentifier}" not found.${c.reset}`);
        return;
      }
      const f = res.data;

      // Binary/archives would flood the terminal with garbage bytes
      if (!['Code', 'Document', 'Other'].includes(f.typeCategory)) {
        console.error(`${c.white}[!] "${f.original_name}" is a ${f.typeCategory} file — cannot print it as text.${c.reset}`);
        console.log(`  ${c.gray}Use '${c.white}arka download ${f.original_name}${c.gray}' or check /storage/${f.path}${c.reset}\n`);
        return;
      }

      const MAX_VIEW_BYTES = 512 * 1024;
      if (f.size > MAX_VIEW_BYTES) {
        console.log(`${c.gray}[WARN] Large file (${formatBytes(f.size)}) — showing first ${formatBytes(MAX_VIEW_BYTES)} only.${c.reset}`);
      }

      const downloadRes = await fetch(`${API_BASE}/files/${f.id}/download`);
      if (!downloadRes.ok) {
        console.error(`${c.white}[ERROR] Failed to fetch file content (HTTP ${downloadRes.status}).${c.reset}`);
        return;
      }
      const text = await downloadRes.text();
      console.log(`\n${c.gray}── [ ${f.original_name} ] ──────────────────────────────────────────${c.reset}\n`);
      console.log(f.size > MAX_VIEW_BYTES ? `${text.slice(0, MAX_VIEW_BYTES)}\n${c.gray}... [truncated]${c.reset}` : text);
      console.log(`\n${c.gray}──────────────────────────────────────────────────────────────────${c.reset}\n`);
      break;
    }

    case 'mkdir': {
      const folderPath = args[1];
      if (!folderPath) {
        console.error(`${c.white}[ERROR] Folder path required. Example: arka mkdir "Instagram/Mobile App"${c.reset}`);
        return;
      }
      const res = await api('/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path_str: folderPath })
      });
      if (res.success) {
        console.log(`${c.white}[OK] Created folder: "${folderPath}" (ID: ${res.data.id})${c.reset}`);
      } else {
        console.error(`${c.white}[ERROR] Failed: ${res.error}${c.reset}`);
      }
      break;
    }

    case 'upload': {
      let fileArgs = [];
      let project = null;
      let inbox = false;
      let forceNative = false;

      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--project' || args[i] === '-p') {
          project = args[++i];
        } else if (args[i] === '--inbox' || args[i] === '-i') {
          inbox = true;
        } else if (args[i] === '--native' || args[i] === '--picker') {
          forceNative = true;
        } else {
          fileArgs.push(args[i]);
        }
      }

      if (fileArgs.length > 0) {
        // Direct CLI file upload
        await uploadFiles(fileArgs, { project, inbox });
      } else if (forceNative) {
        // Fallback to native OS dialog
        if (os.platform() === 'win32') {
          console.log(`${c.white}Opening Windows File Explorer dialog...${c.reset}`);
          const selected = openWindowsNativePicker();
          if (selected.length > 0) {
            await uploadFiles(selected, { project, inbox });
          }
        } else {
          console.log(`${c.gray}[WARN] Native picker is only available on Windows. Use: arka upload <files...>${c.reset}`);
        }
      } else {
        // Launch Interactive Multi-Channel Web Portal
        let webUrl = 'http://localhost:5000/upload';
        try {
          const parsed = new URL(API_BASE);
          webUrl = `${parsed.protocol}//${parsed.host}/upload`;
        } catch {}

        console.log(`\n${c.white}${c.bold}── ARKA INGEST & UPLOAD HUB ───────────────────────────────────${c.reset}`);
        console.log(`  ${c.white}1.${c.reset} File Ingest       ${c.gray}→ Workspace / Folder / Inbox${c.reset}`);
        console.log(`  ${c.white}2.${c.reset} Notes & Prompts   ${c.gray}→ Prompt & Knowledge Hub${c.reset}`);
        console.log(`  ${c.white}3.${c.reset} Links & Bookmarks ${c.gray}→ Link Hub (Sorted Separately)${c.reset}`);
        console.log(`\n${c.white}Opening interactive portal in browser...${c.reset}`);
        console.log(`  Portal URL: ${c.white}${webUrl}${c.reset}\n`);

        openBrowser(webUrl);

        console.log(`  ${c.gray}Tip: Upload via terminal: arka upload <file_path>${c.reset}`);
        console.log(`  ${c.gray}Tip: Native file picker : arka upload --native${c.reset}\n`);
      }
      break;
    }

    case 'move': {
      const targetIdentifier = args[1];
      const target = args[2];
      if (!targetIdentifier || !target) {
        console.error(`${c.white}[ERROR] Usage: arka move <file_id_or_name> <target_folder_or_path>${c.reset}`);
        return;
      }

      // Resolve file ID from name if necessary
      let fileId = targetIdentifier;
      let currentFile = null;
      if (!/^\d+$/.test(String(targetIdentifier))) {
        const fileRes = await api(`/files/${encodeURIComponent(targetIdentifier)}`);
        if (!fileRes.success || !fileRes.data) {
          console.error(`${c.white}[!] File "${targetIdentifier}" not found.${c.reset}`);
          return;
        }
        currentFile = fileRes.data;
        fileId = currentFile.id;
      }

      // Resolve destination folder id
      const folders = listOf(await api('/folders'));
      let destFolderId = null;
      if (/^\d+$/.test(String(target)) && folders.some(f => f.id === Number(target))) {
        destFolderId = Number(target);
      } else {
        // Attempt to match by name first, then let server create it
        const matched = folders.find(f => f.name.toLowerCase() === target.toLowerCase());
        if (matched) {
          destFolderId = matched.id;
        } else {
          const mkRes = await api('/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path_str: target })
          });
          if (!mkRes.success || !mkRes.data?.id) {
            console.error(`${c.white}[ERROR] Could not resolve or create folder "${target}": ${mkRes.error}${c.reset}`);
            return;
          }
          destFolderId = mkRes.data.id;
        }
      }

      // Use PATCH /files/:id to move the file
      const res = await api(`/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: destFolderId, is_inbox: 0 })
      });

      if (res.success) {
        const destName = folders.find(f => f.id === destFolderId)?.name || target;
        console.log(`${c.white}[OK] File [#${fileId}] moved to "${destName}".${c.reset}`);
      } else {
        console.error(`${c.white}[ERROR] Move failed: ${res.error}${c.reset}`);
        console.error(`  ${c.gray}Tip: 'arka ls' to see existing folders.${c.reset}`);
      }
      break;
    }

    case 'rm': {
      const targetIdentifier = args[1];
      const isPermanent = args.includes('--permanent');
      if (!targetIdentifier) {
        console.error(`${c.white}[ERROR] Usage: arka rm <file_id_or_name> [--permanent]${c.reset}`);
        return;
      }

      let fileId = targetIdentifier;
      if (!/^\d+$/.test(String(targetIdentifier))) {
        const fileRes = await api(`/files/${encodeURIComponent(targetIdentifier)}`);
        if (!fileRes.success || !fileRes.data) {
          console.error(`${c.white}[!] File "${targetIdentifier}" not found.${c.reset}`);
          return;
        }
        fileId = fileRes.data.id;
      }

      const res = await api(`/files/${fileId}?permanent=${isPermanent}`, { method: 'DELETE' });
      if (res.success) {
        console.log(`${c.white}[OK] ${res.message}${c.reset}`);
      } else {
        console.error(`${c.white}[ERROR] Delete failed: ${res.error}${c.reset}`);
      }
      break;
    }

    case 'restore': {
      const targetIdentifier = args[1];
      if (!targetIdentifier) {
        console.error(`${c.white}[ERROR] Usage: arka restore <file_id_or_name>${c.reset}`);
        return;
      }

      let fileId = targetIdentifier;
      if (!/^\d+$/.test(String(targetIdentifier))) {
        const fileRes = await api(`/files/${encodeURIComponent(targetIdentifier)}`);
        if (!fileRes.success || !fileRes.data) {
          console.error(`${c.white}[!] File "${targetIdentifier}" not found.${c.reset}`);
          return;
        }
        fileId = fileRes.data.id;
      }

      const res = await api(`/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_trash: 0 })
      });
      if (res.success) {
        console.log(`${c.white}[OK] Restored "${res.data.original_name}" from trash.${c.reset}`);
      } else {
        console.error(`${c.white}[ERROR] Restore failed: ${res.error}${c.reset}`);
      }
      break;
    }

    case 'trash': {
      const sub = args[1];
      if (sub === 'empty') {
        const res = await api('/trash', { method: 'DELETE' });
        if (res.success) {
          console.log(`${c.white}[OK] ${res.message}${c.reset}`);
        } else {
          console.error(`${c.white}[ERROR] Failed: ${res.error}${c.reset}`);
        }
        return;
      }

      if (sub) {
        const subSuggestion = findClosestCommand(sub, ['empty']);
        console.error(`\n${c.white}[ERROR] 'arka trash ${sub}' is an unknown subcommand.${c.reset}`);
        if (subSuggestion) {
          console.log(`\n  Did you mean: ${c.white}${c.bold}arka trash ${subSuggestion}${c.reset}?`);
        }
        console.log(`\n${c.gray}Use 'arka trash' to list trash or 'arka trash empty' to clear.${c.reset}\n`);
        return;
      }

      const res = await api('/files?trash=true');
      if (!res.success) {
        console.error(`${c.white}[ERROR] Failed to list trash: ${res.error}${c.reset}`);
        break;
      }

      const items = listOf(res);
      console.log(`\n${c.white}${c.bold}── TRASH (${res.count ?? items.length} items) ─────────────────────────────────${c.reset}\n`);
      if (items.length === 0) {
        console.log(`  ${c.gray}(trash is empty)${c.reset}\n`);
      } else {
        items.forEach(f => {
          console.log(`  ${idTag(f.id)} ${f.original_name.padEnd(30)} ${formatBytes(f.size).padStart(10)}`);
        });
        console.log(`\n${c.gray}Tip: Run '${c.white}arka restore <id>${c.gray}' or '${c.white}arka trash empty${c.gray}'${c.reset}\n`);
      }
      break;
    }

    case 'download': {
      const targetIdentifier = args[1];
      const outDir = args[2] || process.cwd();
      if (!targetIdentifier) {
        console.error(`${c.white}[ERROR] Usage: arka download <file_id_or_name> [output_directory]${c.reset}`);
        return;
      }

      const fileMeta = await api(`/files/${encodeURIComponent(targetIdentifier)}`);
      if (!fileMeta.success) {
        console.error(`${c.white}[!] File "${targetIdentifier}" not found.${c.reset}`);
        return;
      }

      const fileInfo = fileMeta.data;
      const downloadUrl = `${API_BASE}/files/${fileInfo.id}/download`;
      console.log(`Downloading ${fileInfo.original_name}...`);

      const res = await fetch(downloadUrl);
      if (!res.ok) {
        console.error(`${c.white}[ERROR] Download failed (HTTP ${res.status} ${res.statusText})${c.reset}`);
        return;
      }

      // Create the target directory and never overwrite an existing local file
      const dir = path.resolve(outDir);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const ext = path.extname(fileInfo.original_name);
      const base = path.basename(fileInfo.original_name, ext);
      let savePath = path.join(dir, fileInfo.original_name);
      for (let n = 1; fs.existsSync(savePath); n++) {
        savePath = path.join(dir, `${base} (${n})${ext}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      fs.writeFileSync(savePath, Buffer.from(arrayBuffer));
      console.log(`${c.white}[OK] Saved to: ${savePath}${c.reset}`);
      break;
    }

    case 'search': {
      const query = args.slice(1).join(' ');
      if (!query) {
        console.error(`${c.white}[ERROR] Usage: arka search <keyword>${c.reset}`);
        return;
      }
      const [filesRes, promptsRes, linksRes] = await Promise.all([
        api(`/files?search=${encodeURIComponent(query)}`),
        api(`/prompts?search=${encodeURIComponent(query)}`),
        api(`/links?search=${encodeURIComponent(query)}`)
      ]);

      const files = listOf(filesRes);
      const prompts = listOf(promptsRes);
      const links = listOf(linksRes);

      console.log(`\n${c.white}${c.bold}── SEARCH RESULTS: "${query}" ────────────────────────────────${c.reset}\n`);
      if (files.length > 0) {
        console.log(`${c.white}Files (${files.length}):${c.reset}`);
        files.forEach(f => {
          console.log(`  • ${idTag(f.id)} ${f.original_name.padEnd(25)} ${c.gray}(${f.typeCategory}) - ${f.folder_name || 'Inbox/Root'}${c.reset}`);
        });
      }

      if (prompts.length > 0) {
        console.log(`\n${c.white}Prompts (${prompts.length}):${c.reset}`);
        prompts.forEach(p => {
          console.log(`  • [#${p.id}] "${p.title}" ${c.gray}[${p.category}]${c.reset}`);
        });
      }

      if (links.length > 0) {
        console.log(`\n${c.white}Links (${links.length}):${c.reset}`);
        links.forEach(l => {
          console.log(`  • [#${l.id}] "${l.title || l.domain || l.url}" ${c.gray}[${l.category}]${c.reset} → ${c.white}${l.url}${c.reset}`);
        });
      }

      if (files.length === 0 && prompts.length === 0 && links.length === 0) {
        console.log(`  ${c.gray}No matching files, prompts, or links found.${c.reset}`);
      }
      console.log();
      break;
    }

    case 'prompt': {
      const sub = args[1] || 'ls';

      // --content "text" --category X --tags a,b --title "text"
      const parseFlags = (from = 2) => {
        const flags = {};
        const positional = [];
        for (let i = from; i < args.length; i++) {
          if (args[i] === '--content' || args[i] === '-c') flags.content = args[++i];
          else if (args[i] === '--title' || args[i] === '-t') flags.title = args[++i];
          else if (args[i] === '--category' || args[i] === '-C') flags.category = args[++i];
          else if (args[i] === '--tags') flags.tags = args[++i];
          else positional.push(args[i]);
        }
        return { flags, positional };
      };

      if (sub === 'ls') {
        const res = await api('/prompts');
        const prompts = listOf(res);
        console.log(`\n${c.white}${c.bold}── SAVED PROMPTS (${prompts.length}) ───────────────────────────────────────${c.reset}\n`);
        if (prompts.length === 0) {
          console.log(`  ${c.gray}No prompts found. Add one with: arka prompt add "<title>" --content "..."${c.reset}\n`);
        } else {
          prompts.forEach(p => {
            const preview = p.content.length > 80 ? p.content.slice(0, 80) + '...' : p.content;
            console.log(`  ${idTag(p.id)} ${c.white}${p.title}${c.reset} ${c.gray}(${p.category})${c.reset}`);
            console.log(`        "${preview}"`);
          });
          console.log(`\n${c.gray}Tip: Run '${c.white}arka prompt show <id>${c.gray}' to read full prompt.${c.reset}\n`);
        }

      } else if (sub === 'show') {
        const id = args[2];
        const res = await api('/prompts');
        const p = listOf(res).find(item => item.id === Number(id));
        if (!p) {
          console.error(`${c.white}[!] Prompt ID ${id} not found.${c.reset}`);
          return;
        }
        console.log(`\n${c.white}${c.bold}── PROMPT #${p.id}: ${p.title} ────────────────────────────────${c.reset}`);
        console.log(`  ${c.gray}Category :${c.reset} ${p.category}`);
        console.log(`  ${c.gray}Tags     :${c.reset} ${p.tags || 'none'}\n`);
        console.log(p.content);
        console.log(`\n${c.gray}──────────────────────────────────────────────────────────────────${c.reset}\n`);

      } else if (sub === 'add') {
        const { flags, positional } = parseFlags(2);
        const title = flags.title || positional.join(' ');
        if (!title) {
          console.error(`${c.white}[ERROR] Usage: arka prompt add "<title>" [--content "text"] [--category X] [--tags a,b]${c.reset}`);
          return;
        }

        const content = flags.content || `Prompt instructions for ${title}`;
        if (!flags.content) {
          console.log(`${c.gray}[WARN] No --content provided — created placeholder.${c.reset}`);
        }

        const res = await api('/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            content,
            category: flags.category || 'General',
            tags: flags.tags || ''
          })
        });

        if (res.success) {
          console.log(`${c.white}[OK] Prompt "${title}" created (ID: ${res.data.id})${c.reset}`);
          console.log(`  ${c.gray}Update with: arka prompt edit ${res.data.id} --content "..."${c.reset}`);
        } else {
          console.error(`${c.white}[ERROR] ${res.error}${c.reset}`);
        }

      } else if (sub === 'edit') {
        const id = args[2];
        const { flags } = parseFlags(3);
        if (!id || Object.keys(flags).length === 0) {
          console.error(`${c.white}[ERROR] Usage: arka prompt edit <id> [--title "..."] [--content "..."] [--category X] [--tags a,b]${c.reset}`);
          return;
        }

        const res = await api(`/prompts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(flags)
        });

        if (res.success) {
          console.log(`${c.white}[OK] Prompt ID ${id} updated.${c.reset}`);
        } else {
          console.error(`${c.white}[ERROR] ${res.error}${c.reset}`);
        }

      } else if (sub === 'rm') {
        const id = args[2];
        if (!id) {
          console.error(`${c.white}[ERROR] Usage: arka prompt rm <id>${c.reset}`);
          return;
        }
        const res = await api(`/prompts/${id}`, { method: 'DELETE' });
        if (res.success) {
          console.log(`${c.white}[OK] Prompt ID ${id} deleted.${c.reset}`);
        } else {
          console.error(`${c.white}[ERROR] ${res.error}${c.reset}`);
        }

      } else {
        const subSuggestion = findClosestCommand(sub, ['ls', 'show', 'add', 'edit', 'rm']);
        console.error(`\n${c.white}[ERROR] 'arka prompt ${sub}' is an unknown subcommand.${c.reset}`);
        if (subSuggestion) {
          console.log(`\n  Did you mean: ${c.white}${c.bold}arka prompt ${subSuggestion}${c.reset}?`);
        }
        console.log(`\n${c.gray}Available subcommands: ls, show, add, edit, rm${c.reset}\n`);
      }
      break;
    }

    case 'link':
    case 'links': {
      const sub = args[1] || 'ls';

      if (sub === 'ls') {
        const res = await api('/links');
        const links = listOf(res);
        console.log(`\n${c.white}${c.bold}── SAVED LINKS & BOOKMARKS (${links.length}) ─────────────────────────────${c.reset}\n`);
        if (links.length === 0) {
          console.log(`  ${c.gray}No links saved yet. Use 'arka link add <url>' or open portal with 'arka upload'.${c.reset}\n`);
        } else {
          links.forEach(l => {
            console.log(`  ${idTag(l.id)} ${c.white}${l.title || l.domain || l.url}${c.reset} ${c.gray}(${l.category || 'General'})${c.reset}`);
            console.log(`        → ${c.gray}${l.url}${c.reset}`);
            if (l.description) console.log(`        ${c.gray}"${l.description}"${c.reset}`);
          });
          console.log();
        }

      } else if (sub === 'show') {
        const id = args[2];
        if (!id) {
          console.error(`${c.white}[ERROR] Usage: arka link show <id>${c.reset}`);
          return;
        }
        const res = await api(`/links/${id}`);
        if (!res.success || !res.data) {
          console.error(`${c.white}[!] Link ID ${id} not found.${c.reset}`);
          return;
        }
        const l = res.data;
        console.log(`\n${c.white}${c.bold}── LINK #${l.id}: ${l.title || l.domain} ─────────────────────────────${c.reset}`);
        console.log(`  ${c.gray}URL      :${c.reset} ${l.url}`);
        console.log(`  ${c.gray}Domain   :${c.reset} ${l.domain || '-'}`);
        console.log(`  ${c.gray}Category :${c.reset} ${l.category || 'General'}`);
        if (l.description) console.log(`  ${c.gray}Notes    :${c.reset} ${l.description}`);
        if (l.tags)        console.log(`  ${c.gray}Tags     :${c.reset} ${l.tags}`);
        console.log(`  ${c.gray}Saved    :${c.reset} ${l.created_at}\n`);

      } else if (sub === 'search') {
        const query = args.slice(2).join(' ');
        if (!query) {
          console.error(`${c.white}[ERROR] Usage: arka link search <keyword>${c.reset}`);
          return;
        }
        const res = await api(`/links?search=${encodeURIComponent(query)}`);
        const links = listOf(res);
        console.log(`\n${c.white}${c.bold}── LINK SEARCH: "${query}" (${links.length} result(s)) ─────────────────────${c.reset}\n`);
        if (links.length === 0) {
          console.log(`  ${c.gray}No matching links.${c.reset}\n`);
        } else {
          links.forEach(l => {
            console.log(`  ${idTag(l.id)} ${c.white}${l.title || l.domain || l.url}${c.reset} ${c.gray}(${l.category || 'General'})${c.reset}`);
            console.log(`        → ${c.gray}${l.url}${c.reset}`);
          });
          console.log();
        }

      } else if (sub === 'add') {
        let url = args[2];
        let title = '';
        let category = 'General';
        let description = '';
        let tags = '';

        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--title' || args[i] === '-t') title = args[++i];
          else if (args[i] === '--category' || args[i] === '-c') category = args[++i];
          else if (args[i] === '--desc' || args[i] === '-d') description = args[++i];
          else if (args[i] === '--tags') tags = args[++i];
          else if (!url || url.startsWith('-')) url = args[i];
        }

        if (!url) {
          console.error(`${c.white}[ERROR] Usage: arka link add <url> [--title "Title" --category "Dev Tools" --desc "notes"]${c.reset}`);
          return;
        }

        const res = await api('/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, title, category, description, tags })
        });

        if (res.success) {
          console.log(`${c.white}[OK] Link saved: [#${res.data?.id}] ${res.data?.title || url}${c.reset}`);
        } else {
          console.error(`${c.white}[ERROR] Failed to save link: ${res.error}${c.reset}`);
        }

      } else if (sub === 'open') {
        const id = args[2];
        if (!id) {
          console.error(`${c.white}[ERROR] Usage: arka link open <id>${c.reset}`);
          return;
        }
        const res = await api(`/links/${id}`);
        if (!res.success || !res.data) {
          console.error(`${c.white}[!] Link ID ${id} not found.${c.reset}`);
          return;
        }
        console.log(`${c.white}Opening: ${res.data.url}${c.reset}`);
        openBrowser(res.data.url);

      } else if (sub === 'rm') {
        const id = args[2];
        if (!id) {
          console.error(`${c.white}[ERROR] Usage: arka link rm <id>${c.reset}`);
          return;
        }
        const res = await api(`/links/${id}`, { method: 'DELETE' });
        if (res.success) {
          console.log(`${c.white}[OK] Link ID ${id} deleted.${c.reset}`);
        } else {
          console.error(`${c.white}[ERROR] ${res.error}${c.reset}`);
        }

      } else {
        const subSuggestion = findClosestCommand(sub, ['ls', 'show', 'search', 'add', 'open', 'rm']);
        console.error(`\n${c.white}[ERROR] 'arka link ${sub}' is an unknown subcommand.${c.reset}`);
        if (subSuggestion) {
          console.log(`\n  Did you mean: ${c.white}${c.bold}arka link ${subSuggestion}${c.reset}?`);
        }
        console.log(`\n${c.gray}Available subcommands: ls, show, search, add, open, rm${c.reset}\n`);
      }
      break;
    }

    case 'config': {
      const sub = args[1];
      if (sub === 'set-url') {
        const newUrl = args[2];
        if (!newUrl) {
          console.error(`${c.white}[ERROR] Usage: arka config set-url http://<host>:5000/api${c.reset}`);
          return;
        }
        config.apiUrl = newUrl.replace(/\/+$/, '');
        saveConfig(config);
        console.log(`${c.white}[OK] Saved ARKA API URL: ${config.apiUrl}${c.reset}`);
      } else if (!sub || sub === 'show') {
        console.log(`\n${c.white}${c.bold}── ARKA CONFIGURATION ─────────────────────────────────────────${c.reset}`);
        console.log(`  ${c.gray}Config File :${c.reset} ${CONFIG_FILE}`);
        console.log(`  ${c.gray}Target API  :${c.reset} ${c.white}${API_BASE}${c.reset}\n`);
      } else {
        const subSuggestion = findClosestCommand(sub, ['show', 'set-url']);
        console.error(`\n${c.white}[ERROR] 'arka config ${sub}' is an unknown subcommand.${c.reset}`);
        if (subSuggestion) {
          console.log(`\n  Did you mean: ${c.white}${c.bold}arka config ${subSuggestion}${c.reset}?`);
        }
        console.log(`\n${c.gray}Available subcommands: show, set-url <url>${c.reset}\n`);
      }
      break;
    }

    case 'guide':
    case 'docs':
      printGuide(args[1]);
      break;

    case 'ai-status': {
      const res = await api('/ai/status');
      if (!res.success) {
        console.error(`${c.white}[ERROR] Failed to check AI status: ${res.error}${c.reset}`);
        break;
      }

      const { providers = {}, configured } = res.data || {};
      const line = (p) => (p?.available ? `${c.white}[ONLINE]${c.reset}` : `${c.gray}[OFFLINE]${c.reset}`);

      console.log(`\n${c.white}${c.bold}── ARKA AI STATUS ─────────────────────────────────────────────${c.reset}\n`);

      console.log(`  ${c.white}Groq${c.reset}   : ${line(providers.groq)}`);
      console.log(`           Model : ${providers.groq?.model || '-'}`);
      console.log(`           Role  : ${c.gray}${providers.groq?.role || '-'}${c.reset}`);
      if (providers.groq?.error) console.log(`           Reason: ${providers.groq.error}`);
      console.log();

      console.log(`  ${c.white}Gemini${c.reset} : ${line(providers.gemini)}`);
      console.log(`           Model : ${providers.gemini?.model || '-'}`);
      console.log(`           Role  : ${c.gray}${providers.gemini?.role || '-'}${c.reset}`);
      if (providers.gemini?.error) console.log(`           Reason: ${providers.gemini.error}`);
      console.log();

      if (!configured) {
        console.log(`  ${c.gray}[WARN] No AI provider reachable. Add API keys to .env in root folder.${c.reset}`);
        console.log(`  ${c.gray}GROQ_API_KEY   → https://console.groq.com/keys${c.reset}`);
        console.log(`  ${c.gray}GEMINI_API_KEY → https://aistudio.google.com/apikey${c.reset}\n`);
      }
      break;
    }

    case 'ask': {
      const rawAsk   = args.slice(1);
      const resetMem = rawAsk.some(a => a === '--reset' || a === '--forget');
      const query    = rawAsk.filter(a => a !== '--reset' && a !== '--forget').join(' ');

      if (!query && resetMem) {
        const cleared = await api('/ai/reset', { method: 'POST' });
        console.log(cleared.success
          ? `\n${c.white}[OK] Konteks percakapan AI dibersihkan.${c.reset}\n`
          : `\n${c.white}[ERROR] Gagal membersihkan konteks: ${cleared.error || 'server tidak merespons'}${c.reset}\n`);
        return;
      }

      if (!query) {
        console.error(`${c.white}[ERROR] Usage: arka ask "<natural language query>"${c.reset}`);
        console.log(`\n  Examples:`);
        console.log(`  ${c.gray}arka ask "cari desain mobile app"${c.reset}`);
        console.log(`  ${c.gray}arka ask "rapikan inbox saya"${c.reset}`);
        console.log(`  ${c.gray}arka ask "ada berapa file video di workspace?"${c.reset}`);
        console.log(`  ${c.gray}arka ask "cara pakai arka"${c.reset}`);
        console.log(`  ${c.gray}arka ask --reset                 (lupakan percakapan sebelumnya)${c.reset}\n`);
        return;
      }

      console.log(`\n${c.white}ARKA AI ›${c.reset} ${c.gray}[thinking...]${c.reset}`);
      const res = await api('/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, reset: resetMem })
      });

      if (res.success) {
        const { answer, toolCalled, toolResult, truncated } = res.data;
        
        if (toolCalled && toolCalled !== 'answer') {
          console.log(`  ${c.gray}[tool: ${toolCalled}]${c.reset}`);
        }
        
        console.log(`\n${c.white}${c.bold}ARKA AI:${c.reset}\n${answer}\n`);

        if (truncated) {
          console.log(`  ${c.gray}[WARN] Jawaban terpotong batas token — ajukan pertanyaan lebih spesifik atau jalankan 'arka guide'.${c.reset}\n`);
        }

        // Show search results if files were found
        if (toolCalled === 'search_files' && toolResult?.files?.length > 0) {
          console.log(`${c.white}${c.bold}── Matching Files (${toolResult.count}) ───────────────────────${c.reset}`);
          toolResult.files.forEach(f => {
            const loc = f.folder_name || (f.is_inbox ? 'Inbox' : 'Root');
            console.log(`  • ${idTag(f.id)} ${f.original_name.padEnd(28)} ${c.gray}(${loc})${c.reset}`);
            if (f.description) {
              console.log(`            ${c.gray}${f.description.slice(0, 70)}${c.reset}`);
            }
          });
          console.log();
        }

        // Show prompt results
        if (toolCalled === 'search_prompts' && toolResult?.prompts?.length > 0) {
          console.log(`${c.white}${c.bold}── Matching Prompts (${toolResult.count}) ─────────────────────${c.reset}`);
          toolResult.prompts.forEach(p => {
            console.log(`  • [#${p.id}] ${p.title} ${c.gray}[${p.category}]${c.reset}`);
          });
          console.log();
        }

        // Show inbox items
        if (toolCalled === 'list_inbox' && toolResult?.files?.length > 0) {
          console.log(`${c.white}${c.bold}── Inbox Items (${toolResult.count}) ──────────────────────────${c.reset}`);
          toolResult.files.forEach(f => {
            const cat = f.category || 'Uncategorized';
            console.log(`  • ${idTag(f.id)} ${f.original_name.padEnd(28)} ${c.gray}[${cat}]${c.reset}`);
          });
          console.log(`\n  ${c.gray}Tip: Run '${c.white}arka triage${c.gray}' to organize.${c.reset}\n`);
        }
      } else {
        console.error(`\n${c.white}[ERROR] AI Error:${c.reset} ${res.error}`);
        if (res.error?.includes('API_KEY')) {
          console.log(`  ${c.gray}Run 'arka ai-status' to check AI configuration.${c.reset}\n`);
        }
      }
      break;
    }

    case 'analyze': {
      const targetIdentifier = args[1];
      if (!targetIdentifier) {
        console.error(`${c.white}[ERROR] Usage: arka analyze <id_or_name>${c.reset}`);
        return;
      }

      let fileId = targetIdentifier;
      if (!/^\d+$/.test(String(targetIdentifier))) {
        const fileRes = await api(`/files/${encodeURIComponent(targetIdentifier)}`);
        if (!fileRes.success || !fileRes.data) {
          console.error(`${c.white}[!] File "${targetIdentifier}" not found.${c.reset}`);
          return;
        }
        fileId = fileRes.data.id;
      }

      console.log(`\n${c.white}Analyzing file [#${fileId}] with AI...${c.reset}`);
      const res = await api(`/files/${fileId}/analyze`, { method: 'POST' });

      if (res.success) {
        const metadata = res.metadata || {};
        console.log(`\n${c.white}${c.bold}── AI ANALYSIS RESULT ─────────────────────────────────────────${c.reset}`);
        console.log(`  ${c.gray}Provider   :${c.reset} ${metadata.provider ?? 'unknown'}`);
        console.log(`  ${c.gray}Description:${c.reset} ${metadata.description ?? '—'}`);
        console.log(`  ${c.gray}Topic      :${c.reset} ${metadata.topic ?? '—'}`);
        console.log(`  ${c.gray}Category   :${c.reset} ${metadata.category ?? '—'}`);
        console.log(`  ${c.gray}Tags       :${c.reset} ${(metadata.tags || []).join(', ') || '—'}`);
        console.log(`  ${c.gray}Project    :${c.reset} ${metadata.project ?? '—'}`);
        if (metadata.suggestedFolder) {
          console.log(`  ${c.gray}Suggested  :${c.reset} ${metadata.suggestedFolder}`);
        }
        console.log();
      } else {
        console.error(`${c.white}[ERROR] Analysis failed:${c.reset} ${res.error}`);
        console.log(`  ${c.gray}Tip: 'arka ai-status' shows provider status.${c.reset}\n`);
      }
      break;
    }

    // ── Server lifecycle & one-command startup (PC only) ───────────────────
    case 'start':
    case 'serve': {
      if (!fs.existsSync(SERVER_ENTRY)) {
        console.error(`\n${c.white}[ERROR] No local ARKA Core in this directory (${SERVER_ENTRY})${c.reset}`);
        console.log(`  ${c.gray}On Termux: run 'arka config set-url http://<PC_LOCAL_IP>:5000/api'${c.reset}\n`);
        return;
      }

      const alreadyOnline = await probeServer();
      if (alreadyOnline) {
        console.log(`\n${c.white}[OK] ARKA Core is already ONLINE at ${API_BASE}${c.reset}`);
        console.log(`  ${c.gray}Files: ${alreadyOnline.stats?.totalFiles ?? 0} · Inbox: ${alreadyOnline.stats?.inboxFiles ?? 0} · Uptime: ${alreadyOnline.uptimeSeconds ?? 0}s${c.reset}`);
        console.log(`  ${c.gray}Run 'arka stop' first if you want a clean restart.${c.reset}\n`);
        return;
      }

      const portIndex = args.indexOf('--port');
      const env = { ...process.env };
      if (portIndex > -1) {
        const wanted = String(args[portIndex + 1] || '');
        if (!/^\d{2,5}$/.test(wanted)) {
          console.error(`${c.white}[ERROR] Usage: arka start --port <number>${c.reset}`);
          return;
        }
        env.PORT = wanted;
      }

      const targetPort = env.PORT || apiPort();
      console.log(`\n${c.white}Starting ARKA Core (port ${targetPort})...${c.reset}`);

      if (args.includes('--foreground') || args.includes('-f')) {
        const child = spawn(process.execPath, [SERVER_ENTRY], { cwd: PROJECT_ROOT, stdio: 'inherit', env });
        console.log(`  ${c.gray}Logs above are the server output — press Ctrl+C to stop.${c.reset}`);
        child.on('exit', code => process.exit(code ?? 0));
        return;
      }

      fs.mkdirSync(RUNTIME_DIR, { recursive: true });
      fs.appendFileSync(LOG_FILE, `\n===== ${new Date().toISOString()} — arka start (port ${targetPort}) =====\n`);
      const logFd = fs.openSync(LOG_FILE, 'a');
      const child = spawn(process.execPath, [SERVER_ENTRY], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env
      });
      child.unref();
      fs.closeSync(logFd);
      fs.writeFileSync(PID_FILE, `${child.pid}\n`);

      for (let attempt = 0; attempt < 24; attempt++) {
        await sleep(500);
        const booted = await probeServer();
        if (booted) {
          console.log(`${c.white}[OK] ARKA Core ONLINE at ${API_BASE}${c.reset}`);
          console.log(`  ${c.gray}PID ${child.pid} · Log: ${path.relative(PROJECT_ROOT, LOG_FILE) || LOG_FILE}${c.reset}`);
          console.log(`  ${c.gray}Run 'arka ls', 'arka upload ...' from any directory.${c.reset}`);
          console.log(`  ${c.gray}Stop anytime with 'arka stop'.${c.reset}\n`);
          return;
        }
      }

      console.error(`${c.white}[ERROR] Server did not answer within 12s. Last log lines:${c.reset}`);
      console.log(tailFile(LOG_FILE, 12).join('\n'));
      if (process.env.ARKA_API) {
        console.error(`  ${c.gray}[WARN] ARKA_API is set to ${process.env.ARKA_API}${c.reset}`);
      }
      console.log(`  ${c.gray}Run 'arka start --foreground' to see live output.${c.reset}\n`);
      return;
    }

    case 'stop':
    case 'down': {
      const port = apiPort();
      const stopped = [];
      const trackedPid = readPidFile();

      if (trackedPid && isAlive(trackedPid)) {
        killProcess(trackedPid);
        stopped.push(trackedPid);
      }

      for (const pid of listenersOn(port)) {
        if (stopped.includes(pid)) continue;
        if (!isNodeProcess(pid)) {
          console.error(`  ${c.gray}[WARN] PID ${pid} listens on port ${port} but is not a node process — left untouched.${c.reset}`);
          continue;
        }
        killProcess(pid);
        stopped.push(pid);
      }

      fs.rmSync(PID_FILE, { force: true });

      if (stopped.length) {
        console.log(`\n${c.white}[OK] ARKA Core stopped — PID ${stopped.join(', ')} (port ${port})${c.reset}\n`);
      } else {
        console.log(`\n${c.gray}[INFO] No ARKA Core process found on port ${port}. Nothing to stop.${c.reset}\n`);
      }
      return;
    }

    case 'install': {
      printBanner();
      const cliEntry = path.join(PROJECT_ROOT, 'cli', 'bin', 'arka.js');

      if (process.platform === 'win32') {
        const launcher = path.join(PROJECT_ROOT, 'arka.cmd');
        if (!fs.existsSync(launcher)) {
          console.error(`${c.white}[ERROR] Launcher not found: ${launcher}${c.reset}`);
          return;
        }

        const userPath = runPowerShell("[Environment]::GetEnvironmentVariable('Path','User')");
        const entries = userPath.split(';').filter(Boolean).map(e => e.replace(/\\+$/, '').toLowerCase());
        if (entries.includes(PROJECT_ROOT.replace(/\\+$/, '').toLowerCase())) {
          console.log(`${c.white}[OK] Already installed:${c.reset} ${PROJECT_ROOT} is on your user PATH.`);
          console.log(`  ${c.gray}Open a NEW terminal, then type 'arka' from any directory.${c.reset}\n`);
          return;
        }

        if (args.includes('--dry-run')) {
          console.log(`${c.white}[DRY RUN]${c.reset} User PATH would include:`);
          console.log(`  ${c.gray};${PROJECT_ROOT}${c.reset}`);
          console.log(`  ${c.gray}Run 'arka install' (without --dry-run) to apply.${c.reset}\n`);
          return;
        }

        runPowerShell(
          `[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ';${PROJECT_ROOT}', 'User')`
        );
        console.log(`${c.white}[OK] Added to user PATH:${c.reset} ${PROJECT_ROOT}`);
        console.log(`  ${c.gray}Open a NEW CMD/PowerShell window, then run:${c.reset}`);
        console.log(`    ${c.white}arka start${c.reset}   ${c.gray}← boots ARKA Core${c.reset}`);
        console.log(`    ${c.white}arka${c.reset}         ${c.gray}← status & dashboard${c.reset}\n`);
        return;
      }

      const binDir = process.env.PREFIX ? path.join(process.env.PREFIX, 'bin') : path.join(os.homedir(), '.local', 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const target = path.join(binDir, 'arka');
      fs.writeFileSync(target, `#!/usr/bin/env bash\nexec node ${JSON.stringify(cliEntry)} "$@"\n`);
      fs.chmodSync(target, 0o755);
      console.log(`${c.white}[OK] Wrote launcher:${c.reset} ${target}`);
      if (!(process.env.PATH || '').split(':').includes(binDir)) {
        console.log(`  ${c.gray}Add to PATH: echo 'export PATH=${binDir}:$PATH' >> ~/.bashrc && source ~/.bashrc${c.reset}`);
      }
      console.log(`  ${c.gray}Note: On Termux, ARKA Core keeps running on your PC.${c.reset}\n`);
      return;
    }

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;

    default: {
      const suggestion = findClosestCommand(command);
      console.log(`\n${c.white}[ERROR] 'arka ${command}' is not a valid command.${c.reset}`);
      if (suggestion) {
        console.log(`\n  Did you mean: ${c.white}${c.bold}arka ${suggestion}${c.reset}?`);
      }
      console.log(`\n${c.gray}Run '${c.white}arka help${c.gray}' to view all available commands.${c.reset}\n`);
      process.exitCode = 1;
      break;
    }
  }
}

main().catch(err => {
  console.error('Fatal CLI Error:', err);
});
