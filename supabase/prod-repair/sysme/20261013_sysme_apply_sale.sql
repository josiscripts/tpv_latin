-- VENTAS SYSME: aplicación transaccional e idempotente.
-- Reemplaza la lógica de la Edge Function sysme-bridge-sync (que hacía varias escrituras sueltas
-- y restaba el stock sin bloqueo). Acepta el formato actual del Bridge (cantidad, PVPTiquet,
-- precio_compra, avgiva) y el formato anterior (quantity, unit_sale_price, unit_cost_at_time,
-- tax_rate, total_sale). Solo lo ejecuta service_role.
BEGIN;

CREATE OR REPLACE FUNCTION public.sysme_apply_sale(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venta TEXT := btrim(COALESCE(p_payload->>'sysme_id_venta', ''));
  v_sale_id UUID;
  v_line JSONB;
  v_product UUID;
  v_qty NUMERIC;
  v_price NUMERIC;
  v_cost NUMERIC;
  v_tax NUMERIC;
  v_disc NUMERIC;
  v_total_line NUMERIC;
  v_linea TEXT;
  v_stock_antes NUMERIC;
  v_lineas INTEGER := 0;
  v_user RECORD;
BEGIN
  IF v_venta = '' OR char_length(v_venta) > 64 THEN
    RAISE EXCEPTION 'sysme_id_venta no válido' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_payload->'lineas') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lineas') = 0 THEN
    RAISE EXCEPTION 'La venta no tiene líneas' USING ERRCODE = '22023';
  END IF;

  -- Serializa las peticiones de la misma venta (reintentos y duplicados simultáneos)
  PERFORM pg_advisory_xact_lock(hashtext('sysme_sale:' || v_venta));

  SELECT id INTO v_sale_id FROM sales WHERE sysme_id_venta = v_venta;
  IF FOUND THEN
    -- Ya aplicada: no se vuelve a tocar stock ni líneas
    RETURN jsonb_build_object('success', true, 'duplicate', true, 'saleId', v_sale_id);
  END IF;

  -- Validar todas las líneas antes de escribir nada
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
    BEGIN
      v_product := NULLIF(v_line->>'product_id', '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_product := NULL;
    END;
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Línea % sin producto mapeado en la aplicación', COALESCE(v_line->>'sysme_id_linea', '?')
        USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = v_product) THEN
      RAISE EXCEPTION 'Producto % de la línea % no existe', v_product, COALESCE(v_line->>'sysme_id_linea', '?')
        USING ERRCODE = '22023';
    END IF;
    v_qty := COALESCE(NULLIF(v_line->>'quantity', ''), NULLIF(v_line->>'cantidad', ''))::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Línea % con cantidad no válida', COALESCE(v_line->>'sysme_id_linea', '?')
        USING ERRCODE = '22023';
    END IF;
    v_price := COALESCE(NULLIF(v_line->>'unit_sale_price', ''), NULLIF(v_line->>'PVPTiquet', ''))::numeric;
    IF v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'Línea % sin precio de venta válido', COALESCE(v_line->>'sysme_id_linea', '?')
        USING ERRCODE = '22023';
    END IF;
    v_tax := COALESCE(NULLIF(v_line->>'tax_rate', ''), NULLIF(v_line->>'avgiva', ''))::numeric;
    IF v_tax IS NULL OR v_tax < 0 OR v_tax > 100 THEN
      RAISE EXCEPTION 'Línea % con IVA no válido', COALESCE(v_line->>'sysme_id_linea', '?')
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Cabecera de la venta
  INSERT INTO sales (source, status, sysme_id_venta, sysme_serie, sysme_id_tiquet, sale_date,
                     subtotal, tax, total, payment_method)
  VALUES ('sysme', 'completed', v_venta,
          COALESCE(p_payload->>'sysme_serie', 'A'),
          COALESCE(p_payload->>'sysme_id_tiquet', '0001'),
          COALESCE((p_payload->>'sale_date')::timestamptz, NOW()),
          COALESCE((p_payload->>'subtotal')::numeric, 0),
          COALESCE((p_payload->>'tax')::numeric, 0),
          COALESCE((p_payload->>'total')::numeric, 0),
          NULLIF(p_payload->>'payment_method', ''))
  RETURNING id INTO v_sale_id;

  -- Líneas y stock
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lineas') LOOP
    v_product := (v_line->>'product_id')::uuid;
    v_linea := COALESCE(v_line->>'sysme_id_linea', '');
    v_qty := COALESCE(NULLIF(v_line->>'quantity', ''), NULLIF(v_line->>'cantidad', ''))::numeric;
    v_price := COALESCE(NULLIF(v_line->>'unit_sale_price', ''), NULLIF(v_line->>'PVPTiquet', ''))::numeric;
    v_cost := COALESCE(NULLIF(v_line->>'unit_cost_at_time', ''), NULLIF(v_line->>'precio_compra', ''))::numeric;
    v_tax := COALESCE(NULLIF(v_line->>'tax_rate', ''), NULLIF(v_line->>'avgiva', ''))::numeric;
    v_disc := COALESCE(NULLIF(v_line->>'discount', ''), '0')::numeric;
    v_total_line := COALESCE(NULLIF(v_line->>'total_sale', ''), NULLIF(v_line->>'total', ''))::numeric;
    IF v_total_line IS NULL THEN v_total_line := v_qty * v_price; END IF;

    INSERT INTO sale_lines (sale_id, product_id, sysme_id_venta, sysme_id_linea, quantity,
                            unit_sale_price, unit_cost_at_time, tax_rate, discount, total_sale)
    VALUES (v_sale_id, v_product, v_venta, v_linea, v_qty, v_price, v_cost, v_tax, v_disc, v_total_line)
    ON CONFLICT (sysme_id_venta, sysme_id_linea) DO NOTHING;

    -- Descuento de stock atómico, con la fila del producto bloqueada
    SELECT stock INTO v_stock_antes FROM products WHERE id = v_product FOR UPDATE;
    UPDATE products SET stock = COALESCE(stock, 0) - v_qty WHERE id = v_product;

    INSERT INTO stock_movements (product_id, movement_type, quantity, previous_stock, resulting_stock,
                                 reference_type, reference_id, source, reason)
    VALUES (v_product, 'sale', -v_qty, COALESCE(v_stock_antes, 0), COALESCE(v_stock_antes, 0) - v_qty,
            'sale', v_sale_id, 'sysme_bridge', 'Venta Sysme ' || v_venta);

    v_lineas := v_lineas + 1;
  END LOOP;

  -- Notificaciones: un fallo aquí no revierte la venta
  BEGIN
    FOR v_user IN SELECT user_id FROM notification_preferences WHERE sales_enabled LOOP
      INSERT INTO notifications (user_id, sale_id, type, title, content, read)
      VALUES (v_user.user_id, v_sale_id, 'sale', 'Nueva venta: ' || v_venta,
              'Venta de ' || to_char(COALESCE((p_payload->>'total')::numeric, 0), 'FM999990.00') || '€ sincronizada desde Sysme',
              false);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Notificaciones de la venta %: %', v_venta, SQLERRM;
  END;

  -- Cursor: avanza solo hacia adelante y solo si el identificador es numérico
  UPDATE sync_state
     SET last_sync_at = NOW(),
         status = 'idle',
         last_finalized_sale_id = CASE
           WHEN v_venta ~ '^[0-9]+$' AND (last_finalized_sale_id IS NULL OR last_finalized_sale_id !~ '^[0-9]+$'
                 OR v_venta::bigint > last_finalized_sale_id::bigint)
           THEN v_venta ELSE last_finalized_sale_id END
   WHERE integration_name = 'sysme_bridge';

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'saleId', v_sale_id, 'lines', v_lineas);
END;
$$;

REVOKE ALL ON FUNCTION public.sysme_apply_sale(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sysme_apply_sale(JSONB) TO service_role;

COMMIT;
