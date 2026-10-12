-- FASE 3.1: aprobación atómica y solo para administradores. CANDIDATO: validar en LAB antes de PROD.
-- Sustituye las funciones claim/link/release de fase 3 (no desplegadas en PROD).
-- Una sola transacción: bloquea la extracción, crea compra y líneas, y la vincula. Sin ventana de fallo.
-- No inventa importes: NULL en cabecera si no hay datos; líneas sin cantidad o precio se omiten y se cuentan.

BEGIN;

DROP FUNCTION IF EXISTS public.claim_extraction_for_purchase(UUID);
DROP FUNCTION IF EXISTS public.link_extraction_purchase(UUID, UUID);
DROP FUNCTION IF EXISTS public.release_extraction_claim(UUID);

CREATE OR REPLACE FUNCTION public.approve_extraction_create_purchase(p_extraction_id UUID, p_supplier_id UUID)
RETURNS TABLE(purchase_id UUID, created BOOLEAN, lines_copied INTEGER, lines_skipped INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e document_extractions%ROWTYPE;
  v_doc_date DATE;
  v_date DATE;
  v_purchase_id UUID;
  v_type TEXT;
  v_copied INTEGER := 0;
  v_skipped INTEGER := 0;
  v_line JSONB;
  v_qty NUMERIC;
  v_price NUMERIC;
  v_rate NUMERIC;
  v_total NUMERIC;
BEGIN
  -- Autorización en base de datos: solo administradores activos
  IF NOT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role_id = 'admin' AND p.active
  ) THEN
    RAISE EXCEPTION 'Solo administradores pueden aprobar extracciones y crear compras'
      USING ERRCODE = '42501';
  END IF;

  -- Bloqueo de la fila: dos llamadas simultáneas se ponen en cola
  SELECT * INTO e FROM document_extractions WHERE id = p_extraction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extracción no encontrada';
  END IF;

  -- Idempotencia: si ya tiene compra (respuesta perdida, reintento, doble clic), devolver la misma
  IF e.purchase_id IS NOT NULL THEN
    RETURN QUERY SELECT e.purchase_id, FALSE, 0, 0;
    RETURN;
  END IF;

  IF e.approval_status = 'rejected' THEN
    RAISE EXCEPTION 'La extracción está rechazada';
  END IF;

  SELECT d.document_date INTO v_doc_date FROM documents d WHERE d.id = e.document_id;
  v_date := COALESCE(e.invoice_date, v_doc_date);
  IF v_date IS NULL THEN
    RAISE EXCEPTION 'Falta la fecha del documento. Complétela antes de aprobar';
  END IF;

  -- Misma factura (proveedor, número y fecha) ya registrada: no crear una segunda compra
  IF e.invoice_number IS NOT NULL AND EXISTS (
    SELECT 1 FROM purchases p
    WHERE p.supplier_id = p_supplier_id AND p.invoice_number = e.invoice_number AND p.purchase_date = v_date
  ) THEN
    RAISE EXCEPTION 'Ya existe una compra con esta factura (proveedor, número y fecha). Revisar antes de continuar'
      USING ERRCODE = '23505';
  END IF;

  v_type := CASE WHEN e.document_type_detected = 'delivery_note' THEN 'albarán' ELSE 'factura' END;

  -- Cabecera: importes tal como vienen en la extracción (NULL si no existen)
  INSERT INTO purchases (supplier_id, purchase_date, invoice_number, type, subtotal, tax, total, status)
  VALUES (p_supplier_id, v_date, e.invoice_number, v_type, e.subtotal, e.tax_total, e.total, 'draft')
  RETURNING id INTO v_purchase_id;

  -- Líneas: solo si hay cantidad y precio; el total se calcula solo si falta y ambos existen
  IF e.lines_extracted IS NOT NULL AND jsonb_typeof(e.lines_extracted) = 'array' THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(e.lines_extracted) LOOP
      v_qty   := NULLIF(v_line ->> 'quantity', '')::NUMERIC;
      v_price := COALESCE(NULLIF(v_line ->> 'unit_price', ''), NULLIF(v_line ->> 'price', ''))::NUMERIC;
      v_rate  := COALESCE(NULLIF(v_line ->> 'tax_rate', '')::NUMERIC, e.tax_rate);
      v_total := COALESCE(NULLIF(v_line ->> 'total', '')::NUMERIC,
                          CASE WHEN v_qty IS NOT NULL AND v_price IS NOT NULL THEN v_qty * v_price END);

      IF v_qty IS NULL OR v_qty <= 0 OR v_price IS NULL OR v_price < 0
         OR v_rate IS NULL OR v_total IS NULL OR v_total < 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO purchase_lines (purchase_id, product_id, quantity, unit_cost, tax_rate, total)
      VALUES (v_purchase_id, NULL, v_qty, v_price, v_rate, v_total);
      v_copied := v_copied + 1;
    END LOOP;
  END IF;

  -- Vincular extracción y documento en la misma transacción
  UPDATE document_extractions
  SET purchase_id = v_purchase_id,
      purchase_claimed_at = NULL,
      approval_status = 'approved',
      approval_timestamp = NOW()
  WHERE id = p_extraction_id;

  UPDATE documents
  SET purchase_id = v_purchase_id, updated_at = NOW()
  WHERE id = e.document_id;

  RETURN QUERY SELECT v_purchase_id, TRUE, v_copied, v_skipped;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_extraction_create_purchase(UUID, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_extraction_create_purchase(UUID, UUID) TO authenticated;

COMMIT;
