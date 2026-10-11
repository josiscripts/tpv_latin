-- Allow anon (development LOCAL) to upload to logos bucket
-- Pattern: matches 20260916155959_enable_rls_local_development.sql
-- This enables frontend (anon key) to upload logos during local development

-- Allow anon to INSERT logos
DROP POLICY IF EXISTS "logos_insert_anon" ON storage.objects;
CREATE POLICY "logos_insert_anon"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
  );

-- Allow anon to UPDATE logos (for replacing/reupload)
DROP POLICY IF EXISTS "logos_update_anon" ON storage.objects;
CREATE POLICY "logos_update_anon"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'logos')
  WITH CHECK (bucket_id = 'logos');
