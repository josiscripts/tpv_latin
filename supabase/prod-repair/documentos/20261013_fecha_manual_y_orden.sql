-- FECHA EDITABLE Y ORDEN MANUAL DE DOCUMENTOS.
-- Aditivo: columnas nuevas. No modifica document_date (la escribe el procesamiento IA),
-- ni created_at, ni timestamps de procesamiento, ni compras, proveedores o extracciones.
BEGIN;

-- 1. Columnas nuevas
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS document_date_manual DATE,
  ADD COLUMN IF NOT EXISTS document_date_edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS document_date_edited_by UUID,
  ADD COLUMN IF NOT EXISTS manual_position BIGINT;

-- 2. Posición inicial: conserva el orden visible actual (más reciente primero). Solo rellena la columna nueva.
WITH ordenados AS (
  SELECT id, row_number() OVER (ORDER BY created_at DESC, id) AS pos
  FROM public.documents
  WHERE manual_position IS NULL
)
UPDATE public.documents d
   SET manual_position = o.pos
  FROM ordenados o
 WHERE d.id = o.id;

-- 3. Documentos nuevos: se colocan al inicio del orden personalizado
CREATE OR REPLACE FUNCTION public.documents_set_manual_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.manual_position IS NULL THEN
    SELECT COALESCE(MIN(manual_position), 1) - 1 INTO NEW.manual_position FROM public.documents;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_set_manual_position ON public.documents;
CREATE TRIGGER documents_set_manual_position
  BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_set_manual_position();

-- 3b. Documento restaurado (deleted_at pasa a NULL): vuelve al inicio con posición única
CREATE OR REPLACE FUNCTION public.documents_restore_manual_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    SELECT COALESCE(MIN(manual_position), 1) - 1 INTO NEW.manual_position FROM public.documents;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_restore_manual_position ON public.documents;
CREATE TRIGGER documents_restore_manual_position
  BEFORE UPDATE OF deleted_at ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_restore_manual_position();

-- 4. Guardar nombre, tipo y fecha en una sola operación. Solo propietario o administrador activo.
CREATE OR REPLACE FUNCTION public.update_document_details(
  p_document_id UUID,
  p_name TEXT,
  p_type TEXT,
  p_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_owner UUID;
  v_name TEXT := btrim(p_name);
  v_row documents%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND active) THEN
    RAISE EXCEPTION 'Sesión no válida o usuario inactivo' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM documents WHERE id = p_document_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.uploaded_by IS DISTINCT FROM v_uid
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND active AND role_id = 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para editar este documento' USING ERRCODE = '42501';
  END IF;

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'El nombre no puede estar vacío' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_name) > 255 THEN
    RAISE EXCEPTION 'El nombre no puede superar 255 caracteres' USING ERRCODE = '22001';
  END IF;
  IF p_type NOT IN ('invoice', 'delivery_note', 'other') THEN
    RAISE EXCEPTION 'Tipo de documento no válido' USING ERRCODE = '22023';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'La fecha del documento es obligatoria' USING ERRCODE = '22023';
  END IF;
  IF p_date < DATE '1990-01-01' OR p_date > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'La fecha del documento no es válida' USING ERRCODE = '22023';
  END IF;

  UPDATE documents
     SET original_name = v_name,
         document_type = p_type,
         document_date_manual = p_date,
         document_date_edited_at = NOW(),
         document_date_edited_by = v_uid,
         updated_at = NOW()
   WHERE id = p_document_id;

  RETURN jsonb_build_object('id', p_document_id, 'original_name', v_name, 'document_type', p_type,
                            'document_date', p_date);
END;
$$;

DROP FUNCTION IF EXISTS public.move_document(UUID, TEXT);

-- 5. Mover un documento una posición arriba o abajo en el orden global persistido.
-- Bloquea todos los documentos activos (serializa movimientos concurrentes), renumera 1..N
-- en el orden visible y intercambia con el vecino global. Doble clic: el segundo no cambia nada.
CREATE OR REPLACE FUNCTION public.move_document(p_document_id UUID, p_direction TEXT, p_expected_position BIGINT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_owner UUID;
  v_rn BIGINT;
  v_total BIGINT;
  v_neighbor UUID;
  v_neighbor_rn BIGINT;
  v_raw BIGINT;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND active) THEN
    RAISE EXCEPTION 'Sesión no válida o usuario inactivo' USING ERRCODE = '42501';
  END IF;
  IF p_direction NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'Dirección no válida' USING ERRCODE = '22023';
  END IF;

  -- Bloqueo de todos los documentos activos: un solo movimiento a la vez
  PERFORM 1 FROM documents WHERE deleted_at IS NULL FOR UPDATE;

  SELECT uploaded_by, manual_position INTO v_owner, v_raw FROM documents WHERE id = p_document_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_position IS NOT NULL AND p_expected_position <> v_raw THEN
    RETURN jsonb_build_object('moved', false, 'stale', true);
  END IF;
  IF v_owner IS DISTINCT FROM v_uid
     AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND active AND role_id = 'admin') THEN
    RAISE EXCEPTION 'No tienes permiso para mover este documento' USING ERRCODE = '42501';
  END IF;

  -- Renumerar 1..N en el orden visible actual (sin tocar fechas ni IDs)
  WITH ordenados AS (
    SELECT id, row_number() OVER (ORDER BY manual_position ASC NULLS LAST, created_at DESC, id ASC) AS rn
    FROM documents WHERE deleted_at IS NULL
  )
  UPDATE documents d SET manual_position = o.rn FROM ordenados o
   WHERE d.id = o.id AND d.manual_position IS DISTINCT FROM o.rn;

  SELECT manual_position INTO v_rn FROM documents WHERE id = p_document_id;
  SELECT count(*) INTO v_total FROM documents WHERE deleted_at IS NULL;


  IF (p_direction = 'up' AND v_rn <= 1) OR (p_direction = 'down' AND v_rn >= v_total) THEN
    RETURN jsonb_build_object('moved', false, 'position', v_rn, 'total', v_total);
  END IF;

  v_neighbor_rn := CASE WHEN p_direction = 'up' THEN v_rn - 1 ELSE v_rn + 1 END;
  SELECT id INTO v_neighbor FROM documents WHERE deleted_at IS NULL AND manual_position = v_neighbor_rn;

  UPDATE documents SET manual_position = v_neighbor_rn WHERE id = p_document_id;
  UPDATE documents SET manual_position = v_rn WHERE id = v_neighbor;

  RETURN jsonb_build_object('moved', true, 'position', v_neighbor_rn, 'total', v_total);
END;
$$;

-- 6. Búsqueda: orden seleccionable y fecha efectiva (manual si existe). Sustituye la firma de 7 argumentos.
DROP FUNCTION IF EXISTS public.search_documents(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.search_documents(
  p_query TEXT DEFAULT NULL,
  p_document_type TEXT DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_status TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT 'custom'
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
  IF p_status IS NOT NULL AND p_status NOT IN ('uploaded', 'processing', 'processed', 'error') THEN
    RAISE EXCEPTION 'p_status no válido' USING ERRCODE = '22023';
  END IF;
  IF p_sort IS NULL OR p_sort NOT IN ('custom', 'doc_date_desc', 'doc_date_asc', 'upload_desc', 'upload_asc') THEN
    RAISE EXCEPTION 'p_sort no válido' USING ERRCODE = '22023';
  END IF;

  IF v_term IS NOT NULL THEN
    v_pattern := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
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
      AND (p_status IS NULL
           OR (p_status = 'processed' AND d.processing_status IN ('processed', 'approved', 'rejected'))
           OR (p_status <> 'processed' AND d.processing_status = p_status))
      AND (v_term IS NULL OR (
            d.original_name ILIKE v_pattern
            OR (v_fecha IS NOT NULL AND (COALESCE(d.document_date_manual, d.document_date) = v_fecha OR d.created_at::date = v_fecha))
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
      SELECT jsonb_agg((to_jsonb(s) - 'processing_lease_token') ORDER BY s.rn)
      FROM (
        SELECT m.*, row_number() OVER (ORDER BY
          CASE WHEN p_sort = 'custom' THEN m.manual_position END ASC NULLS LAST,
          CASE WHEN p_sort = 'doc_date_desc' THEN COALESCE(m.document_date_manual, m.document_date) END DESC NULLS LAST,
          CASE WHEN p_sort = 'doc_date_asc' THEN COALESCE(m.document_date_manual, m.document_date) END ASC NULLS LAST,
          CASE WHEN p_sort = 'upload_asc' THEN m.created_at END ASC,
          m.created_at DESC,
          m.id ASC) AS rn
        FROM matched m
      ) s
      WHERE s.rn > p_offset AND s.rn <= p_offset + p_limit
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 7. Permisos: solo usuarios autenticados. Nada para anon ni public.
REVOKE ALL ON FUNCTION public.update_document_details(UUID, TEXT, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.move_document(UUID, TEXT, BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_documents(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_document_details(UUID, TEXT, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_document(UUID, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_documents(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;

COMMIT;
