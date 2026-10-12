-- BUSCADOR DE DOCUMENTOS. Búsqueda paginada en servidor sobre TODOS los documentos visibles.
-- SECURITY INVOKER: se aplican las políticas RLS del usuario que consulta (propios o admin).
-- Solo lectura. No modifica datos. No duplica filas (EXISTS, no JOIN).
BEGIN;

CREATE OR REPLACE FUNCTION public.search_documents(
  p_query TEXT DEFAULT NULL,
  p_document_type TEXT DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_term TEXT := NULLIF(btrim(p_query), '');
  v_pattern TEXT;
  v_fecha DATE;
  v_result JSONB;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'p_limit fuera de rango (1-100)' USING ERRCODE = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'p_offset no válido' USING ERRCODE = '22023';
  END IF;

  IF v_term IS NOT NULL THEN
    -- Escapar comodines de LIKE para que el texto del usuario se busque literalmente
    v_pattern := '%' || replace(replace(replace(v_term, '\', '\'), '%', '\%'), '_', '\_') || '%';
    IF v_term ~ '^\d{4}-\d{2}-\d{2}$' THEN
      v_fecha := v_term::date;
    ELSIF v_term ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN
      v_fecha := to_date(v_term, 'DD/MM/YYYY');
    END IF;
  END IF;

  WITH matched AS (
    SELECT d.*
    FROM public.documents d
    WHERE d.deleted_at IS NULL
      AND (p_document_type IS NULL OR d.document_type = p_document_type)
      AND (p_from IS NULL OR d.created_at >= p_from)
      AND (p_to IS NULL OR d.created_at <= p_to)
      AND (v_term IS NULL OR (
            d.original_name ILIKE v_pattern
            OR (v_fecha IS NOT NULL AND (d.document_date = v_fecha OR d.created_at::date = v_fecha))
            OR EXISTS (
              SELECT 1 FROM public.document_extractions e
              WHERE e.document_id = d.id
                AND (e.vendor_name ILIKE v_pattern
                     OR e.invoice_number ILIKE v_pattern
                     OR (v_fecha IS NOT NULL AND e.invoice_date = v_fecha))
            )
            OR EXISTS (
              SELECT 1 FROM public.purchases p
              LEFT JOIN public.suppliers s ON s.id = p.supplier_id
              WHERE p.id = d.purchase_id
                AND (s.name ILIKE v_pattern OR p.invoice_number ILIKE v_pattern)
            )
          ))
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM matched),
    'invoices', (SELECT count(*) FROM matched WHERE document_type = 'invoice'),
    'delivery_notes', (SELECT count(*) FROM matched WHERE document_type = 'delivery_note'),
    'others', (SELECT count(*) FROM matched WHERE document_type NOT IN ('invoice', 'delivery_note')),
    'items', COALESCE((
      SELECT jsonb_agg((to_jsonb(x) - 'processing_lease_token') ORDER BY x.created_at DESC)
      FROM (SELECT * FROM matched ORDER BY created_at DESC LIMIT p_limit OFFSET p_offset) x
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.search_documents(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_documents(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) TO authenticated;

COMMIT;
