-- Add RLS policies for Storage buckets (avatars, logos, category-images)
-- Fecha: 2026-10-06
-- Purpose: Allow authenticated users to upload/manage their own files

-- ============================================================================
-- ENABLE RLS ON STORAGE.OBJECTS (ensure it's enabled)
-- Note: This may fail in LOCAL if the user doesn't own the table.
-- That's OK - RLS is already enabled by Supabase itself.
-- ============================================================================

DO $$
BEGIN
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  RAISE NOTICE 'RLS enabled on storage.objects';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'RLS already enabled or permission denied (expected). Continuing with policy creation...';
END
$$;

-- ============================================================================
-- AVATARS BUCKET - Storage Policies
-- ============================================================================

-- Allow authenticated users to SELECT (read) any avatar
DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;
CREATE POLICY "avatars_select_public"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- Allow authenticated users to INSERT their own avatar
DROP POLICY IF EXISTS "avatars_insert_authenticated" ON storage.objects;
CREATE POLICY "avatars_insert_authenticated"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to UPDATE their own avatar
DROP POLICY IF EXISTS "avatars_update_authenticated" ON storage.objects;
CREATE POLICY "avatars_update_authenticated"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to DELETE their own avatar
DROP POLICY IF EXISTS "avatars_delete_authenticated" ON storage.objects;
CREATE POLICY "avatars_delete_authenticated"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- LOGOS BUCKET - Storage Policies
-- ============================================================================

-- Allow authenticated users to SELECT (read) any logo
DROP POLICY IF EXISTS "logos_select_public" ON storage.objects;
CREATE POLICY "logos_select_public"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'logos');

-- Allow authenticated users to INSERT their business logo
DROP POLICY IF EXISTS "logos_insert_authenticated" ON storage.objects;
CREATE POLICY "logos_insert_authenticated"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to UPDATE their business logo
DROP POLICY IF EXISTS "logos_update_authenticated" ON storage.objects;
CREATE POLICY "logos_update_authenticated"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'logos'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to DELETE their business logo
DROP POLICY IF EXISTS "logos_delete_authenticated" ON storage.objects;
CREATE POLICY "logos_delete_authenticated"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'logos'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- CATEGORY-IMAGES BUCKET - Storage Policies
-- ============================================================================

-- Allow anyone to SELECT (read) category images (public bucket)
DROP POLICY IF EXISTS "category_images_select_public" ON storage.objects;
CREATE POLICY "category_images_select_public"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'category-images');

-- Allow authenticated users to INSERT category images
DROP POLICY IF EXISTS "category_images_insert_authenticated" ON storage.objects;
CREATE POLICY "category_images_insert_authenticated"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'category-images'
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to UPDATE category images
DROP POLICY IF EXISTS "category_images_update_authenticated" ON storage.objects;
CREATE POLICY "category_images_update_authenticated"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'category-images'
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'category-images'
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to DELETE category images
DROP POLICY IF EXISTS "category_images_delete_authenticated" ON storage.objects;
CREATE POLICY "category_images_delete_authenticated"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'category-images'
    AND auth.role() = 'authenticated'
  );

-- ============================================================================
-- DOCUMENTS BUCKET - Storage Policies
-- ============================================================================

-- Allow authenticated users to SELECT (read) documents
DROP POLICY IF EXISTS "documents_select_authenticated" ON storage.objects;
CREATE POLICY "documents_select_authenticated"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to INSERT documents
DROP POLICY IF EXISTS "documents_insert_authenticated" ON storage.objects;
CREATE POLICY "documents_insert_authenticated"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to UPDATE documents
DROP POLICY IF EXISTS "documents_update_authenticated" ON storage.objects;
CREATE POLICY "documents_update_authenticated"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to DELETE documents
DROP POLICY IF EXISTS "documents_delete_authenticated" ON storage.objects;
CREATE POLICY "documents_delete_authenticated"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  );

-- ============================================================================
-- PRODUCT-IMAGES BUCKET - Storage Policies
-- ============================================================================

-- Allow anyone to SELECT (read) product images (public bucket, synced by Bridge)
DROP POLICY IF EXISTS "product_images_select_public" ON storage.objects;
CREATE POLICY "product_images_select_public"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'product-images');

-- Allow authenticated users (Bridge/Service) to INSERT product images
DROP POLICY IF EXISTS "product_images_insert_authenticated" ON storage.objects;
CREATE POLICY "product_images_insert_authenticated"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND auth.role() IN ('authenticated', 'service_role')
  );

-- Allow authenticated users (Bridge/Service) to UPDATE product images
DROP POLICY IF EXISTS "product_images_update_authenticated" ON storage.objects;
CREATE POLICY "product_images_update_authenticated"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'product-images'
    AND auth.role() IN ('authenticated', 'service_role')
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND auth.role() IN ('authenticated', 'service_role')
  );

-- Allow authenticated users (Bridge/Service) to DELETE product images
DROP POLICY IF EXISTS "product_images_delete_authenticated" ON storage.objects;
CREATE POLICY "product_images_delete_authenticated"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND auth.role() IN ('authenticated', 'service_role')
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "avatars_insert_authenticated" ON storage.objects IS 'Allow authenticated users to upload avatars to their own folder (uuid/avatar.*)';
COMMENT ON POLICY "logos_insert_authenticated" ON storage.objects IS 'Allow authenticated users to upload business logos to their own folder (uuid/logo.*)';
COMMENT ON POLICY "product_images_select_public" ON storage.objects IS 'Allow public read access to product images synced by Bridge from Sysme LAB';
COMMENT ON POLICY "product_images_insert_authenticated" ON storage.objects IS 'Allow Bridge/Service role to upload product images from Sysme LAB';
