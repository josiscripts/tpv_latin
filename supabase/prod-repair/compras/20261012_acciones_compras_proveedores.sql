-- ACCIONES DE COMPRAS Y BORRADO SEGURO DE PROVEEDORES.
-- Aditivo: columnas nuevas nulas, nuevo estado 'rejected', funciones nuevas.
-- No modifica filas existentes. No toca stock, ventas ni Sysme.
-- Las funciones validan la sesión y el rol en la base de datos (SECURITY DEFINER + search_path fijo).
BEGIN;

-- 1. Estado rechazado y trazabilidad (nulos; no cambian filas existentes)
ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS status_valid;
ALTER TABLE public.purchases ADD CONSTRAINT status_valid
  CHECK (status = ANY (ARRAY['draft'::text, 'received'::text, 'partial'::text, 'cancelled'::text, 'rejected'::text]));

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by UUID,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS rejection_reason_length;
ALTER TABLE public.purchases ADD CONSTRAINT rejection_reason_length
  CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 500);

-- 2. Recibir: transición válida, idempotente frente a doble clic. Sin stock.
CREATE OR REPLACE FUNCTION public.receive_purchase(p_purchase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_status TEXT;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND active) THEN
    RAISE EXCEPTION 'Sesión no válida o usuario inactivo' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status FROM purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_status = 'received' THEN
    -- Ya recibida: no se vuelve a registrar (doble clic, reintento)
    RETURN jsonb_build_object('changed', false, 'status', 'received');
  END IF;

  IF v_status NOT IN ('draft', 'partial') THEN
    RAISE EXCEPTION 'Solo se pueden recibir compras en borrador o parciales (estado actual: %)', v_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE purchases
     SET status = 'received', received_at = NOW(), received_by = v_uid, updated_at = NOW()
   WHERE id = p_purchase_id;

  RETURN jsonb_build_object('changed', true, 'status', 'received');
END;
$$;

-- 3. Rechazar: estado 'rejected' con motivo opcional. No borra nada ni toca inventario.
CREATE OR REPLACE FUNCTION public.reject_purchase(p_purchase_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_status TEXT;
  v_reason TEXT := NULLIF(btrim(p_reason), '');
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND active) THEN
    RAISE EXCEPTION 'Sesión no válida o usuario inactivo' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede superar 500 caracteres' USING ERRCODE = '22001';
  END IF;

  SELECT status INTO v_status FROM purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_status = 'rejected' THEN
    RETURN jsonb_build_object('changed', false, 'status', 'rejected');
  END IF;

  IF v_status NOT IN ('draft', 'partial') THEN
    RAISE EXCEPTION 'Solo se pueden rechazar compras en borrador o parciales (estado actual: %)', v_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE purchases
     SET status = 'rejected', rejected_at = NOW(), rejected_by = v_uid,
         rejection_reason = v_reason, updated_at = NOW()
   WHERE id = p_purchase_id;

  RETURN jsonb_build_object('changed', true, 'status', 'rejected');
END;
$$;

-- 4. Eliminar compra: solo administrador activo, y solo si no hay historial que conservar.
CREATE OR REPLACE FUNCTION public.delete_purchase(p_purchase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_status TEXT;
  v_docs INTEGER;
  v_ext INTEGER;
  v_movs INTEGER;
  v_lines INTEGER;
  v_motivos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
       SELECT 1 FROM profiles WHERE id = v_uid AND active AND role_id = 'admin') THEN
    RAISE EXCEPTION 'Solo administradores activos pueden eliminar compras' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status FROM purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra no encontrada' USING ERRCODE = 'P0002';
  END IF;

  -- Se cuentan TODOS los documentos (también los marcados como borrados): ON DELETE CASCADE los borraría.
  SELECT count(*) INTO v_docs FROM documents WHERE purchase_id = p_purchase_id;
  SELECT count(*) INTO v_ext FROM document_extractions WHERE purchase_id = p_purchase_id;
  SELECT count(*) INTO v_movs FROM stock_movements WHERE reference_type = 'purchase' AND reference_id = p_purchase_id;
  SELECT count(*) INTO v_lines FROM purchase_lines WHERE purchase_id = p_purchase_id;

  IF v_status = 'received' THEN
    v_motivos := array_append(v_motivos, 'la compra está recibida (su historial se conserva)');
  END IF;
  IF v_docs > 0 THEN
    v_motivos := array_append(v_motivos, format('%s documento(s) vinculado(s)', v_docs));
  END IF;
  IF v_ext > 0 THEN
    v_motivos := array_append(v_motivos, format('%s extracción(es) aprobada(s) o vinculada(s)', v_ext));
  END IF;
  IF v_movs > 0 THEN
    v_motivos := array_append(v_motivos, format('%s movimiento(s) de stock', v_movs));
  END IF;

  IF array_length(v_motivos, 1) > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar la compra: %', array_to_string(v_motivos, '; ')
      USING ERRCODE = '23503';
  END IF;

  -- Líneas borradas explícitamente (no por cascada) antes de la cabecera
  DELETE FROM purchase_lines WHERE purchase_id = p_purchase_id;
  DELETE FROM purchases WHERE id = p_purchase_id;

  RETURN jsonb_build_object('deleted', true, 'lines_deleted', v_lines);
END;
$$;

-- 5. Eliminar proveedor: solo administrador activo, bloqueado si tiene relaciones históricas.
CREATE OR REPLACE FUNCTION public.delete_supplier(p_supplier_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_compras INTEGER;
  v_productos INTEGER;
  v_gastos INTEGER;
  v_motivos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
       SELECT 1 FROM profiles WHERE id = v_uid AND active AND role_id = 'admin') THEN
    RAISE EXCEPTION 'Solo administradores activos pueden eliminar proveedores' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM suppliers WHERE id = p_supplier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proveedor no encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO v_compras FROM purchases WHERE supplier_id = p_supplier_id;
  SELECT count(*) INTO v_productos FROM products WHERE supplier_id = p_supplier_id;
  SELECT count(*) INTO v_gastos FROM expenses WHERE supplier_id = p_supplier_id;

  IF v_compras > 0 THEN
    v_motivos := array_append(v_motivos, format('%s compra(s)', v_compras));
  END IF;
  IF v_productos > 0 THEN
    v_motivos := array_append(v_motivos, format('%s producto(s)', v_productos));
  END IF;
  IF v_gastos > 0 THEN
    v_motivos := array_append(v_motivos, format('%s gasto(s)', v_gastos));
  END IF;

  IF array_length(v_motivos, 1) > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar el proveedor: tiene %', array_to_string(v_motivos, ', ')
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM suppliers WHERE id = p_supplier_id;
  RETURN jsonb_build_object('deleted', true);
END;
$$;

-- 6. Permisos: solo usuarios autenticados. Ningún acceso anónimo a las funciones nuevas.
REVOKE ALL ON FUNCTION public.receive_purchase(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_purchase(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_purchase(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_supplier(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_purchase(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_supplier(UUID) TO authenticated;

COMMIT;
