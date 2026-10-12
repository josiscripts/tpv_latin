-- FASE 2: corrección de funciones de lease y persistencia de extracciones.
-- CANDIDATO. Validar en LAB antes de cualquier aplicación en PROD. NO ejecutar en PROD sin autorización.
-- No modifica claim_document_for_processing (sin cambios). No borra documentos ni extracciones.
-- Firmas idénticas a las de PROD: CREATE OR REPLACE sin cambiar argumentos ni tipos de retorno.

BEGIN;

-- 1. finalize: GET DIAGNOSTICS en lugar de RETURNING TRUE INTO INTEGER (fallo de tipo confirmado)
CREATE OR REPLACE FUNCTION public.finalize_document_as_processed(p_document_id uuid, p_lease_token uuid, p_document_date date DEFAULT NULL::date)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows_updated INTEGER;
BEGIN
  UPDATE documents
  SET
    processing_status = 'processed',
    processing_error = NULL,
    processing_lease_token = NULL,
    processing_lease_expires_at = NULL,
    document_date = COALESCE(p_document_date, document_date),
    updated_at = NOW()
  WHERE
    id = p_document_id
    AND processing_lease_token = p_lease_token
    AND processing_lease_expires_at > NOW();

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  RETURN v_rows_updated > 0;
END;
$function$;

-- 2. mark_document_as_error: mismo defecto de tipo; corregido igual
CREATE OR REPLACE FUNCTION public.mark_document_as_error(p_document_id uuid, p_lease_token uuid, p_error_message text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows_updated INTEGER;
BEGIN
  UPDATE documents
  SET
    processing_status = 'error',
    processing_error = p_error_message,
    processing_lease_token = NULL,
    processing_lease_expires_at = NULL,
    updated_at = NOW()
  WHERE
    id = p_document_id
    AND processing_lease_token = p_lease_token
    AND processing_lease_expires_at > NOW();

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  RETURN v_rows_updated > 0;
END;
$function$;

-- 3. persist: columnas tipadas (necesarias para Compras y Proveedores) + idempotencia por intento
CREATE OR REPLACE FUNCTION public.persist_extraction_with_ownership(p_document_id uuid, p_lease_token uuid, p_extraction_data jsonb, p_extraction_model text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_extraction_id UUID;
  v_lease_valid BOOLEAN;
BEGIN
  -- Verificar lease vigente (mismo criterio que antes)
  SELECT processing_lease_token IS NOT NULL
    AND processing_lease_expires_at > NOW()
  INTO v_lease_valid
  FROM documents
  WHERE id = p_document_id AND processing_lease_token = p_lease_token;

  IF NOT v_lease_valid THEN
    RAISE EXCEPTION 'Document lease invalid or expired for doc %', p_document_id;
  END IF;

  -- Idempotencia: si ya existe extracción para el intento actual, reutilizarla (no duplicar)
  SELECT e.id INTO v_extraction_id
  FROM document_extractions e
  WHERE e.document_id = p_document_id
    AND e.attempt_number = (SELECT processing_attempt_number FROM documents WHERE id = p_document_id)
  ORDER BY e.extracted_at DESC
  LIMIT 1;

  IF v_extraction_id IS NOT NULL THEN
    RETURN v_extraction_id;
  END IF;

  INSERT INTO document_extractions (
    document_id, extraction_model, document_type_detected, vendor_name, vendor_tax_id, vendor_address,
    invoice_number, invoice_date, due_date, currency, subtotal, tax_total, tax_rate, total,
    lines_extracted, raw_text_extracted, raw_response, confidence_score,
    confidence_supplier, confidence_invoice, confidence_lines, attempt_number, extracted_at
  )
  SELECT
    p_document_id,
    p_extraction_model,
    (p_extraction_data ->> 'document_type_detected')::text,
    (p_extraction_data ->> 'vendor_name')::text,
    (p_extraction_data ->> 'vendor_tax_id')::text,
    (p_extraction_data ->> 'vendor_address')::text,
    (p_extraction_data ->> 'invoice_number')::text,
    NULLIF(p_extraction_data ->> 'invoice_date', '')::date,
    NULLIF(p_extraction_data ->> 'due_date', '')::date,
    COALESCE((p_extraction_data ->> 'currency')::text, 'EUR'),
    (p_extraction_data ->> 'subtotal')::numeric(12,2),
    (p_extraction_data ->> 'tax_total')::numeric(12,2),
    (p_extraction_data ->> 'tax_rate')::numeric(5,2),
    (p_extraction_data ->> 'total')::numeric(12,2),
    (p_extraction_data -> 'lines_extracted')::jsonb,
    (p_extraction_data ->> 'raw_text_extracted')::text,
    (p_extraction_data -> 'raw_response')::jsonb,
    (p_extraction_data ->> 'confidence_score')::numeric(3,2),
    (p_extraction_data -> 'raw_response' -> 'confidence' ->> 'supplier')::numeric(3,2),
    (p_extraction_data -> 'raw_response' -> 'confidence' ->> 'invoice_number')::numeric(3,2),
    (p_extraction_data -> 'raw_response' -> 'confidence' ->> 'lines')::numeric(3,2),
    (SELECT processing_attempt_number FROM documents WHERE id = p_document_id),
    NOW()
  FROM documents
  WHERE id = p_document_id AND processing_lease_token = p_lease_token
  RETURNING id INTO v_extraction_id;

  RETURN v_extraction_id;
END;
$function$;

-- 4. recover_abandoned_documents: sin duplicar extracciones, sin borrar, con bloqueo de filas.
--    Lease expirado en 'processing':
--      - si existe extracción del intento actual  -> 'processed' (sin reprocesar ni llamar a la IA)
--      - si no existe                             -> 'error' con motivo (se puede reprocesar explícitamente)
--    p_max_lease_age NULL = sin límite de antigüedad (antes un límite de 30 min dejaba documentos atascados).
CREATE OR REPLACE FUNCTION public.recover_abandoned_documents(
  p_max_lease_age INTERVAL DEFAULT NULL
)
RETURNS TABLE(recovered_count INTEGER, error_recovery_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_finalized INTEGER := 0;
  v_errored INTEGER := 0;
  v_date DATE;
BEGIN
  FOR r IN
    SELECT d.id, d.processing_attempt_number
    FROM documents d
    WHERE d.processing_status = 'processing'
      AND d.processing_lease_expires_at < NOW()
      AND (p_max_lease_age IS NULL OR NOW() - d.processing_lease_expires_at < p_max_lease_age)
    FOR UPDATE SKIP LOCKED
  LOOP
    IF EXISTS (
      SELECT 1 FROM document_extractions e
      WHERE e.document_id = r.id AND e.attempt_number = r.processing_attempt_number
    ) THEN
      SELECT (e.raw_response -> 'extraction' -> 'invoice' ->> 'date')::date INTO v_date
      FROM document_extractions e
      WHERE e.document_id = r.id AND e.attempt_number = r.processing_attempt_number
      ORDER BY e.extracted_at DESC
      LIMIT 1;

      UPDATE documents
      SET processing_status = 'processed',
          processing_error = NULL,
          processing_lease_token = NULL,
          processing_lease_expires_at = NULL,
          document_date = COALESCE(v_date, document_date),
          updated_at = NOW()
      WHERE id = r.id;
      v_finalized := v_finalized + 1;
    ELSE
      UPDATE documents
      SET processing_status = 'error',
          processing_error = 'Lease expirado sin extracción guardada (recuperado)',
          processing_lease_token = NULL,
          processing_lease_expires_at = NULL,
          updated_at = NOW()
      WHERE id = r.id;
      v_errored := v_errored + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_finalized, v_errored;
END;
$function$;

-- Permisos: estas funciones solo las llama process-document con SUPABASE_SERVICE_ROLE_KEY.
-- Ningún cliente (anon, PUBLIC ni authenticated) debe poder manipular leases ajenos ni
-- guardar extracciones directamente. La protección está en la base de datos, no en la UI.
REVOKE EXECUTE ON FUNCTION public.claim_document_for_processing(uuid, interval) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.persist_extraction_with_ownership(uuid, uuid, jsonb, text) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.finalize_document_as_processed(uuid, uuid, date) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_document_as_error(uuid, uuid, text) FROM authenticated, anon, public;
-- recover_abandoned_documents modifica estados de cualquier documento (SECURITY DEFINER): solo servicio.
REVOKE EXECUTE ON FUNCTION public.recover_abandoned_documents(interval) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.claim_document_for_processing(uuid, interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.persist_extraction_with_ownership(uuid, uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_document_as_processed(uuid, uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_document_as_error(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_abandoned_documents(interval) TO service_role;

COMMIT;
