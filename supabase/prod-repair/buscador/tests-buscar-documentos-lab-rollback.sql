-- PRUEBAS BUSCADOR EN LAB. Datos sintéticos PRUEBA-BUSQ-*, transacción con ROLLBACK. No toca PROD.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.check(name text, ok boolean, detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok THEN RAISE NOTICE 'PASS  % %', name, detail; ELSE RAISE NOTICE 'FAIL  % %', name, detail; END IF;
END $$;

DO $t$
DECLARE
  ADM uuid; EMP uuid;
  D_NOMBRE uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  D_PROV   uuid := 'aaaaaaaa-0000-0000-0000-000000000002';
  D_NUM    uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  D_ALB    uuid := 'aaaaaaaa-0000-0000-0000-000000000004';
  D_FECHA  uuid := 'aaaaaaaa-0000-0000-0000-000000000005';
  D_ADMIN  uuid := 'aaaaaaaa-0000-0000-0000-000000000006';
  D_DOBLE  uuid := 'aaaaaaaa-0000-0000-0000-000000000007';
  r jsonb; r2 jsonb;
BEGIN
  SELECT id INTO ADM FROM profiles WHERE role_id='admin' AND active LIMIT 1;
  -- Empleado de prueba (solo dentro de esta transacción; se revierte con ROLLBACK)
  EMP := gen_random_uuid();
  INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, instance_id)
    VALUES (EMP, 'authenticated', 'authenticated', 'prueba-busq-empleado@example.test', now(), now(), '00000000-0000-0000-0000-000000000000');
  -- El alta en auth.users crea el perfil (trigger): se ajusta a empleado activo
  UPDATE profiles SET role_id = 'employee', active = true WHERE id = EMP;
  IF NOT FOUND THEN RAISE EXCEPTION 'no se creó el perfil de prueba'; END IF;

  INSERT INTO documents (id, document_type, original_name, file_path, file_size, processing_status, document_date, uploaded_by, created_at) VALUES
    (D_NOMBRE,'invoice','PRUEBA-BUSQ-factura-alfa.pdf','prueba/1.pdf',1,'processed','2026-01-05',EMP,'2026-01-05'),
    (D_PROV,'invoice','PRUEBA-BUSQ-proveedor.pdf','prueba/2.pdf',1,'processed','2026-02-01',EMP,'2026-02-01'),
    (D_NUM,'invoice','PRUEBA-BUSQ-numero.pdf','prueba/3.pdf',1,'processed','2026-02-02',EMP,'2026-02-02'),
    (D_ALB,'delivery_note','PRUEBA-BUSQ-albaran.pdf','prueba/4.pdf',1,'processed','2026-02-03',EMP,'2026-02-03'),
    (D_FECHA,'invoice','PRUEBA-BUSQ-fecha.pdf','prueba/5.pdf',1,'processed','2026-03-14',EMP,'2026-03-14'),
    (D_ADMIN,'invoice','PRUEBA-BUSQ-admin-privado.pdf','prueba/6.pdf',1,'processed','2026-02-04',ADM,'2026-02-04'),
    (D_DOBLE,'invoice','PRUEBA-BUSQ-doble.pdf','prueba/7.pdf',1,'processed','2026-02-05',EMP,'2026-02-05');

  INSERT INTO document_extractions (id, document_id, extraction_model, raw_response, attempt_number, extracted_at, vendor_name, invoice_number, invoice_date, approval_status) VALUES
    ('bbbbbbbb-0000-0000-0000-000000000002', D_PROV, 'prueba','{}'::jsonb,1,NOW(),'PRUEBA-BUSQ-ZETA SL','PRUEBA-X-1','2026-02-01',NULL),
    ('bbbbbbbb-0000-0000-0000-000000000003', D_NUM,  'prueba','{}'::jsonb,1,NOW(),NULL,'PRUEBA-NUM-7788','2026-02-02',NULL),
    ('bbbbbbbb-0000-0000-0000-000000000004', D_ALB,  'prueba','{}'::jsonb,1,NOW(),NULL,'PRUEBA-ALB-55','2026-02-03',NULL),
    ('bbbbbbbb-0000-0000-0000-000000000007', D_DOBLE,'prueba','{}'::jsonb,1,NOW(),'PRUEBA-BUSQ-ZETA SL','PRUEBA-DOB-1','2026-02-05',NULL),
    ('bbbbbbbb-0000-0000-0000-000000000008', D_DOBLE,'prueba','{}'::jsonb,2,NOW(),'PRUEBA-BUSQ-ZETA SL','PRUEBA-DOB-2','2026-02-05',NULL),
    ('bbbbbbbb-0000-0000-0000-000000000005', D_FECHA,'prueba','{}'::jsonb,1,NOW(),NULL,'PRUEBA-FECHA-1','2026-03-14',NULL);

  -- Proveedor vía compra aprobada (camino real de aprobación)
  INSERT INTO suppliers (name) VALUES ('PRUEBA-BUSQ-OMEGA SA');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM approve_extraction_create_purchase('bbbbbbbb-0000-0000-0000-000000000005', (SELECT id FROM suppliers WHERE name='PRUEBA-BUSQ-OMEGA SA'));
  RESET ROLE;

  -- Como administrador (ve todo)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := search_documents('alfa');
  PERFORM pg_temp.check('B1 busca por nombre de archivo', (r->>'total')::int = 1, r->>'total');
  r := search_documents('zeta');
  PERFORM pg_temp.check('B2 busca por proveedor (IA), sin distinguir mayúsculas', (r->>'total')::int = 2, r->>'total');
  PERFORM pg_temp.check('B3 sin duplicados con dos extracciones', (SELECT count(*) FROM jsonb_array_elements(r->'items') x WHERE x->>'id' = D_DOBLE::text) = 1);
  r := search_documents('7788');
  PERFORM pg_temp.check('B4 busca por número de factura', (r->>'total')::int = 1);
  r := search_documents('ALB-55');
  PERFORM pg_temp.check('B5 busca por número de albarán', (r->>'total')::int = 1 AND r->'items'->0->>'document_type' = 'delivery_note');
  r := search_documents('omega');
  PERFORM pg_temp.check('B6 busca por proveedor de compra aprobada', (r->>'total')::int = 1 AND r->'items'->0->>'id' = D_FECHA::text, r->>'total');
  r := search_documents('2026-03-14');
  PERFORM pg_temp.check('B7 busca por fecha ISO', EXISTS (SELECT 1 FROM jsonb_array_elements(r->'items') x WHERE x->>'id' = D_FECHA::text));
  r := search_documents('14/03/2026');
  PERFORM pg_temp.check('B8 busca por fecha dd/mm/aaaa', EXISTS (SELECT 1 FROM jsonb_array_elements(r->'items') x WHERE x->>'id' = D_FECHA::text));
  r := search_documents('NO-EXISTE-XYZ-123');
  PERFORM pg_temp.check('B9 sin coincidencias: total 0 e items vacío', (r->>'total')::int = 0 AND jsonb_array_length(r->'items') = 0);
  r := search_documents('%');
  PERFORM pg_temp.check('B10 comodín % se busca literalmente', (r->>'total')::int = 0, r->>'total');
  r := search_documents('_');
  r2 := search_documents(NULL);
  PERFORM pg_temp.check('B11 comodín _ no devuelve todo lo visible', (r->>'total')::int < (r2->>'total')::int, format('_=%s todos=%s', r->>'total', r2->>'total'));
  r := search_documents('PRUEBA-BUSQ', 'invoice');
  PERFORM pg_temp.check('B12 combinación con tipo: solo facturas', (r->>'delivery_notes')::int = 0 AND (r->>'invoices')::int >= 5, format('fact=%s alb=%s', r->>'invoices', r->>'delivery_notes'));
  r := search_documents('PRUEBA-BUSQ', 'delivery_note');
  PERFORM pg_temp.check('B13 combinación con tipo: solo albaranes', (r->>'total')::int = 1 AND (r->>'invoices')::int = 0);
  r := search_documents('PRUEBA-BUSQ', NULL, '2026-02-01T00:00:00Z', '2026-02-02T23:59:59Z');
  PERFORM pg_temp.check('B14 combinación con rango de fechas', (r->>'total')::int = 2, r->>'total');
  r := search_documents('zeta', NULL, NULL, NULL, 1, 0);
  r2 := search_documents('zeta', NULL, NULL, NULL, 1, 1);
  PERFORM pg_temp.check('B15 paginación: total estable y páginas distintas', (r->>'total') = (r2->>'total') AND r->'items'->0->>'id' <> r2->'items'->0->>'id', format('total=%s', r->>'total'));
  PERFORM pg_temp.check('B16 no expone processing_lease_token', NOT (r->'items'->0 ? 'processing_lease_token'));
  BEGIN
    PERFORM search_documents('x', NULL, NULL, NULL, 0, 0);
    PERFORM pg_temp.check('B17 límite 0 rechazado', false);
  EXCEPTION WHEN invalid_parameter_value THEN
    PERFORM pg_temp.check('B17 límite 0 rechazado', true);
  END;
  RESET ROLE;

  -- Como empleado: RLS, solo sus documentos
  PERFORM set_config('request.jwt.claims', json_build_object('sub', EMP, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := search_documents('admin-privado');
  PERFORM pg_temp.check('P1 empleado no ve documentos de otro usuario', (r->>'total')::int = 0, r->>'total');
  r := search_documents('alfa');
  PERFORM pg_temp.check('P2 empleado sí ve los suyos', (r->>'total')::int = 1);
  RESET ROLE;

  PERFORM pg_temp.check('P3 anon sin EXECUTE', NOT has_function_privilege('anon', 'public.search_documents(text,text,timestamptz,timestamptz,integer,integer)', 'EXECUTE'));
  PERFORM pg_temp.check('P4 authenticated con EXECUTE', has_function_privilege('authenticated', 'public.search_documents(text,text,timestamptz,timestamptz,integer,integer)', 'EXECUTE'));
END $t$;

ROLLBACK;
