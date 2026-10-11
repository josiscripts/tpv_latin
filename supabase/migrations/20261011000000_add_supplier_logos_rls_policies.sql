-- Add RLS policies for supplier-logos bucket (private storage for supplier logos)
-- Date: 2026-10-11
-- Purpose: Allow authenticated users to upload and manage supplier logos

-- Allow authenticated users to SELECT (read) supplier logos
DROP POLICY IF EXISTS "supplier_logos_select_authenticated" ON storage.objects;
CREATE POLICY "supplier_logos_select_authenticated"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'supplier-logos'
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to INSERT their own supplier logos
DROP POLICY IF EXISTS "supplier_logos_insert_authenticated" ON storage.objects;
CREATE POLICY "supplier_logos_insert_authenticated"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'supplier-logos'
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to UPDATE their own supplier logos
DROP POLICY IF EXISTS "supplier_logos_update_authenticated" ON storage.objects;
CREATE POLICY "supplier_logos_update_authenticated"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'supplier-logos'
    AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    bucket_id = 'supplier-logos'
    AND auth.role() = 'authenticated'
  );

-- Allow authenticated users to DELETE their own supplier logos
DROP POLICY IF EXISTS "supplier_logos_delete_authenticated" ON storage.objects;
CREATE POLICY "supplier_logos_delete_authenticated"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'supplier-logos'
    AND auth.role() = 'authenticated'
  );
