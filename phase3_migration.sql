-- ============================================================================
-- ARKA Phase 3 Migration: Multi-Tenant Data Isolation & Row Level Security (RLS)
-- Run this script in the Supabase SQL Editor:
-- Dashboard -> SQL Editor -> New Query -> Paste & Run
-- ============================================================================

-- 1. Ensure user_id and GDrive BYOD columns exist on all tables
ALTER TABLE folders 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE files 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS gdrive_file_id TEXT,
  ADD COLUMN IF NOT EXISTS gdrive_view_url TEXT,
  ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'supabase';

ALTER TABLE prompts 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE links 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Create performance indexes for tenant filtering
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_gdrive_id ON files(gdrive_file_id);
CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_links_user_id ON links(user_id);

-- 3. Enable Row Level Security (RLS) on all user data tables
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE links ENABLE ROW LEVEL SECURITY;

-- 4. Clean up any existing policies to ensure idempotency
DROP POLICY IF EXISTS "folders_select_policy" ON folders;
DROP POLICY IF EXISTS "folders_insert_policy" ON folders;
DROP POLICY IF EXISTS "folders_update_policy" ON folders;
DROP POLICY IF EXISTS "folders_delete_policy" ON folders;

DROP POLICY IF EXISTS "files_select_policy" ON files;
DROP POLICY IF EXISTS "files_insert_policy" ON files;
DROP POLICY IF EXISTS "files_update_policy" ON files;
DROP POLICY IF EXISTS "files_delete_policy" ON files;

DROP POLICY IF EXISTS "metadata_select_policy" ON file_metadata;
DROP POLICY IF EXISTS "metadata_insert_policy" ON file_metadata;
DROP POLICY IF EXISTS "metadata_update_policy" ON file_metadata;
DROP POLICY IF EXISTS "metadata_delete_policy" ON file_metadata;

DROP POLICY IF EXISTS "prompts_select_policy" ON prompts;
DROP POLICY IF EXISTS "prompts_insert_policy" ON prompts;
DROP POLICY IF EXISTS "prompts_update_policy" ON prompts;
DROP POLICY IF EXISTS "prompts_delete_policy" ON prompts;

DROP POLICY IF EXISTS "links_select_policy" ON links;
DROP POLICY IF EXISTS "links_insert_policy" ON links;
DROP POLICY IF EXISTS "links_update_policy" ON links;
DROP POLICY IF EXISTS "links_delete_policy" ON links;

-- 5. Folders Policies: Users can view their own + shared (user_id IS NULL), manage their own
CREATE POLICY "folders_select_policy" ON folders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "folders_insert_policy" ON folders
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "folders_update_policy" ON folders
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "folders_delete_policy" ON folders
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 6. Files Policies: Users can view their own + shared (user_id IS NULL), manage their own
CREATE POLICY "files_select_policy" ON files
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "files_insert_policy" ON files
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "files_update_policy" ON files
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "files_delete_policy" ON files
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 7. File Metadata Policies: Inherits ownership from the parent file
CREATE POLICY "metadata_select_policy" ON file_metadata
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM files 
      WHERE files.id = file_metadata.file_id 
        AND (files.user_id = auth.uid() OR files.user_id IS NULL)
    )
  );

CREATE POLICY "metadata_insert_policy" ON file_metadata
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM files 
      WHERE files.id = file_metadata.file_id 
        AND files.user_id = auth.uid()
    )
  );

CREATE POLICY "metadata_update_policy" ON file_metadata
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM files 
      WHERE files.id = file_metadata.file_id 
        AND files.user_id = auth.uid()
    )
  );

CREATE POLICY "metadata_delete_policy" ON file_metadata
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM files 
      WHERE files.id = file_metadata.file_id 
        AND files.user_id = auth.uid()
    )
  );

-- 8. Prompts Policies: Users can view their own + shared, manage their own
CREATE POLICY "prompts_select_policy" ON prompts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "prompts_insert_policy" ON prompts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "prompts_update_policy" ON prompts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "prompts_delete_policy" ON prompts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 9. Links Policies: Users can view their own + shared, manage their own
CREATE POLICY "links_select_policy" ON links
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "links_insert_policy" ON links
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "links_update_policy" ON links
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "links_delete_policy" ON links
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
