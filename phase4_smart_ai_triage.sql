-- ============================================================================
-- ARKA Phase 4: Smart AI Triage & Auto-Rename Columns
-- Run this in Supabase SQL Editor:
-- Dashboard -> SQL Editor -> New Query -> Paste & Run
-- ============================================================================

-- 1. Add suggested_name and suggested_folder columns to file_metadata
ALTER TABLE file_metadata 
  ADD COLUMN IF NOT EXISTS suggested_name TEXT,
  ADD COLUMN IF NOT EXISTS suggested_folder TEXT;

-- 2. Create index for suggested folder lookups
CREATE INDEX IF NOT EXISTS idx_file_metadata_folder ON file_metadata(suggested_folder);
