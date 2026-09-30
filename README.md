# 🤖 ARKA — Personal AI Workspace (CLI & Termux)

> **Your files. Your memory. Your AI.**  
> *ARKA dioperasikan 100% via Command Line Interface (Windows CMD/PowerShell) dan Android Termux.*

---

## 🏛️ Arsitektur Sistem

```
                      🤖 ARKA
                         │
                  ┌──────┴──────┐
                  │  ARKA CORE  │ (Node.js API + SQLite)
                  └──────┬──────┘
                         │
           ┌─────────────┴─────────────┐
           ↓                           ↓
      💻 WINDOWS CMD               📱 TERMUX
   (Native File Explorer)       (Mobile Storage Sync)
           │                           │
           └─────────────┬─────────────┘
                         ↓
                🧠 AI + MEMORY
                    ┌────┴────┐
                    ↓         ↓
               🟣 Groq    🔵 Gemini
            (Agent/Text) (Vision/Image)
                    │
         ┌──────────┼──────────┐
         ↓          ↓          ↓
      📦 Storage  🗄️ Database  🔎 Search
```

---

## ⚙️ Setup & Konfigurasi

### 1. Install Dependencies
```cmd
cd server
npm install
```

### 2. Setup API Keys (Wajib untuk Fitur AI)

Buat/edit file `.env` di root project:
```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxx
GEMINI_API_KEY=AQxxxxxxxxxxxxxxxx
PORT=5000
```

- **Groq API Key** → https://console.groq.com/keys *(gratis)*
- **Gemini API Key** → https://aistudio.google.com/apikey *(gratis)*

### 3. (Opsional tapi disarankan) Daftarkan Perintah `arka`
```cmd
cli\bin\arka.js install
```
Ini menambahkan folder project ke **user PATH**, sehingga perintah `arka` bisa diketik
**dari folder mana pun**. Setelah itu **buka terminal baru** (terminal lama masih memakai PATH lama).

> Tanpa langkah ini, `arka` tetap bisa dipakai selama terminal berada di folder project
> (Windows memakai `arka.cmd` di root project).

### 4. Jalankan ARKA Core
```cmd
arka start
```
```
🚀 Starting ARKA Core (port 5000)...
✅ ARKA Core ONLINE at http://localhost:5000/api
   PID 14688 · log: storage\logs\server.log
```
Perintah lain yang berguna:
```cmd
arka                      # = arka status (health + statistik workspace)
arka start --foreground   # server di terminal ini (Ctrl+C untuk berhenti)
arka stop                 # hentikan Core di port target
```
Alternatif lama tetap tersedia: `npm run server` atau `node server/index.js`.

---

## 🧭 Cara Penggunaan (Alur Harian)

| Langkah | Perintah | Hasil |
|---|---|---|
| 1. Nyalakan | `arka start` | ARKA Core jalan di background (log: `storage\logs\server.log`) |
| 2. Lempar file | `arka upload "foto.jpg" --inbox` | Masuk Inbox; AI langsung bikin deskripsi + tag |
| 3. Rapikan | `arka triage` | Per file: Enter = terima saran folder AI, ketik folder = pindah, `s` lewati, `q` berhenti |
| 4. Cari / tanya | `arka search "invoice"` · `arka ask "ada berapa file video saya?"` | Ketemu file / jawaban AI dari isi workspace |
| 5. Beres | `arka stop` | Matikan Core |

Butuh bantuan? Ada 3 jalur:

```cmd
arka guide                :: daftar topik panduan (mulai, upload, inbox, file, trash, prompt, search, ai, termux)
arka guide inbox          :: detail satu topik, langsung di terminal — server boleh mati
arka ask "cara pakai ARKA buat upload lalu rapikan file?"   :: minta AI menjelaskan (pakai dokumentasi resmi)
```

Kalau `arka` belum terdaftar di PATH, jalankan `cli\bin\arka.js install` sekali (lihat Setup langkah 3)
atau pakai path lengkap: `cli\bin\arka.js guide`.

---

## 💻 Penggunaan di Windows (CMD / PowerShell)

### Storage Commands
```cmd
arka status           # Status server + ringkasan workspace
arka ls               # List struktur folder & file
arka ls Instagram     # List file di dalam folder tertentu
arka info README.md   # Lihat detail metadata file
arka view README.md   # Baca isi file teks/kode di terminal
arka mkdir "Instagram/Mockups"
```

### Upload & Download
```cmd
arka upload                                             # Buka Windows File Explorer GUI
arka upload "gambar.png" --project "Instagram"          # Upload ke project
arka upload "catatan.txt" --inbox                       # Upload ke Inbox
arka upload "C:\FolderAset" --project "Website"         # Upload seluruh folder (rekursif)
arka download README.md                                 # Download file
```
> File tiap sub-folder ikut ter-upload (struktur folder lokal tidak disimpan, hanya file-nya),
> MIME type ditebak dari ekstensi sehingga metadata & kategorinya akurat.
> `arka download` **tidak pernah menimpa** file lokal — kalau nama sudah dipakai, file disimpan
> sebagai `nama (1).ext`.

### Manajemen File
```cmd
arka move README.md Programming   # Pindahkan file ke folder lain
arka rm README.md                 # Hapus file (masuk sampah)
arka restore README.md            # Kembalikan dari sampah
arka trash                        # Lihat isi sampah
arka trash empty                  # Kosongkan sampah permanen
```

### Inbox & Prompt
```cmd
arka inbox                        # Lihat file yang belum dirapikan
arka triage                       # Mode interaktif: terima saran AI / ketik folder / s / q
arka prompt ls                    # List semua prompt
arka prompt show 1                # Baca prompt lengkap
arka prompt add "Judul" --content "Isi prompt" --category Tech --tags a,b
arka prompt edit 1 --content "Versi baru"   # Update prompt (title/category/tags juga bisa)
arka prompt rm 1                  # Hapus prompt
arka search "database"            # Cari file & prompt
```
> `arka triage`: Enter = terima saran AI, ketik nama/id folder = pindah ke sana,
> `s` = lewati file ini, `q` = berhenti (file yang sudah diproses tetap tersimpan).
> Folder tujuan yang belum ada akan dibuat otomatis (termasuk path bersarang `A/B/C`).

### arka guide — Dokumentasi Bawaan CLI
```cmd
arka guide            # daftar topik
arka guide mulai      # menyalakan/menghentikan Core, install PATH, config API
arka guide upload     # opsi --project / --inbox, folder rekursif, batas 500 MB
arka guide inbox      # triage interaktif (Enter / nama folder / s / q)
arka guide file       # ls, info, view, download
arka guide trash      # rm, --permanent, restore, trash empty
arka guide prompt     # prompt ls/show/add/edit/rm
arka guide search     # cara kerja pencarian
arka guide ai         # ai-status, ask, analyze, letak API key
arka guide termux     # pemakaian dari HP Android
```
Dokumentasi ini ada **di dalam CLI** (tanpa server, ikut tersalin ke Termux).
Salinan untuk AI ada di `server/ai/usageGuide.js` — kalau menambah perintah, update keduanya.

### Catatan Keamanan & Kenyamanan Terminal
* `arka view` menolak file biner (gambar/video/audio/arsip) dan memotong file teks
  di atas **512 KB** agar terminal tidak banjir.
* Nama folder dibersihkan dari karakter ilegal Windows dan traversal (`..`) sebelum disimpan.
* Kalau server mati / respons bukan JSON, CLI menampilkan pesan error yang jelas
  (bukan crash `ERR_*` atau stack trace).

---

## 🤖 AI Features (Groq + Gemini)

### Cek Status AI
```cmd
arka ai-status
```
```
🤖 ARKA AI Status

   Groq   ✅ ONLINE
           Model : qwen/qwen3.8-27b
           Role  : Primary — text, agent, search, fast inference

   Gemini ✅ ONLINE
           Model : gemini-3.5-flash
           Role  : Multimodal — image, video, audio analysis
```
> Kalau provider OFFLINE, baris `Reason:` menampilkan penyebab aslinya
> (mis. `401 — API key invalid` atau model yang sudah di-retire) + tip perbaikan.

### arka ask — Natural Language Agent
```cmd
arka ask "cari desain mobile app"
arka ask "rapikan inbox saya"
arka ask "ada berapa file video di workspace?"
arka ask "tampilkan semua prompt tentang instagram"
arka ask "cara pakai arka buat hapus file?"     # agent membaca dokumentasi (get_usage_guide)
arka ask --reset                                # lupa konteks percakapan, jawab dari nol
```
Tool yang dimiliki agent: `search_files`, `search_prompts`, `list_inbox`, `get_workspace_stats`,
`list_folders`, `get_usage_guide`, `answer` — semuanya **read-only**. Agent tidak bisa memindah /
menghapus file; untuk aksi itu ia akan menyebut perintah yang harus Anda jalankan
(`arka triage`, `arka move`, `arka rm`).

* **Lanjutan percakapan** diingat server selama 10 menit (maks 4 pertanyaan), jadi
  `arka ask "yang lebih detail"` nyambung dengan jawaban sebelumnya. `arka ask --reset`
  menghapusnya (endpoint `POST /api/ai/reset`).
* Jawaban yang kepotong batas token ditandai peringatan dan diarahkan ke `arka guide`.
  Budget token bisa dinaikkan lewat `ARKA_AGENT_MAX_TOKENS` di `.env` (default 2400).

### arka analyze — AI Metadata (Manual)
```cmd
arka analyze 5
arka analyze "mobile-app-slide.png"
```
```
✅ Analysis complete!
   Provider    : gemini
   Description : Promotional slide for mobile app development service
   Topic       : Mobile App Design
   Tags        : mobile-app, business, development, design
   Suggested   : 📁 Projects/Instagram
```

> **Smart Metadata** berjalan **otomatis** setiap upload di background!  
> Gambar/video → Gemini (vision), teks/kode → Groq (fast LLM)

---

## 📱 Penggunaan di Android (Termux)

### Setup di Termux:
```bash
pkg update -y && pkg install nodejs -y
termux-setup-storage
arka config set-url http://<IP_PC>:5000/api
```

### Perintah di Termux:
```bash
arka status
arka upload ~/storage/shared/DCIM/Camera/IMG_2026.jpg
arka ask "cari video terbaru saya"
arka search "carousel"
arka prompt ls
```

---

## 📁 Struktur Project

```
arka/
├── server/
│   ├── ai/
│   │   ├── providers.js     # Groq + Gemini client & config
│   │   ├── analyzer.js      # Smart Metadata (image→Gemini, text→Groq)
│   │   └── agent.js         # AI Agent dengan tool-calling
│   ├── controllers/
│   │   ├── fileController.js
│   │   ├── folderController.js
│   │   ├── inboxController.js
│   │   ├── promptController.js
│   │   ├── systemController.js
│   │   └── aiController.js
│   ├── database/db.js
│   ├── middlewares/upload.js
│   ├── routes/api.js
│   └── index.js
│
├── cli/bin/arka.js           # CLI utama (Windows + Termux)
├── storage/
│   ├── inbox/
│   └── uploads/
├── database/arka.db
├── .env                      # API keys (jangan di-commit!)
└── .env.example
```
