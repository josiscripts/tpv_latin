-- Create documents table for managing invoices and delivery notes
-- Fecha: 2026-10-01

-- ============================================================================
-- TABLA: documents
-- ============================================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID,
  purchase_id UUID,
  document_type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT at_least_one_reference CHECK (
    (sale_id IS NOT NULL) OR (purchase_id IS NOT NULL)
  ),
  CONSTRAINT document_type_valid CHECK (
    document_type IN ('invoice', 'delivery_note')
  ),
  CONSTRAINT file_path_not_empty CHECK (LENGTH(TRIM(file_path)) > 0),
  CONSTRAINT original_name_not_empty CHECK (LENGTH(TRIM(original_name)) > 0),
  CONSTRAINT file_size_positive CHECK (file_size IS NULL OR file_size > 0),

  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
);

CREATE TRIGGER documents_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_documents_sale_id ON documents(sale_id);
CREATE INDEX idx_documents_purchase_id ON documents(purchase_id);
CREATE INDEX idx_documents_document_type ON documents(document_type);
CREATE INDEX idx_documents_created_at ON documents(created_at);
CREATE INDEX idx_documents_deleted_at ON documents(deleted_at);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Temporary: Deny all (to be replaced with proper auth policies)
CREATE POLICY documents_deny_all ON documents USING (FALSE);

-- ============================================================================
-- COMMENT
-- ============================================================================
COMMENT ON TABLE documents IS 'Storage metadata for invoices and delivery notes. Actual files stored in Supabase Storage.';
COMMENT ON COLUMN documents.document_type IS 'Type of document: invoice or delivery_note';
COMMENT ON COLUMN documents.file_path IS 'Path in Supabase Storage (e.g., invoices/2026/10/invoice_123.pdf)';
COMMENT ON COLUMN documents.uploaded_by IS 'User or system that uploaded the document';
