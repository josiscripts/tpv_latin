-- Fix api_key_encrypted column type from BYTEA to TEXT
-- BYTEA causes Supabase to transform format (hex encoding)
-- We store base64 string "v1:..." which should remain as-is
-- This migration only runs in LOCAL, does not affect production

-- Change column type from BYTEA to TEXT
-- PostgreSQL will automatically convert existing data if needed
ALTER TABLE user_ai_credentials
ALTER COLUMN api_key_encrypted SET DATA TYPE TEXT;
