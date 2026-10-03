-- Add authentication and RLS policies for documents module
-- Fecha: 2026-10-04

-- ============================================================================
-- ALTER DOCUMENTS TABLE: Change uploaded_by from TEXT to UUID
-- ============================================================================

-- Add new UUID column
ALTER TABLE documents ADD COLUMN uploaded_by_user_id UUID;

-- Migrate data: set to user who created the document (for now, null for anon uploads)
UPDATE documents SET uploaded_by_user_id = NULL WHERE uploaded_by = 'anon';

-- Drop old column and rename new one
ALTER TABLE documents DROP COLUMN uploaded_by;
ALTER TABLE documents RENAME COLUMN uploaded_by_user_id TO uploaded_by;

-- Add constraint to reference auth.users
ALTER TABLE documents
  ADD CONSTRAINT fk_documents_uploaded_by
  FOREIGN KEY (uploaded_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX idx_documents_uploaded_by_user_id ON documents(uploaded_by);

-- ============================================================================
-- UPDATE DOCUMENTS RLS POLICIES
-- ============================================================================

-- Drop the DENY ALL policy
DROP POLICY IF EXISTS documents_deny_all ON documents;

-- RLS: Authenticated users can SELECT, INSERT, UPDATE, DELETE documents
CREATE POLICY documents_select_authenticated
ON documents
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY documents_insert_authenticated
ON documents
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND uploaded_by = auth.uid());

CREATE POLICY documents_update_authenticated
ON documents
FOR UPDATE
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY documents_delete_authenticated
ON documents
FOR DELETE
USING (auth.role() = 'authenticated');

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON COLUMN documents.uploaded_by IS 'UUID of authenticated user who uploaded the document';
