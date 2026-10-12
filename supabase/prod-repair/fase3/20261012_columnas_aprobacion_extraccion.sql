-- COLUMNAS DE APROBACIÓN EN document_extractions. Necesarias para approve_extraction_create_purchase
-- y para rechazar extracciones. En PROD no existían: la fase 3 se aplicó sin error porque PL/pgSQL
-- no valida columnas al crear la función, pero fallaba al ejecutarse.
-- Solo añade columnas nulas: no cambia ninguna fila existente (sin DEFAULT, sin UPDATE).
BEGIN;

ALTER TABLE public.document_extractions
  ADD COLUMN IF NOT EXISTS approval_status TEXT,
  ADD COLUMN IF NOT EXISTS approval_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_claimed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.document_extractions'::regclass AND conname = 'document_extractions_approval_status_check'
  ) THEN
    ALTER TABLE public.document_extractions
      ADD CONSTRAINT document_extractions_approval_status_check
      CHECK (approval_status IS NULL OR approval_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_document_extractions_purchase_id ON public.document_extractions(purchase_id);

COMMIT;
