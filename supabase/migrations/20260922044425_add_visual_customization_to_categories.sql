-- Add visual customization fields to categories (color and image)
-- These are web-only metadata, NOT synchronized with Sysme

ALTER TABLE categories ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3b82f6';
ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_categories_color ON categories(color);

-- Add comment to clarify these are web-only fields
COMMENT ON COLUMN categories.color IS 'Web-only metadata: hex color code for category card visualization';
COMMENT ON COLUMN categories.image_url IS 'Web-only metadata: URL to category image in Supabase Storage';
