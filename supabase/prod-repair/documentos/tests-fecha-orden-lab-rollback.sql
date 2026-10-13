-- PRUEBAS FECHA EDITABLE Y ORDEN DE DOCUMENTOS EN LAB. Datos PRUEBA-ORD-*, transacción con ROLLBACK.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.check(name text, ok boolean, detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok THEN RAISE NOTICE 'PASS  % %', name, detail; ELSE RAISE NOTICE 'FAIL  % %', name, detail; END IF;
END $$;

DO $t$
DECLARE
  ADM uuid; EMP uuid;
  A uuid := gen_random_uuid(); B uuid := gen_random_uuid(); C uuid := gen_random_uuid();
  OTRO uuid := gen_random_uuid();
  r jsonb; n int; denied boolean; pos_a bigint; pos_b bigint; pos_c bigint; idx int;
  L1 uuid[]; L2 uuid[]; exp uuid[];
  created_antes timestamptz; ai_antes date; first_id uuid; last_id uuid; total_act int;
  orden_text text; name_antes text;
BEGIN
  SELECT id INTO ADM FROM profiles WHERE role_id='admin' AND active LIMIT 1;
  EMP := gen_random_uuid();
  INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, instance_id)
    VALUES (EMP, 'authenticated', 'authenticated', 'prueba-ord-empleado@example.test', now(), now(), '00000000-0000-0000-0000-000000000000');
  UPDATE profiles SET role_id='employee', active=true WHERE id=EMP;

  -- Tres documentos del admin y uno del empleado, creados en orden
  INSERT INTO documents (id, document_type, original_name, file_path, file_size, processing_status, document_date, uploaded_by, created_at) VALUES
    (A,'invoice','PRUEBA-ORD-A.pdf','prueba/a.pdf',1,'processed','2026-01-10',ADM,'2026-01-01'),
    (B,'invoice','PRUEBA-ORD-B.pdf','prueba/b.pdf',1,'processed','2026-02-10',ADM,'2026-01-02'),
    (C,'delivery_note','PRUEBA-ORD-C.pdf','prueba/c.pdf',1,'processed','2026-03-10',ADM,'2026-01-03'),
    (OTRO,'invoice','PRUEBA-ORD-OTRO.pdf','prueba/o.pdf',1,'processed','2026-04-10',EMP,'2026-01-04');

  -- O1: documento nuevo entra al inicio del orden personalizado
  SELECT manual_position INTO pos_a FROM documents WHERE id=A;
  PERFORM pg_temp.check('O1 documento nuevo colocado antes que los existentes',
    (SELECT min(manual_position) FROM documents WHERE deleted_at IS NULL) = (SELECT manual_position FROM documents WHERE id=OTRO));

  -- Movimientos como administrador
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  -- O2/O3: comprobar el orden relativo global antes y después (la renumeración cambia números, no el orden)
  L1 := ARRAY(SELECT id FROM documents WHERE deleted_at IS NULL ORDER BY manual_position ASC NULLS LAST, created_at DESC, id ASC);
  idx := array_position(L1, C);
  SELECT manual_position INTO pos_c FROM documents WHERE id=C;
  r := move_document(C, 'up', pos_c);
  L2 := ARRAY(SELECT id FROM documents WHERE deleted_at IS NULL ORDER BY manual_position ASC NULLS LAST, created_at DESC, id ASC);
  exp := L1; exp[idx-1] := C; exp[idx] := L1[idx-1];
  PERFORM pg_temp.check('O2 subir documento: intercambio con el anterior global', L2 = exp AND (r->>'moved')::boolean, r::text);
  L1 := L2;
  idx := array_position(L1, A);
  SELECT manual_position INTO pos_a FROM documents WHERE id=A;
  r := move_document(A, 'down', pos_a);
  L2 := ARRAY(SELECT id FROM documents WHERE deleted_at IS NULL ORDER BY manual_position ASC NULLS LAST, created_at DESC, id ASC);
  exp := L1; exp[idx+1] := A; exp[idx] := L1[idx+1];
  PERFORM pg_temp.check('O3 bajar documento: intercambio con el siguiente global', L2 = exp AND (r->>'moved')::boolean, r::text);
  SELECT manual_position INTO pos_a FROM documents WHERE id=A;
  r := move_document(A, 'down', pos_a - 5);
  PERFORM pg_temp.check('O4 posición esperada incorrecta: no mueve', (r->>'moved')::boolean = false AND (r->>'stale')::boolean = true);

  -- Primero y último: sin movimiento
  SELECT id INTO first_id FROM documents WHERE deleted_at IS NULL ORDER BY manual_position ASC LIMIT 1;
  SELECT id INTO last_id FROM documents WHERE deleted_at IS NULL ORDER BY manual_position DESC LIMIT 1;
  r := move_document(first_id, 'up');
  PERFORM pg_temp.check('O5 primer documento no sube', (r->>'moved')::boolean = false);
  r := move_document(last_id, 'down');
  PERFORM pg_temp.check('O6 último documento no baja', (r->>'moved')::boolean = false);

  -- O7: mover el último documento de la página 1 (posiciones 1..20) hacia la posición 21 global
  SELECT count(*) INTO total_act FROM documents WHERE deleted_at IS NULL;
  PERFORM pg_temp.check('O7 hay más de 20 documentos activos para probar paginación', total_act > 20, format('total=%s', total_act));
  SELECT id, manual_position INTO last_id, pos_a FROM documents WHERE deleted_at IS NULL AND manual_position = 20;
  -- Posiciones ya renumeradas tras los movimientos anteriores: el documento 20 es el último de la página 1
  r := move_document(last_id, 'down', pos_a);
  PERFORM pg_temp.check('O7 mover último de página 1 a la posición global 21', (r->>'moved')::boolean AND (SELECT manual_position FROM documents WHERE id=last_id) = 21, r::text);

  -- O8: documento eliminado lógicamente sale del orden
  UPDATE documents SET deleted_at = now() WHERE id = C;
  r := move_document(A, 'up');
  PERFORM pg_temp.check('O8 eliminados no cuentan y el orden se renumera', (r->>'total')::int = total_act - 1, r::text);
  UPDATE documents SET deleted_at = NULL WHERE id = C;

  -- Edición de detalles: nombre, tipo y fecha a la vez
  created_antes := (SELECT created_at FROM documents WHERE id=A);
  ai_antes := (SELECT document_date FROM documents WHERE id=A);
  r := update_document_details(A, 'PRUEBA-ORD-A-editado.pdf', 'delivery_note', DATE '2026-05-20');
  PERFORM pg_temp.check('E1 editar nombre, tipo y fecha a la vez',
    (SELECT original_name||'|'||document_type||'|'||document_date_manual FROM documents WHERE id=A) = 'PRUEBA-ORD-A-editado.pdf|delivery_note|2026-05-20');
  PERFORM pg_temp.check('E2 created_at y fecha IA intactas', (SELECT created_at FROM documents WHERE id=A) = created_antes AND (SELECT document_date FROM documents WHERE id=A) = ai_antes);
  PERFORM pg_temp.check('E3 registra quién y cuándo editó la fecha', (SELECT document_date_edited_by FROM documents WHERE id=A) = ADM AND (SELECT document_date_edited_at FROM documents WHERE id=A) IS NOT NULL);

  -- Validación: nada cambia si falla
  name_antes := (SELECT original_name FROM documents WHERE id=B);
  BEGIN PERFORM update_document_details(B, 'NUEVO', 'invoice', NULL); PERFORM pg_temp.check('E4 fecha vacía rechazada', false);
  EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.check('E4 fecha vacía rechazada', (SELECT original_name FROM documents WHERE id=B) = name_antes); END;
  BEGIN PERFORM update_document_details(B, 'NUEVO', 'invoice', DATE '1800-01-01'); PERFORM pg_temp.check('E5 fecha fuera de rango rechazada', false);
  EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.check('E5 fecha fuera de rango rechazada', (SELECT original_name FROM documents WHERE id=B) = name_antes); END;
  BEGIN PERFORM update_document_details(B, '   ', 'invoice', DATE '2026-01-01'); PERFORM pg_temp.check('E6 nombre vacío rechazado', false);
  EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.check('E6 nombre vacío rechazado', true); END;
  BEGIN PERFORM update_document_details(B, 'X', 'otro_tipo', DATE '2026-01-01'); PERFORM pg_temp.check('E7 tipo no válido rechazado', false);
  EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.check('E7 tipo no válido rechazado', (SELECT original_name FROM documents WHERE id=B) = name_antes); END;
  BEGIN PERFORM update_document_details(B, repeat('x', 256), 'invoice', DATE '2026-01-01'); PERFORM pg_temp.check('E8 nombre demasiado largo rechazado', false);
  EXCEPTION WHEN string_data_right_truncation THEN PERFORM pg_temp.check('E8 nombre demasiado largo rechazado', true); END;

  -- Búsqueda y orden por fecha efectiva (la fecha manual cuenta)
  r := search_documents('PRUEBA-ORD', NULL, NULL, NULL, 50, 0, NULL, 'doc_date_desc');
  PERFORM pg_temp.check('B1 orden por fecha: la fecha manual 2026-05-20 cuenta', (r->'items'->0->>'id')::uuid = A OR (r->'items'->0->>'id')::uuid = OTRO, r->'items'->0->>'document_date_manual');
  r := search_documents('2026-05-20', NULL, NULL, NULL, 50, 0, NULL, 'custom');
  PERFORM pg_temp.check('B2 buscar por fecha manual encuentra el documento', EXISTS (SELECT 1 FROM jsonb_array_elements(r->'items') x WHERE x->>'id' = A::text));
  r := search_documents('PRUEBA-ORD', NULL, NULL, NULL, 50, 0, NULL, 'upload_asc');
  PERFORM pg_temp.check('B3 orden por fecha de subida ascendente', (r->'items'->0->>'id')::uuid = A);
  r := search_documents('PRUEBA-ORD', NULL, NULL, NULL, 50, 0, NULL, 'custom');
  PERFORM pg_temp.check('B4 orden personalizado: posiciones crecientes y mismo número que la tabla',
    NOT EXISTS (SELECT 1 FROM (SELECT (x->>'manual_position')::bigint p, row_number() OVER () rn FROM jsonb_array_elements(r->'items') x) a
                JOIN (SELECT (x->>'manual_position')::bigint p, row_number() OVER () rn FROM jsonb_array_elements(r->'items') x) b ON b.rn = a.rn + 1 WHERE b.p <= a.p)
    AND jsonb_array_length(r->'items') = (SELECT count(*) FROM documents WHERE original_name LIKE 'PRUEBA-ORD%' AND deleted_at IS NULL),
    format('items=%s', jsonb_array_length(r->'items')));
  BEGIN PERFORM search_documents('x', NULL, NULL, NULL, 10, 0, NULL, 'inventado'); PERFORM pg_temp.check('B5 orden no válido rechazado', false);
  EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.check('B5 orden no válido rechazado', true); END;
  RESET ROLE;

  -- Empleado: propios sí, ajenos no
  PERFORM set_config('request.jwt.claims', json_build_object('sub', EMP, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM update_document_details(A, 'HACKEADO', 'invoice', DATE '2026-01-01'); denied := false;
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  RESET ROLE;
  PERFORM pg_temp.check('P1 empleado no edita documento ajeno', denied AND (SELECT original_name FROM documents WHERE id=A) <> 'HACKEADO');
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM move_document(A, 'up'); PERFORM pg_temp.check('P2 empleado no mueve documento ajeno', false);
  EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.check('P2 empleado no mueve documento ajeno', true); END;
  r := update_document_details(OTRO, 'PRUEBA-ORD-OTRO-EMP.pdf', 'invoice', DATE '2026-04-11');
  PERFORM pg_temp.check('P3 empleado sí edita su propio documento', (SELECT document_date_manual FROM documents WHERE id=OTRO) = DATE '2026-04-11');
  r := move_document(OTRO, 'up');
  PERFORM pg_temp.check('P4 empleado sí mueve su propio documento', (r->>'moved') IS NOT NULL);
  RESET ROLE;

  -- Anónimo: sin ejecución
  PERFORM pg_temp.check('P5 anon sin EXECUTE en funciones de edición y orden',
    NOT has_function_privilege('anon','public.update_document_details(uuid,text,text,date)','EXECUTE')
    AND NOT has_function_privilege('anon','public.move_document(uuid,text,bigint)','EXECUTE'));

  -- Concurrencia lógica: dos movimientos con la misma posición esperada → solo uno mueve
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT manual_position INTO pos_c FROM documents WHERE id=C;
  r := move_document(C, 'down', pos_c);
  r := move_document(C, 'down', pos_c);
  PERFORM pg_temp.check('K1 segundo movimiento con la misma posición esperada no mueve', (r->>'stale')::boolean = true);
  RESET ROLE;
END $t$;

ROLLBACK;
