-- ============================================================================
-- ARKA Phase 2 Migration: Personal Google Drive (BYOD) & Tenant Columns
-- Run this script in the Supabase SQL Editor:
-- Dashboard -> SQL Editor -> New Query -> Paste & Run
-- ============================================================================

-- Add user_id column to folders table
ALTER TABLE folders 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add Google Drive BYOD storage columns to files table
ALTER TABLE files 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS gdrive_file_id TEXT,
  ADD COLUMN IF NOT EXISTS gdrive_view_url TEXT,
  ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'supabase';

-- Add user_id to prompts table
ALTER TABLE prompts 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id to links table
ALTER TABLE links 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_gdrive_id ON files(gdrive_file_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_links_user_id ON links(user_id);
