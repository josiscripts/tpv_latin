-- Allow documents to exist independently of sales or purchases
-- Fecha: 2026-10-04

-- ============================================================================
-- REMOVE CONSTRAINT: at_least_one_reference
-- ============================================================================
-- The Documents module should support independent document uploads
-- that are not tied to a specific sale or purchase.
-- Both sale_id and purchase_id are now truly optional (can be NULL).

ALTER TABLE documents
DROP CONSTRAINT at_least_one_reference;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON COLUMN documents.sale_id IS 'Optional: UUID of related sale. Can be NULL for independent documents.';
COMMENT ON COLUMN documents.purchase_id IS 'Optional: UUID of related purchase. Can be NULL for independent documents.';
