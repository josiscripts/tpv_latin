-- PRUEBAS FASE 3.1 EN LAB. Datos sintéticos (PRUEBA-…), transacción con ROLLBACK.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.check(name text, ok boolean, detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok THEN RAISE NOTICE 'PASS  % %', name, detail; ELSE RAISE NOTICE 'FAIL  % %', name, detail; END IF;
END $$;

DO $t$
DECLARE
  ADMIN uuid; SUP uuid;
  DOC1 uuid := 'ffffffff-0000-0000-0000-000000000001';
  EXT1 uuid := 'ffffffff-0000-0000-0000-000000000011';
  EXT2 uuid := 'ffffffff-0000-0000-0000-000000000012';
  EXT3 uuid := 'ffffffff-0000-0000-0000-000000000013';
  EXT4 uuid := 'ffffffff-0000-0000-0000-000000000014';
  EXT5 uuid := 'ffffffff-0000-0000-0000-000000000015';
  r RECORD; r2 RECORD; cnt INTEGER; pid UUID; errmsg TEXT; before_cnt INTEGER;
  lines_ok JSONB := '[{"description":"PRUEBA-LINEA-OK","quantity":2,"unit_price":5,"tax_rate":21},{"description":"PRUEBA-LINEA-SIN-PRECIO","quantity":1}]'::jsonb;
BEGIN
  SELECT id INTO ADMIN FROM auth.users LIMIT 1;
  SELECT id INTO SUP FROM suppliers LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ADMIN, 'role', 'authenticated')::text, true);
  -- Asegurar que el usuario de prueba es admin activo (dentro de la transacción)
  UPDATE profiles SET role_id = 'admin', active = true WHERE id = ADMIN;

  INSERT INTO documents (id, document_type, original_name, file_path, file_size, processing_status, document_date)
    VALUES (DOC1,'invoice','PRUEBA-F31.pdf','prueba/f31.pdf',1,'processed','2026-10-01');

  INSERT INTO document_extractions (id, document_id, extraction_model, raw_response, attempt_number, extracted_at,
    document_type_detected, invoice_number, invoice_date, subtotal, tax_total, tax_rate, total, lines_extracted, approval_status)
  VALUES (EXT1, DOC1, 'prueba', '{}'::jsonb, 1, NOW(), 'invoice', 'PRUEBA-INV-001', '2026-10-01', 10, 2.1, 21, 12.1, lines_ok, 'pending');

  -- A1 primera aprobación
  SELECT * INTO r FROM approve_extraction_create_purchase(EXT1, SUP);
  PERFORM pg_temp.check('A1 aprobación crea compra', r.created = true AND r.purchase_id IS NOT NULL, format('creada=%s lineas=%s omitidas=%s', r.created, r.lines_copied, r.lines_skipped));
  PERFORM pg_temp.check('A1 solo la línea completa se copia; la sin precio se omite', r.lines_copied = 1 AND r.lines_skipped = 1);
  PERFORM pg_temp.check('A1 línea copiada con total calculado 10', (SELECT count(*) FROM purchase_lines WHERE purchase_id=r.purchase_id AND total=10 AND unit_cost=5 AND quantity=2) = 1);
  pid := r.purchase_id;

  -- A2 respuesta perdida / reintento / doble clic: misma compra, ninguna nueva
  SELECT * INTO r2 FROM approve_extraction_create_purchase(EXT1, SUP);
  SELECT count(*) INTO cnt FROM purchases WHERE invoice_number='PRUEBA-INV-001';
  PERFORM pg_temp.check('A2 reintento devuelve la misma compra', r2.purchase_id = pid AND r2.created = false);
  PERFORM pg_temp.check('A2 sigue existiendo una sola compra', cnt = 1, format('compras=%s', cnt));
  PERFORM pg_temp.check('A3 extracción aprobada y documento vinculado', (SELECT approval_status||'|'||(purchase_id = pid) FROM document_extractions WHERE id=EXT1)='approved|true' AND (SELECT purchase_id FROM documents WHERE id=DOC1)=pid);

  -- A4 albarán sin importes: no se inventan importes ni líneas
  INSERT INTO document_extractions (id, document_id, extraction_model, raw_response, attempt_number, extracted_at,
    document_type_detected, invoice_number, invoice_date, subtotal, tax_total, tax_rate, total, lines_extracted, approval_status)
  VALUES (EXT2, DOC1, 'prueba', '{}'::jsonb, 2, NOW(), 'delivery_note', NULL, '2026-10-02', NULL, NULL, NULL, NULL,
    '[{"description":"PRUEBA-SIN-IMPORTE","quantity":3}]'::jsonb, 'pending');
  SELECT * INTO r FROM approve_extraction_create_purchase(EXT2, SUP);
  PERFORM pg_temp.check('A4 albarán sin importes se aprueba', r.created = true);
  PERFORM pg_temp.check('A4 cabecera con total NULL (no 0)', (SELECT total IS NULL AND subtotal IS NULL AND tax IS NULL FROM purchases WHERE id=r.purchase_id));
  PERFORM pg_temp.check('A4 tipo albarán', (SELECT type FROM purchases WHERE id=r.purchase_id)='albarán');
  PERFORM pg_temp.check('A4 línea sin precio no se copia con valor 0', r.lines_copied = 0 AND r.lines_skipped = 1 AND (SELECT count(*) FROM purchase_lines WHERE purchase_id=r.purchase_id) = 0);

  -- A5 misma factura en otra extracción: no crea duplicado
  INSERT INTO document_extractions (id, document_id, extraction_model, raw_response, attempt_number, extracted_at,
    document_type_detected, invoice_number, invoice_date, approval_status)
  VALUES (EXT3, DOC1, 'prueba', '{}'::jsonb, 3, NOW(), 'invoice', 'PRUEBA-INV-001', '2026-10-01', 'pending');
  BEGIN
    PERFORM approve_extraction_create_purchase(EXT3, SUP);
    PERFORM pg_temp.check('A5 factura duplicada bloqueada', false, 'no lanzó error');
  EXCEPTION WHEN unique_violation THEN
    PERFORM pg_temp.check('A5 factura duplicada bloqueada', true, SQLERRM);
  END;
  PERFORM pg_temp.check('A5 sin compra nueva para la extracción duplicada', (SELECT purchase_id IS NULL FROM document_extractions WHERE id=EXT3));

  -- A6 sin fecha: no se usa la fecha de hoy
  INSERT INTO documents (id, document_type, original_name, file_path, file_size, processing_status)
    VALUES ('ffffffff-0000-0000-0000-000000000006','invoice','PRUEBA-SIN-FECHA.pdf','prueba/sf.pdf',1,'processed');
  INSERT INTO document_extractions (id, document_id, extraction_model, raw_response, attempt_number, extracted_at,
    document_type_detected, invoice_number, invoice_date, approval_status)
  VALUES (EXT4, 'ffffffff-0000-0000-0000-000000000006', 'prueba', '{}'::jsonb, 1, NOW(), 'invoice', 'PRUEBA-SF', NULL, 'pending');
  BEGIN
    PERFORM approve_extraction_create_purchase(EXT4, SUP);
    PERFORM pg_temp.check('A6 sin fecha bloqueado', false, 'no lanzó error');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.check('A6 sin fecha bloqueado', SQLERRM LIKE 'Falta la fecha%', SQLERRM);
  END;

  -- A7 atomicidad: fallo a mitad (cantidad no numérica) no deja compra ni vínculos
  before_cnt := (SELECT count(*) FROM purchases);
  INSERT INTO document_extractions (id, document_id, extraction_model, raw_response, attempt_number, extracted_at,
    document_type_detected, invoice_number, invoice_date, approval_status, lines_extracted)
  VALUES (EXT5, DOC1, 'prueba', '{}'::jsonb, 4, NOW(), 'invoice', 'PRUEBA-ATOM', '2026-10-03', 'pending',
    '[{"description":"ok","quantity":1,"unit_price":1},{"description":"mal","quantity":"abc","unit_price":1}]'::jsonb);
  BEGIN
    PERFORM approve_extraction_create_purchase(EXT5, SUP);
    PERFORM pg_temp.check('A7 fallo a mitad lanza error', false, 'no lanzó error');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.check('A7 fallo a mitad lanza error', true, 'error de conversión');
  END;
  PERFORM pg_temp.check('A7 no queda compra ni vínculo', (SELECT count(*) FROM purchases) = before_cnt AND (SELECT purchase_id IS NULL AND approval_status='pending' FROM document_extractions WHERE id=EXT5));

  -- P1 empleado (no admin): denegado
  UPDATE profiles SET role_id = 'employee' WHERE id = ADMIN;
  BEGIN
    PERFORM approve_extraction_create_purchase(EXT5, SUP);
    PERFORM pg_temp.check('P1 empleado denegado', false, 'no lanzó error');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.check('P1 empleado denegado', true, SQLERRM);
  END;
  UPDATE profiles SET role_id = 'admin' WHERE id = ADMIN;

  -- P2 admin inactivo: denegado
  UPDATE profiles SET active = false WHERE id = ADMIN;
  BEGIN
    PERFORM approve_extraction_create_purchase(EXT5, SUP);
    PERFORM pg_temp.check('P2 admin inactivo denegado', false, 'no lanzó error');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.check('P2 admin inactivo denegado', true);
  END;
  UPDATE profiles SET active = true WHERE id = ADMIN;

  -- P3 sin sesión (sin sub): denegado
  PERFORM set_config('request.jwt.claims', '{}', true);
  BEGIN
    PERFORM approve_extraction_create_purchase(EXT5, SUP);
    PERFORM pg_temp.check('P3 sin sesión denegado', false, 'no lanzó error');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.check('P3 sin sesión denegado', true);
  END;

  -- P4 privilegios de ejecución
  PERFORM pg_temp.check('P4 anon sin EXECUTE', NOT has_function_privilege('anon','public.approve_extraction_create_purchase(uuid,uuid)','EXECUTE'));
  PERFORM pg_temp.check('P4 authenticated con EXECUTE (la validación de rol está en la función)', has_function_privilege('authenticated','public.approve_extraction_create_purchase(uuid,uuid)','EXECUTE'));
END $t$;

ROLLBACK;
