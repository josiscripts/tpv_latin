-- Add 'other' option to document_type constraint
-- Fecha: 2026-10-11

ALTER TABLE documents DROP CONSTRAINT document_type_valid;
ALTER TABLE documents ADD CONSTRAINT document_type_valid CHECK (
  document_type IN ('invoice', 'delivery_note', 'other')
);
