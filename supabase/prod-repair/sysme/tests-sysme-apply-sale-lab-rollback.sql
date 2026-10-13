-- PRUEBAS sysme_apply_sale EN LAB. Datos PRUEBA-SYS-*, transacción con ROLLBACK.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.check(name text, ok boolean, detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok THEN RAISE NOTICE 'PASS  % %', name, detail; ELSE RAISE NOTICE 'FAIL  % %', name, detail; END IF;
END $$;

DO $t$
DECLARE
  P1 uuid; P2 uuid; r jsonb; s1 numeric; s2 numeric; n int; err text; denied boolean;
  p_nuevo jsonb; p_antiguo jsonb; p_sin_producto jsonb; p_cantidad_cero jsonb;
BEGIN
  SELECT id INTO P1 FROM products WHERE active AND stock IS NOT NULL ORDER BY name LIMIT 1;
  SELECT id INTO P2 FROM products WHERE active AND id <> P1 ORDER BY name LIMIT 1;
  SELECT stock INTO s1 FROM products WHERE id = P1;
  SELECT stock INTO s2 FROM products WHERE id = P2;

  -- Formato ACTUAL del Bridge (sync-all.js)
  p_nuevo := jsonb_build_object('sysme_id_venta', 'PRUEBA-SYS-1', 'sysme_serie', 'A', 'sysme_id_tiquet', '0001',
    'sale_date', '2026-10-13T10:00:00.000Z', 'subtotal', 8.26, 'tax', 1.74, 'total', 10,
    'lineas', jsonb_build_array(
      jsonb_build_object('sysme_id_venta','PRUEBA-SYS-1','sysme_id_linea','1','product_id',P1,'cantidad',2,'PVPTiquet',3,'precio_compra',1.5,'total',6,'avgiva',21),
      jsonb_build_object('sysme_id_venta','PRUEBA-SYS-1','sysme_id_linea','2','product_id',P2,'cantidad',1,'PVPTiquet',4,'precio_compra',2,'total',4,'avgiva',10)));

  r := sysme_apply_sale(p_nuevo);
  PERFORM pg_temp.check('V1 formato actual: venta nueva aplicada', (r->>'success')::boolean AND NOT (r->>'duplicate')::boolean AND (r->>'lines')::int = 2, r::text);
  PERFORM pg_temp.check('V2 stock descontado exactamente', (SELECT stock FROM products WHERE id=P1) = s1 - 2 AND (SELECT stock FROM products WHERE id=P2) = s2 - 1);
  PERFORM pg_temp.check('V3 movimientos de venta: uno por línea', (SELECT count(*) FROM stock_movements WHERE reference_id = (r->>'saleId')::uuid AND movement_type='sale') = 2);
  PERFORM pg_temp.check('V4 líneas mapeadas (cantidad, PVP, coste, IVA)',
    EXISTS (SELECT 1 FROM sale_lines WHERE sysme_id_venta='PRUEBA-SYS-1' AND sysme_id_linea='1' AND quantity=2 AND unit_sale_price=3 AND unit_cost_at_time=1.5 AND tax_rate=21 AND total_sale=6));

  -- Reintento / duplicado: no toca stock ni líneas
  r := sysme_apply_sale(p_nuevo);
  PERFORM pg_temp.check('V5 reintento: duplicate=true sin cambios', (r->>'duplicate')::boolean AND (SELECT stock FROM products WHERE id=P1) = s1 - 2 AND (SELECT count(*) FROM sale_lines WHERE sysme_id_venta='PRUEBA-SYS-1') = 2);
  PERFORM pg_temp.check('V6 reintento: sin movimientos adicionales', (SELECT count(*) FROM stock_movements WHERE reference_id = (r->>'saleId')::uuid) = 2);

  -- Formato ANTERIOR (quantity, unit_sale_price, total_sale...)
  p_antiguo := jsonb_build_object('sysme_id_venta', 'PRUEBA-SYS-2', 'sysme_serie', 'A', 'sysme_id_tiquet', '0002',
    'sale_date', '2026-10-13T11:00:00Z', 'subtotal', 5, 'tax', 1.05, 'total', 6.05, 'payment_method', 'cash',
    'lineas', jsonb_build_array(
      jsonb_build_object('sysme_id_venta','PRUEBA-SYS-2','sysme_id_linea','9','product_id',P1,'quantity',1,'unit_sale_price',6.05,'unit_cost_at_time',2,'tax_rate',21,'discount',0,'total_sale',6.05)));
  r := sysme_apply_sale(p_antiguo);
  PERFORM pg_temp.check('V7 formato anterior aceptado', (r->>'success')::boolean AND (SELECT payment_method FROM sales WHERE sysme_id_venta='PRUEBA-SYS-2') = 'cash');

  -- Atomicidad: una línea sin producto impide escribir la venta
  p_sin_producto := jsonb_build_object('sysme_id_venta', 'PRUEBA-SYS-3', 'total', 3,
    'lineas', jsonb_build_array(
      jsonb_build_object('sysme_id_linea','1','product_id',P1,'cantidad',1,'PVPTiquet',3,'avgiva',21),
      jsonb_build_object('sysme_id_linea','2','product_id',NULL,'cantidad',1,'PVPTiquet',1,'avgiva',21)));
  BEGIN
    PERFORM sysme_apply_sale(p_sin_producto);
    PERFORM pg_temp.check('V8 línea sin producto rechazada', false);
  EXCEPTION WHEN invalid_parameter_value THEN
    PERFORM pg_temp.check('V8 línea sin producto rechazada', NOT EXISTS (SELECT 1 FROM sales WHERE sysme_id_venta='PRUEBA-SYS-3') AND NOT EXISTS (SELECT 1 FROM sale_lines WHERE sysme_id_venta='PRUEBA-SYS-3'), SQLERRM);
  END;
  PERFORM pg_temp.check('V9 stock intacto tras el rechazo', (SELECT stock FROM products WHERE id=P1) = s1 - 2 - 1);

  -- Cantidad cero
  p_cantidad_cero := jsonb_build_object('sysme_id_venta', 'PRUEBA-SYS-4',
    'lineas', jsonb_build_array(jsonb_build_object('sysme_id_linea','1','product_id',P1,'cantidad',0,'PVPTiquet',3,'avgiva',21)));
  BEGIN
    PERFORM sysme_apply_sale(p_cantidad_cero);
    PERFORM pg_temp.check('V10 cantidad 0 rechazada', false);
  EXCEPTION WHEN invalid_parameter_value THEN
    PERFORM pg_temp.check('V10 cantidad 0 rechazada', true);
  END;

  -- Venta sin líneas y identificador vacío
  BEGIN PERFORM sysme_apply_sale('{"sysme_id_venta":"PRUEBA-SYS-5","lineas":[]}'::jsonb); PERFORM pg_temp.check('V11 sin líneas rechazada', false);
  EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.check('V11 sin líneas rechazada', true); END;
  BEGIN PERFORM sysme_apply_sale(jsonb_build_object('sysme_id_venta','','lineas', jsonb_build_array(jsonb_build_object('sysme_id_linea','1','product_id',P1,'cantidad',1,'PVPTiquet',1,'avgiva',21)))); PERFORM pg_temp.check('V12 identificador vacío rechazado', false);
  EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.check('V12 identificador vacío rechazado', true); END;

  -- Cursor: avanza solo hacia adelante
  UPDATE sync_state SET last_finalized_sale_id = '500' WHERE integration_name='sysme_bridge';
  PERFORM sysme_apply_sale(jsonb_build_object('sysme_id_venta','400','lineas', jsonb_build_array(jsonb_build_object('sysme_id_linea','1','product_id',P2,'cantidad',1,'PVPTiquet',1,'avgiva',21))));
  PERFORM pg_temp.check('V13 cursor no retrocede', (SELECT last_finalized_sale_id FROM sync_state WHERE integration_name='sysme_bridge') = '500');
  PERFORM sysme_apply_sale(jsonb_build_object('sysme_id_venta','600','lineas', jsonb_build_array(jsonb_build_object('sysme_id_linea','1','product_id',P2,'cantidad',1,'PVPTiquet',1,'avgiva',21))));
  PERFORM pg_temp.check('V14 cursor avanza', (SELECT last_finalized_sale_id FROM sync_state WHERE integration_name='sysme_bridge') = '600');

  -- Permisos
  PERFORM pg_temp.check('V15 anon sin EXECUTE', NOT has_function_privilege('anon','public.sysme_apply_sale(jsonb)','EXECUTE'));
  PERFORM pg_temp.check('V16 authenticated sin EXECUTE', NOT has_function_privilege('authenticated','public.sysme_apply_sale(jsonb)','EXECUTE'));
  PERFORM pg_temp.check('V17 service_role con EXECUTE', has_function_privilege('service_role','public.sysme_apply_sale(jsonb)','EXECUTE'));
END $t$;

ROLLBACK;
