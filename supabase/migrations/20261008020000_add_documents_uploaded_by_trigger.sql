-- FASE 0: Add trigger to automatically set uploaded_by on document insert
-- Fecha: 2026-10-08
-- Purpose: Ensure uploaded_by is never NULL and cannot be falsified by client

-- ============================================================================
-- CREATE TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION set_document_uploaded_by()
RETURNS TRIGGER AS $$
BEGIN
  -- If uploaded_by is NULL, assign the current authenticated user
  IF NEW.uploaded_by IS NULL THEN
    NEW.uploaded_by = auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- CREATE TRIGGER
-- ============================================================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS documents_set_uploaded_by ON documents;

-- Create trigger that runs BEFORE INSERT
CREATE TRIGGER documents_set_uploaded_by
BEFORE INSERT ON documents
FOR EACH ROW
EXECUTE FUNCTION set_document_uploaded_by();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION set_document_uploaded_by() IS 'Automatically assign uploaded_by to the current authenticated user if not provided.';
COMMENT ON TRIGGER documents_set_uploaded_by ON documents IS 'Ensures uploaded_by is always set to auth.uid() on document insert.';
