-- FASE 0 OPCIÓN A: Add owner-based RLS to documents Storage
-- Fecha: 2026-10-08
-- Purpose: Protect documents bucket with private-by-user + admin override (matches table RLS)

-- ============================================================================
-- PERFORMANCE: Add index on documents.file_path for policy efficiency
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_documents_file_path ON public.documents(file_path)
WHERE deleted_at IS NULL;

-- ============================================================================
-- STORAGE RLS - DOCUMENTS BUCKET (BEFORE POLICIES)
-- ============================================================================

-- Verify RLS is enabled on storage.objects
DO $$
BEGIN
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  RAISE NOTICE 'RLS enabled on storage.objects';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'RLS already enabled on storage.objects (expected)';
END
$$;

-- ============================================================================
-- DROP OLD DOCUMENTS POLICIES (Too permissive)
-- ============================================================================

DROP POLICY IF EXISTS "documents_select_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "documents_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "documents_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "documents_delete_authenticated" ON storage.objects;

-- ============================================================================
-- CREATE NEW DOCUMENTS POLICIES (Owner-based + Admin)
-- ============================================================================

-- SELECT: Only owner or admin can read documents
CREATE POLICY "documents_select_owner_or_admin"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.file_path = name
    AND d.deleted_at IS NULL
    AND (
      d.uploaded_by = auth.uid()
      OR (SELECT role_id FROM profiles WHERE id = auth.uid()) = 'admin'
    )
  )
);

-- INSERT: Authenticated users can upload (table RLS will validate owner)
-- Note: Table RLS + trigger ensure uploaded_by = auth.uid()
-- If table INSERT fails, application will rollback Storage upload
CREATE POLICY "documents_insert_authenticated"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'documents'
  AND auth.role() = 'authenticated'
);

-- UPDATE: Only owner or admin can update documents
CREATE POLICY "documents_update_owner_or_admin"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.file_path = name
    AND d.deleted_at IS NULL
    AND (
      d.uploaded_by = auth.uid()
      OR (SELECT role_id FROM profiles WHERE id = auth.uid()) = 'admin'
    )
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.file_path = name
    AND d.deleted_at IS NULL
    AND (
      d.uploaded_by = auth.uid()
      OR (SELECT role_id FROM profiles WHERE id = auth.uid()) = 'admin'
    )
  )
);

-- DELETE: Only owner or admin can delete documents
CREATE POLICY "documents_delete_owner_or_admin"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.file_path = name
    AND d.deleted_at IS NULL
    AND (
      d.uploaded_by = auth.uid()
      OR (SELECT role_id FROM profiles WHERE id = auth.uid()) = 'admin'
    )
  )
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "documents_select_owner_or_admin" ON storage.objects IS 'Documents bucket SELECT: Private by user + admin override. Validates documents.uploaded_by.';
COMMENT ON POLICY "documents_insert_authenticated" ON storage.objects IS 'Documents bucket INSERT: Any authenticated user can upload. Table RLS validates ownership.';
COMMENT ON POLICY "documents_update_owner_or_admin" ON storage.objects IS 'Documents bucket UPDATE: Private by user + admin override. Matches table RLS.';
COMMENT ON POLICY "documents_delete_owner_or_admin" ON storage.objects IS 'Documents bucket DELETE: Private by user + admin override. Respects soft delete (deleted_at).';
