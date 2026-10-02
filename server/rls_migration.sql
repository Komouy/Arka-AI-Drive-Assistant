-- ================================================================
-- ARKA -- Multi-User Row Level Security (RLS) Migration v2
-- Jalankan skrip ini di: Supabase Dashboard -> SQL Editor -> Run
--
-- FIX:
-- 1. Menambahkan ADD COLUMN IF NOT EXISTS user_id TEXT
-- 2. Menambahkan type cast auth.uid()::text agar cocok dengan kolom TEXT
-- 3. SELECT mengizinkan data milik user (auth.uid()::text = user_id)
--    maupun data default/legacy (user_id IS NULL)
-- 4. INSERT/UPDATE/DELETE hanya diizinkan untuk data milik sendiri
-- ================================================================

-- 1. Pastikan kolom user_id tersedia di semua tabel
ALTER TABLE files   ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE folders ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE links   ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Pastikan kolom is_favorite tersedia untuk fitur Quick Pin / Star
ALTER TABLE files   ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;
ALTER TABLE links   ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;

-- 2. Buat index user_id agar query per-user sangat cepat
CREATE INDEX IF NOT EXISTS idx_files_user_id   ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_links_user_id   ON links(user_id);

-- 3. Aktifkan Row Level Security (RLS) di semua tabel
ALTER TABLE files   ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE links   ENABLE ROW LEVEL SECURITY;

-- 4. Bersihkan policy lama (Clean Slate)
DROP POLICY IF EXISTS "files_select"   ON files;
DROP POLICY IF EXISTS "files_insert"   ON files;
DROP POLICY IF EXISTS "files_update"   ON files;
DROP POLICY IF EXISTS "files_delete"   ON files;
DROP POLICY IF EXISTS "folders_select" ON folders;
DROP POLICY IF EXISTS "folders_insert" ON folders;
DROP POLICY IF EXISTS "folders_update" ON folders;
DROP POLICY IF EXISTS "folders_delete" ON folders;
DROP POLICY IF EXISTS "prompts_select" ON prompts;
DROP POLICY IF EXISTS "prompts_insert" ON prompts;
DROP POLICY IF EXISTS "prompts_update" ON prompts;
DROP POLICY IF EXISTS "prompts_delete" ON prompts;
DROP POLICY IF EXISTS "links_select"   ON links;
DROP POLICY IF EXISTS "links_insert"   ON links;
DROP POLICY IF EXISTS "links_update"   ON links;
DROP POLICY IF EXISTS "links_delete"   ON links;

-- 5. TABEL FILES
CREATE POLICY "files_select" ON files
  FOR SELECT USING (auth.uid()::text = user_id OR user_id IS NULL);

CREATE POLICY "files_insert" ON files
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "files_update" ON files
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "files_delete" ON files
  FOR DELETE USING (auth.uid()::text = user_id);

-- 6. TABEL FOLDERS
CREATE POLICY "folders_select" ON folders
  FOR SELECT USING (auth.uid()::text = user_id OR user_id IS NULL);

CREATE POLICY "folders_insert" ON folders
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "folders_update" ON folders
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "folders_delete" ON folders
  FOR DELETE USING (auth.uid()::text = user_id);

-- 7. TABEL PROMPTS
CREATE POLICY "prompts_select" ON prompts
  FOR SELECT USING (auth.uid()::text = user_id OR user_id IS NULL);

CREATE POLICY "prompts_insert" ON prompts
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "prompts_update" ON prompts
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "prompts_delete" ON prompts
  FOR DELETE USING (auth.uid()::text = user_id);

-- 8. TABEL LINKS
CREATE POLICY "links_select" ON links
  FOR SELECT USING (auth.uid()::text = user_id OR user_id IS NULL);

CREATE POLICY "links_insert" ON links
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "links_update" ON links
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "links_delete" ON links
  FOR DELETE USING (auth.uid()::text = user_id);

-- 9. Verifikasi status RLS (Semua 4 tabel harus rowsecurity = true)
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('files', 'folders', 'prompts', 'links')
ORDER BY tablename;
