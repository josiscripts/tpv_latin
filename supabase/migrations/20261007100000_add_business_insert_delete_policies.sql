-- Add INSERT and DELETE policies to business table
-- Allows frontend (anon) to create and delete business records in development LOCAL
-- Pattern: matches 20260916155959_enable_rls_local_development.sql for consistency

-- Allow all authenticated users to create business info
CREATE POLICY "allow_insert_business" ON business
FOR INSERT
WITH CHECK (true);

-- Allow all authenticated users to delete business info
CREATE POLICY "allow_delete_business" ON business
FOR DELETE
USING (true);
