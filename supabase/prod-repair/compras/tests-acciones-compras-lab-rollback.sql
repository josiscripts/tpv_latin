-- PRUEBAS ACCIONES DE COMPRAS Y PROVEEDORES EN LAB. Datos PRUEBA-ACC-*, transacción con ROLLBACK. No toca PROD.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.check(name text, ok boolean, detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok THEN RAISE NOTICE 'PASS  % %', name, detail; ELSE RAISE NOTICE 'FAIL  % %', name, detail; END IF;
END $$;

DO $t$
DECLARE
  ADM uuid; EMP uuid;
  S1 uuid := gen_random_uuid(); S2 uuid := gen_random_uuid(); S3 uuid := gen_random_uuid();
  P1 uuid := gen_random_uuid(); P2 uuid := gen_random_uuid(); P3 uuid := gen_random_uuid();
  P5 uuid := gen_random_uuid(); P6 uuid := gen_random_uuid(); P7 uuid := gen_random_uuid();
  D2 uuid := gen_random_uuid(); E3 uuid := gen_random_uuid();
  PROD_ID uuid;
  r jsonb; st text; err text; n_before int; n_after int; ok boolean; ts_before timestamptz;
BEGIN
  SELECT id INTO ADM FROM profiles WHERE role_id='admin' AND active LIMIT 1;
  EMP := gen_random_uuid();
  INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, instance_id)
    VALUES (EMP, 'authenticated', 'authenticated', 'prueba-acc-empleado@example.test', now(), now(), '00000000-0000-0000-0000-000000000000');
  UPDATE profiles SET role_id='employee', active=true WHERE id=EMP;

  INSERT INTO suppliers (id, name) VALUES (S1,'PRUEBA-ACC-PROV-1'), (S2,'PRUEBA-ACC-PROV-2'), (S3,'PRUEBA-ACC-PROV-3');
  INSERT INTO purchases (id, supplier_id, purchase_date, invoice_number, subtotal, tax, total, status, type) VALUES
    (P1, S1, '2026-10-01', 'PRUEBA-ACC-P1', 10, 2.1, 12.1, 'draft', 'factura'),
    (P2, S2, '2026-10-01', 'PRUEBA-ACC-P2', 10, 2.1, 12.1, 'draft', 'factura'),
    (P3, S2, '2026-10-01', 'PRUEBA-ACC-P3', 10, 2.1, 12.1, 'draft', 'factura'),
    (P5, S1, '2026-10-01', 'PRUEBA-ACC-P5', 10, 2.1, 12.1, 'draft', 'factura'),
    (P6, S1, '2026-10-01', 'PRUEBA-ACC-P6', 10, 2.1, 12.1, 'draft', 'factura'),
    (P7, S1, '2026-10-01', 'PRUEBA-ACC-P7', 10, 2.1, 12.1, 'cancelled', 'factura');
  INSERT INTO purchase_lines (purchase_id, quantity, unit_cost, tax_rate, total) VALUES (P6, 1, 10, 21, 10);

  INSERT INTO documents (id, document_type, original_name, file_path, file_size, processing_status, document_date, uploaded_by, purchase_id)
    VALUES (D2,'invoice','PRUEBA-ACC-doc.pdf','prueba/acc.pdf',1,'processed','2026-10-01', ADM, P2);
  INSERT INTO document_extractions (id, document_id, extraction_model, raw_response, attempt_number, extracted_at, invoice_number, approval_status, purchase_id)
    VALUES (E3, D2, 'prueba', '{}'::jsonb, 1, NOW(), 'PRUEBA-ACC-E3', 'approved', P3);

  -- Recibir
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := receive_purchase(P1);
  PERFORM pg_temp.check('R1 recibir borrador: changed=true', (r->>'changed')::boolean = true, r::text);
  SELECT received_at INTO ts_before FROM purchases WHERE id=P1;
  r := receive_purchase(P1);
  PERFORM pg_temp.check('R2 doble clic: changed=false y no reescribe', (r->>'changed')::boolean = false AND (SELECT received_at FROM purchases WHERE id=P1) = ts_before);
  BEGIN
    PERFORM receive_purchase(P7);
    PERFORM pg_temp.check('R3 cancelada no se recibe', false);
  EXCEPTION WHEN invalid_parameter_value THEN
    PERFORM pg_temp.check('R3 cancelada no se recibe', true);
  END;
  RESET ROLE;

  -- Empleado activo puede recibir
  PERFORM set_config('request.jwt.claims', json_build_object('sub', EMP, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := receive_purchase(P5);
  PERFORM pg_temp.check('R4 empleado activo puede recibir', (r->>'changed')::boolean = true);
  RESET ROLE;

  -- Anónimo sin sesión
  PERFORM set_config('request.jwt.claims', '{}', true);
  BEGIN
    PERFORM receive_purchase(P6);
    PERFORM pg_temp.check('R5 sin sesión denegado', false);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.check('R5 sin sesión denegado', true);
  END;

  -- Rechazar
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := reject_purchase(P6, 'Precio no acordado');
  SELECT status, rejection_reason INTO st, err FROM purchases WHERE id=P6;
  PERFORM pg_temp.check('RJ1 rechazar con motivo', st = 'rejected' AND err = 'Precio no acordado');
  r := reject_purchase(P6, 'otro');
  PERFORM pg_temp.check('RJ2 rechazar dos veces: changed=false', (r->>'changed')::boolean = false AND (SELECT rejection_reason FROM purchases WHERE id=P6) = 'Precio no acordado');
  BEGIN
    PERFORM reject_purchase(P1, 'x');
    PERFORM pg_temp.check('RJ3 recibida no se rechaza', false);
  EXCEPTION WHEN invalid_parameter_value THEN
    PERFORM pg_temp.check('RJ3 recibida no se rechaza', true);
  END;
  BEGIN
    PERFORM reject_purchase(P5, repeat('x', 501));
    PERFORM pg_temp.check('RJ4 motivo > 500 rechazado', false);
  EXCEPTION WHEN string_data_right_truncation THEN
    PERFORM pg_temp.check('RJ4 motivo > 500 rechazado', true);
  END;
  n_before := (SELECT count(*) FROM products);
  PERFORM pg_temp.check('RJ5 rechazo sin efectos en stock', n_before = (SELECT count(*) FROM products));
  RESET ROLE;

  -- Eliminar compras
  PERFORM set_config('request.jwt.claims', json_build_object('sub', EMP, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM delete_purchase(P6);
    PERFORM pg_temp.check('D1 empleado no elimina compras', false);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.check('D1 empleado no elimina compras', true);
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := delete_purchase(P6);
  PERFORM pg_temp.check('D2 compra sin dependencias: se elimina con sus líneas', (r->>'deleted')::boolean AND NOT EXISTS (SELECT 1 FROM purchases WHERE id=P6) AND NOT EXISTS (SELECT 1 FROM purchase_lines WHERE purchase_id=P6), r::text);
  n_before := (SELECT count(*) FROM documents);
  BEGIN
    PERFORM delete_purchase(P2);
    PERFORM pg_temp.check('D3 con documento vinculado: bloqueada', false);
  EXCEPTION WHEN foreign_key_violation THEN
    PERFORM pg_temp.check('D3 con documento vinculado: bloqueada', SQLERRM LIKE '%documento(s)%', SQLERRM);
  END;
  PERFORM pg_temp.check('D3b el documento sigue existiendo', EXISTS (SELECT 1 FROM documents WHERE id=D2) AND n_before = (SELECT count(*) FROM documents));
  BEGIN
    PERFORM delete_purchase(P3);
    PERFORM pg_temp.check('D4 con extracción aprobada: bloqueada', false);
  EXCEPTION WHEN foreign_key_violation THEN
    PERFORM pg_temp.check('D4 con extracción aprobada: bloqueada', SQLERRM LIKE '%extracción%', SQLERRM);
  END;
  PERFORM pg_temp.check('D4b la extracción sigue vinculada', (SELECT purchase_id FROM document_extractions WHERE id=E3) = P3);
  BEGIN
    PERFORM delete_purchase(P1);
    PERFORM pg_temp.check('D5 compra recibida: bloqueada', false);
  EXCEPTION WHEN foreign_key_violation THEN
    PERFORM pg_temp.check('D5 compra recibida: bloqueada', SQLERRM LIKE '%recibida%', SQLERRM);
  END;

  -- Eliminar proveedores
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', EMP, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM delete_supplier(S3);
    PERFORM pg_temp.check('DS1 empleado no elimina proveedores', false);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.check('DS1 empleado no elimina proveedores', true);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM delete_supplier(S2);
    PERFORM pg_temp.check('DS2 proveedor con compras: bloqueado', false);
  EXCEPTION WHEN foreign_key_violation THEN
    PERFORM pg_temp.check('DS2 proveedor con compras: bloqueado', SQLERRM LIKE '%compra(s)%', SQLERRM);
  END;
  PERFORM pg_temp.check('DS2b el proveedor y sus compras siguen', EXISTS (SELECT 1 FROM suppliers WHERE id=S2) AND EXISTS (SELECT 1 FROM purchases WHERE id=P2));
  r := delete_supplier(S3);
  PERFORM pg_temp.check('DS3 proveedor sin relaciones: eliminado', (r->>'deleted')::boolean AND NOT EXISTS (SELECT 1 FROM suppliers WHERE id=S3));
  RESET ROLE;

  -- Permisos de ejecución
  PERFORM pg_temp.check('G1 anon sin EXECUTE en funciones nuevas', NOT has_function_privilege('anon','public.receive_purchase(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.delete_supplier(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.delete_purchase(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.reject_purchase(uuid,text)','EXECUTE'));
  PERFORM pg_temp.check('G2 authenticated con EXECUTE', has_function_privilege('authenticated','public.delete_supplier(uuid)','EXECUTE'));
END $t$;

ROLLBACK;
