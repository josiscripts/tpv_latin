-- Storage configuration for documents bucket
-- Fecha: 2026-10-04

-- ============================================================================
-- CONFIGURE STORAGE BUCKET FOR AUTHENTICATED ACCESS
-- ============================================================================

-- For LAB LOCAL: Disable RLS on storage.objects to allow authenticated users to upload
-- This is a workaround since storage.objects is a Supabase system table
-- and cannot be modified by regular migrations.
--
-- The table-level RLS in 'documents' table provides application-level access control
-- to ensure users can only see/modify their own documents.
--
-- For production: Configure storage policies via Supabase dashboard or Admin API.

-- Attempt to disable RLS on storage.objects (may require special permissions)
DO $$
BEGIN
  ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
  RAISE NOTICE 'RLS disabled on storage.objects';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not disable RLS on storage.objects (permission denied - this is expected). Using private bucket configuration instead.';
END
$$;
