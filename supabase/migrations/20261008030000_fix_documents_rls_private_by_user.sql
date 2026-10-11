-- FASE 0: Fix documents RLS to be private by user with admin override
-- Fecha: 2026-10-08
-- Purpose: Implement secure private-by-user access model for documents

-- ============================================================================
-- DROP EXISTING DOCUMENTS RLS POLICIES (Too permissive)
-- ============================================================================

DROP POLICY IF EXISTS "documents_select_authenticated" ON documents;
DROP POLICY IF EXISTS "documents_insert_authenticated" ON documents;
DROP POLICY IF EXISTS "documents_update_authenticated" ON documents;
DROP POLICY IF EXISTS "documents_delete_authenticated" ON documents;

-- ============================================================================
-- DOCUMENTS RLS - PRIVATE BY USER WITH ADMIN OVERRIDE
-- ============================================================================

-- SELECT: Only owner OR admin can read
CREATE POLICY "documents_select_owner_or_admin"
ON documents
FOR SELECT
USING (
  auth.uid() = uploaded_by
  OR (SELECT role_id FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- INSERT: Authenticated users can insert, but uploaded_by must be NULL
-- (Backend/Trigger will set uploaded_by = auth.uid())
CREATE POLICY "documents_insert_authenticated"
ON documents
FOR INSERT
WITH CHECK (auth.role() = 'authenticated' AND uploaded_by IS NULL);

-- UPDATE: Only owner OR admin can update
CREATE POLICY "documents_update_owner_or_admin"
ON documents
FOR UPDATE
USING (
  auth.uid() = uploaded_by
  OR (SELECT role_id FROM profiles WHERE id = auth.uid()) = 'admin'
)
WITH CHECK (
  auth.uid() = uploaded_by
  OR (SELECT role_id FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- DELETE: Only owner OR admin can delete (soft delete via deleted_at)
CREATE POLICY "documents_delete_owner_or_admin"
ON documents
FOR DELETE
USING (
  auth.uid() = uploaded_by
  OR (SELECT role_id FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "documents_select_owner_or_admin" ON documents IS 'Documents are private by user. Only the owner or admin can SELECT.';
COMMENT ON POLICY "documents_insert_authenticated" ON documents IS 'Any authenticated user can upload, but uploaded_by is set by trigger.';
COMMENT ON POLICY "documents_update_owner_or_admin" ON documents IS 'Only owner or admin can UPDATE document metadata.';
COMMENT ON POLICY "documents_delete_owner_or_admin" ON documents IS 'Only owner or admin can DELETE (soft delete).';
