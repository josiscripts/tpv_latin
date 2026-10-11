-- Migration: Add logo_url field to suppliers
-- Purpose: Store supplier logo/image URL for display in UI
-- Scope: LOCAL/LAB only

BEGIN;

-- Add logo_url column to suppliers table
ALTER TABLE public.suppliers
ADD COLUMN logo_url TEXT;

-- Create index for faster lookups
CREATE INDEX idx_suppliers_logo_url ON public.suppliers(logo_url) WHERE logo_url IS NOT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.suppliers.logo_url IS 'URL to supplier logo/image stored in Supabase Storage. Separate from business logo. Format: /storage/v1/object/public/supplier-logos/{supplierId}/{filename}';

COMMIT;
