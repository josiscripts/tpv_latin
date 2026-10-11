-- Business / Company information table
-- Fecha: 2026-10-06

CREATE TABLE IF NOT EXISTS business (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tax_id TEXT,
  address TEXT,
  phone TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER business_updated_at
BEFORE UPDATE ON business
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE business ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read business info
CREATE POLICY "allow_read_business" ON business
FOR SELECT
USING (true);

-- Allow admin to update
CREATE POLICY "allow_admin_update_business" ON business
FOR UPDATE
USING (
  (SELECT role_id FROM profiles WHERE id = auth.uid()) = 'admin'
)
WITH CHECK (
  (SELECT role_id FROM profiles WHERE id = auth.uid()) = 'admin'
);

COMMENT ON TABLE business IS 'Información del negocio/empresa';
