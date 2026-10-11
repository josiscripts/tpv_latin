-- Add avatar_url to profiles table
-- Fecha: 2026-10-06

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN profiles.avatar_url IS 'URL del avatar del usuario (almacenado en Storage)';
