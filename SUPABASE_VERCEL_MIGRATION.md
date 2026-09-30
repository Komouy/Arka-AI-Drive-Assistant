# 📋 Rencana Migrasi & Deployment: Vercel + Supabase (ARKA Cloud)

> **Status:** Siap Dikerjakan Besok  
> **Tujuan:** Membuat ARKA dapat diakses 24/7 dari HP/Laptop di luar jaringan Wi-Fi lokal, tanpa perlu menyalakan PC terus-menerus, menggunakan Vercel (Hosting & Domain gratis) + Supabase (Database PostgreSQL & Storage Bucket gratis).

---

## 1. Arsitektur Cloud

```text
               📱 HP (Browser / PWA)          💻 PC (CLI / Browser)
                        │                               │
                        └───────────────┬───────────────┘
                                        ↓
                           ▲ VERCEL (Hosting & API)
                - Frontend: Web Viewer & Upload Portal (Monochrome)
                - Backend: Serverless Functions (/api/*)
                                        │
                    ┌───────────────────┼───────────────────┐
                    ↓                   ↓                   ↓
              ⚡ SUPABASE           🟣 Groq             🔵 Gemini
       - PostgreSQL Database      (Agent / Teks)     (Multimodal)
       - Storage Bucket (Files)
```

---

## 2. Kenapa Vercel + Supabase?
1. **Always-On & Gratis:** Tidak perlu PC menyala 24/7 di rumah.
2. **Domain & SSL Otomatis:** Langsung dapat domain publik HTTPS (`https://arka-assistant.vercel.app`).
3. **Database & Storage Terpisah:** Supabase menyediakan PostgreSQL (500 MB) dan Storage Bucket (1 GB) gratis, aman untuk file upload.
4. **UI Mobile-Friendly:** Upload file, simpan prompt, bookmark link, dan triage file langsung lewat web di HP dengan tampilan monokrom minimalis (abu-abu/hitam/putih, tanpa emoji).

---

## 3. Skema Database Supabase (PostgreSQL)

Script SQL berikut siap di-copy & paste ke **Supabase SQL Editor**:

```sql
-- 1. Tabel Folders
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    color TEXT DEFAULT '#ffffff',
    icon TEXT DEFAULT 'folder',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabel Files
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    size BIGINT,
    storage_path TEXT NOT NULL,
    public_url TEXT,
    is_inbox BOOLEAN DEFAULT TRUE,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_trash BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabel File Metadata (Hasil Analisis AI)
CREATE TABLE IF NOT EXISTS file_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    description TEXT,
    category TEXT,
    project TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    ai_analyzed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabel Prompts
CREATE TABLE IF NOT EXISTS prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    tags JSONB DEFAULT '[]'::jsonb,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabel Links (Knowledge & Bookmarks)
CREATE TABLE IF NOT EXISTS links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    category TEXT DEFAULT 'general',
    tags JSONB DEFAULT '[]'::jsonb,
    domain TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Storage Bucket untuk File
-- Buat bucket baru di menu Storage Supabase bernama: 'arka-files' (Public)
```

---

## 4. Struktur Folder & Adaptasi Vercel

```text
arka/
├── api/
│   └── index.js              <-- Entry point serverless function untuk Vercel
├── server/
│   ├── ai/                   <-- Groq & Gemini providers (tetap dipakai)
│   ├── config/
│   │   └── supabase.js       <-- Inisialisasi Supabase client (@supabase/supabase-js)
│   ├── controllers/          <-- Query dialihkan dari SQLite ke Supabase
│   └── public/               <-- Frontend HTML/CSS/JS (upload.html, index.html)
├── cli/                      <-- CLI tetap bisa connect lewat config set-url
├── vercel.json               <-- Routing rule Vercel
├── package.json
└── .env                      <-- Environment variables
```

### Konfigurasi `vercel.json`
```json
{
  "version": 2,
  "builds": [
    { "src": "api/index.js", "use": "@vercel/node" },
    { "src": "server/public/**", "use": "@vercel/static" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/index.js" },
    { "src": "/(.*)", "dest": "/server/public/$1" }
  ]
}
```

---

## 5. Environment Variables yang Dibutuhkan

Di Vercel Dashboard (Project Settings > Environment Variables):

| Variable | Contoh / Sumber | Keterangan |
|---|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Dari Supabase Project Settings > API |
| `SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Anon/Public API Key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` | Service Role Key (akses penuh backend) |
| `GROQ_API_KEY` | `gsk_...` | Groq API Key (AI agent & teks) |
| `GEMINI_API_KEY` | `AIza...` | Google Gemini API Key (multimodal) |

---

## 6. Langkah Eksekusi (Checklist Besok)

- [ ] **Langkah 1: Setup Akun Supabase**
  - Buat project baru di [supabase.com](https://supabase.com).
  - Jalankan script SQL di SQL Editor.
  - Buat Storage Bucket bernama `arka-files` (set Public).
- [ ] **Langkah 2: Integrasi Supabase di Codebase**
  - Install `@supabase/supabase-js`.
  - Buat `server/config/supabase.js`.
  - Update controller (`files`, `prompts`, `links`, `inbox`) agar query ke Supabase.
- [ ] **Langkah 3: Persiapan Serverless & Vercel**
  - Buat wrapper serverless `api/index.js` untuk Express.
  - Tambahkan konfigurasi `vercel.json`.
- [ ] **Langkah 4: Deploy ke Vercel**
  - Push repository ke GitHub (atau gunakan Vercel CLI).
  - Import project ke Vercel dan pasang Environment Variables.
  - Dapatkan link `https://arka-assistant.vercel.app`.
- [ ] **Langkah 5: Pengujian HP & CLI**
  - Buka web lewat browser HP: coba upload file, tambah prompt, tambah link.
  - Atur CLI di PC/Termux: `arka config set-url https://arka-assistant.vercel.app` agar CLI lokal langsung terhubung ke database cloud.
