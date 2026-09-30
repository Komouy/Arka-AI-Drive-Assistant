# 🗺️ ARKA — Roadmap & Status Fase

> **Your files. Your memory. Your AI.**
> Fokus produk: **100% Command Line** — Windows CMD/PowerShell (`arka.cmd`) + Android Termux (`setup-termux.sh`).
> Dokumen ini adalah **satu-satunya sumber roadmap** setelah `IMPLEMENTATION.md` dan README versi lama dihapus.

---

## 📍 Posisi Sekarang: **Phase 6 selesai — sedang masuk Phase 7 & 9**

| Fase | Nama | Status |
|:---:|---|---|
| 0 | Foundation — ARKA Core (REST API + Supabase / Cloud Architecture) | ✅ Selesai |
| 1 | ARKA Drive & Storage (Google Drive BYOD & Cloud Storage) | ✅ Selesai |
| 2 | Web Dashboard & UI (Responsive Web App for Vercel) | ✅ Selesai |
| 3 | Smart Metadata — Multimodal Vision/Audio (Gemini) + Doc/Code (Groq) | ✅ Selesai (Otomatis saat upload & manual trigger) |
| 4 | Web Bookmarks & Link AI Enrichment (Groq summarizer & auto-categorizer) | ✅ Selesai |
| 5 | Prompt & Knowledge Hub | ✅ Selesai |
| 6 | Multi-Tenant Data Isolation & RLS (Supabase Auth + Google OAuth) | ✅ Selesai |
| 7 | Smart & Semantic Search (Metadata-driven + Tag indexing) | 🔄 Sedang dioptimalkan |

---

## 🏛️ Arsitektur Aktual

```text
        💻 WINDOWS CMD / POWERSHELL        📱 ANDROID TERMUX
                    │                              │
                    └───────────┬──────────────────┘
                                ↓
                     🤖 ARKA CORE (Node.js)
          Express REST API :5000 + node:sqlite + Local FS
                                │
                    ┌───────────┼───────────┐
                    ↓           ↓           ↓
              🟣 Groq      🔵 Gemini    📦 Storage
           (teks/agent)   (multimodal)  (uploads / inbox)
```

---

## 🧩 Sistem yang Sudah Berjalan

| Sistem | Lokasi | Keterangan |
|---|---|---|
| ARKA Core API | `server/index.js` | Express + CORS + static `/storage`, **21 endpoint** |
| Database | `server/database/db.js` | `node:sqlite` (zero native dep), WAL + FK, tabel `folders`/`files`/`file_metadata`/`prompts`, auto-seed |
| Storage Engine | `storage/uploads`, `storage/inbox` | multer (max 500 MB/file), nama anti-kolisi, auto-move inbox↔uploads |
| CLI | `cli/bin/arka.js` | Zero dependency, ANSI color, config `~/.arkarc` |
| AI Providers | `server/ai/providers.js` | Groq `qwen/qwen3.8-27b` / `openai/gpt-oss-120b`, Gemini `gemini-3.5-flash` (model ID hanya di file ini) |
| Smart Metadata | `server/ai/analyzer.js` | Image/video/audio → Gemini, teks/kode → Groq, fallback Groq, JSON (description, topic, tags, project, suggestedFolder) |
| AI Agent | `server/ai/agent.js` | Tool-calling Groq, MAX_STEPS 3, tool: `search_files`, `search_prompts`, `list_inbox`, `get_workspace_stats`, `list_folders`, `answer` |
| Inbox / Triage | `server/controllers/inboxController.js` | `resolveTargetFolder()` (id / nama / path + auto-create), pindah file fisik |
| Trash | `server/controllers/fileController.js` | Soft-delete `is_trash`, restore, `trash empty` (unlink permanen) |
| Folder | `server/controllers/folderController.js` | Nested path, rename/move/color, hapus folder → file aman ke Inbox |
| Stats | `server/controllers/systemController.js` | Total file/bytes, inbox, folder, prompt, trash + breakdown kategori |
| Windows Launcher | `arka.cmd` | `arka` → `cli/bin/arka.js` |
| Termux Installer | `setup-termux.sh` | Install nodejs, tulis `~/.arkarc`, copy ke `$PREFIX/bin/arka` |

### Perintah CLI (24 command case)
`status` · `ls` · `info` · `view`/`cat` · `mkdir` · `upload` (`--project` / `--inbox`, folder rekursif) · `move` · `rm` (`--permanent`) · `restore` · `trash` (+ `trash empty`) · `download` · `search` · `inbox` · `triage` · `prompt ls|show|add|edit|rm` · `config set-url|show` · `ai-status` · `ask` · `analyze` · `start`/`serve` · `stop`/`down` · `install` · `guide`/`docs` · `help`

### Menjalankan Project (Windows)
```cmd
arka install --dry-run   &REM  lihat rencana perubahan PATH (opsional)
arka install             &REM  daftarkan 'arka' ke user PATH → buka terminal baru
arka start               &REM  nyalakan ARKA Core (detached, log: storage/logs/server.log)
arka                     &REM  = arka status
arka stop                &REM  hentikan Core
```
`start` menulis PID ke `storage/logs/server.pid`; `stop` memakainya lalu memindai port target
dan **hanya** mematikan proses `node.exe` (proses lain yang menyerobot port dibiarkan).

---

## ✅ Yang Baru Dirapikan (refactor CLI + server)

* `arka triage` **sudah diimplementasikan** (Enter = terima saran AI, `s` skip, `q` berhenti).
* `arka prompt add --content "…" --category X --tags a,b` + `arka prompt edit <id>` (CRUD lengkap).
* `arka upload` memindai folder secara **rekursif** + MIME type dari ekstensi (kategorinya benar).
* `arka view` menolak file biner & memotong teks > 512 KB; `arka download` tidak menimpa file lokal.
* CLI `api()` tahan server mati / respons non-JSON / HTTP error; semua listing lewat `listOf()`.
* Server: util terpusat (`utils/fileTypes|folders|http|search`), error AI dilaporkan apa adanya (502),
  query `LIKE` di-escape, siklus folder (parent → child) ditolak, `..` dinetralkan di nama folder.
* Bug yang ditemukan & diperbaiki saat uji end-to-end: `isTextLike` belum di-import di `analyzer.js`,
  dan `db.transaction()` (API better-sqlite3) tidak ada di `node:sqlite` → DELETE folder selalu 500.
* **Dokumentasi in-product**: `arka guide [topik]` (dokumen di dalam CLI, jalan tanpa server / di Termux)
  + tool AI `get_usage_guide` (`server/ai/usageGuide.js`) supaya `arka ask "cara pakai …"` menjawab
  dengan perintah asli, bukan karangan. `max_tokens` agent 800 → 2400 (`ARKA_AGENT_MAX_TOKENS`) +
  deteksi terpotong (`finish_reason: length`, JSON arg terpotong, kalimat berhenti di tengah) —
  jawabannya sekarang selalu utuh dan kalau terpotong diberi peringatan + rujukan ke `arka guide`.
* `arka ask` kini **ingat konteks** maks 10 menit (`POST /api/ai/reset` / `arka ask --reset`), jadi
  "yang lebih detail" nyambung; setiap daftar perintah dijawab lewat `get_usage_guide` sehingga
  tidak ada flag karangan. Tiap `tool_call` selalu dibalas pesan `tool` (mencegah HTTP 400 provider),
  dan kalau loop habis tetap ada teks jawaban (pass tanpa tool) — bukan lagi "Maaf, saya tidak bisa memproses".

---

## ⚠️ Gap / TODO (terverifikasi dari kode)

1. AI Agent masih **read-only** (sengaja): tool-nya `search_files`, `search_prompts`, `list_inbox`,
   `get_workspace_stats`, `list_folders`, `get_usage_guide`, `answer`. Tool aksi (`create_folder`,
   `move_file`, `delete_file`) belum ada — saat ini agent mengarahkan user ke `arka triage`/`move`/`rm`.
2. Favorit belum bisa diakses dari CLI (hanya ada di DB + API — `PATCH /files/:id` sudah mendukung `is_favorite`).
3. Search masih `LIKE` substring — belum **FTS5** / semantic.
4. Belum ada **authentication** sama sekali + `CORS origin: '*'`.
5. `analyzeFiles()` (batch analyzer) belum dipakai controller mana pun.
6. `DELETE /files/:id?permanent` menghapus file fisik sesuai kolom `path`; kalau file fisik sudah dipindah manual, baris DB tetap terhapus (pembersihan yatim di storage belum ada).

---

## 🚫 Yang Sudah Dihapus (Keputusan)

| Item | Alasan |
|---|---|
| **Chatbot Assistant (Phase 8 & AI Chat)** | Dihapus. Fokus dialihkan murni ke **Sistem AI Pemrosesan Drive** (Auto-tagging multimodal, smart summarizer file & link, metadata extraction). |
| **CLI & Termux Support** | Dihapus dari workspace. Produk 100% dipusatkan ke **Web App di Vercel (`vercel.app`)** dengan antarmuka visual modern. |
| **Voice Assistant (Phase 11)** | STT/TTS di luar scope produk drive & workspace. |
| **Computer Agent (Phase 12)** | Shell/OS execution di luar arsitektur cloud serverless Vercel. |

---

## 👥 Multi-User & BYOD Storage Roadmap (Opsi 2)

Roadmap perluasan ARKA agar dapat dipakai publik dengan autentikasi Google dan storage mandiri (Bring Your Own Drive):

| Tahap | Fitur | Status | Keterangan |
|---|---|---|---|
| **Fase 1** | **Google OAuth + Persistent Session** | ✅ Selesai | Autentikasi Google via Supabase Auth, sesi permanen di `localStorage`, auto-login, header user avatar/nama, fallback password login tetap aktif. |
| **Fase 2** | **Opsi 2: BYOD Personal Google Drive** | ✅ Selesai | File diunggah & dikelola langsung di Google Drive pribadi pengguna melalui REST API (`drive.file` scope). Folder khusus "ARKA Files" dibuat otomatis di Google Drive user. |
| **Fase 3** | **Multi-Tenant Data Isolation & RLS** | ✅ Selesai | Isolasi data file, folder, prompt, link, dan stats per `user_id` di backend controller + Row Level Security (RLS) policies di database Supabase Postgres (`phase3_migration.sql`). Siap publish untuk publik! |


