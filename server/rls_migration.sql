-- ================================================================
-- ARKA -- Multi-User Row Level Security (RLS) Migration v2
-- Run this in Supabase Dashboard -> SQL Editor
--
-- FIX: auth.uid() returns UUID, but user_id columns are TEXT.
--      Added ::text cast to auth.uid() on all policies.
-- ================================================================

-- 1. Enable RLS on all tables
ALTER TABLE files    ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE links    ENABLE ROW LEVEL SECURITY;

-- 2. DROP existing policies (clean slate)
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

-- 3. FILES
-- auth.uid()::text  => cast UUID -> TEXT to match user_id column type
CREATE POLICY "files_select" ON files
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "files_insert" ON files
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "files_update" ON files
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "files_delete" ON files
  FOR DELETE USING (auth.uid()::text = user_id);

-- 4. FOLDERS
CREATE POLICY "folders_select" ON folders
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "folders_insert" ON folders
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "folders_update" ON folders
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "folders_delete" ON folders
  FOR DELETE USING (auth.uid()::text = user_id);

-- 5. PROMPTS
CREATE POLICY "prompts_select" ON prompts
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "prompts_insert" ON prompts
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "prompts_update" ON prompts
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "prompts_delete" ON prompts
  FOR DELETE USING (auth.uid()::text = user_id);

-- 6. LINKS
CREATE POLICY "links_select" ON links
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "links_insert" ON links
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "links_update" ON links
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "links_delete" ON links
  FOR DELETE USING (auth.uid()::text = user_id);

-- 7. Verify -- should show rowsecurity = true for all 4 tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('files', 'folders', 'prompts', 'links')
ORDER BY tablename;
