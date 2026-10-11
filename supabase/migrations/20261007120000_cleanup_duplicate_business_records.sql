-- Remove duplicate business records, keeping only the canonical record
-- Canonical record: 9d348517-d57c-423a-a252-9214922c96b0 (name: lymarket, complete data)
-- Date: 2026-10-07

-- Remove exactly 10 duplicate records (created during testing)
DELETE FROM public.business
WHERE id IN (
  'debc0a58-c864-46db-a9b8-fcdd90e82126',
  '815ff36b-a066-4337-845f-874db7b0ceb8',
  '37080525-2fe2-4b7f-96f8-5f8c084a0427',
  '54b5cb43-9795-49bf-aa23-cef537f860e8',
  'f496ae1c-46cf-449c-aabb-d91d774f5816',
  'c327422e-db4b-4ac4-a5ea-7bb455ad0ff0',
  '665f3bb2-6ada-40cf-b930-86bde7db0101',
  'd4911b3f-2e85-4420-82f9-775ba354e064',
  'af53ff81-175e-429c-b11b-bcf9b4067f55',
  '078a904b-199f-4dce-92ac-01bd836379e8'
);

-- Verify only the canonical record remains
-- SELECT COUNT(*) FROM public.business;
-- Expected result: 1 row with id = 9d348517-d57c-423a-a252-9214922c96b0
