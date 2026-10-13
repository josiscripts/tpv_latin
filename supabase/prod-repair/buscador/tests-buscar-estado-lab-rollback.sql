-- PRUEBAS FILTRO DE ESTADO EN LAB. Datos PRUEBA-EST-*, transacción con ROLLBACK. No toca PROD.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.check(name text, ok boolean, detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok THEN RAISE NOTICE 'PASS  % %', name, detail; ELSE RAISE NOTICE 'FAIL  % %', name, detail; END IF;
END $$;

DO $t$
DECLARE
  ADM uuid;
  r jsonb;
  n_sub int; n_pro int; n_proc int; n_err int; n_ok int; n_total int;
BEGIN
  SELECT id INTO ADM FROM profiles WHERE role_id='admin' AND active LIMIT 1;

  INSERT INTO documents (document_type, original_name, file_path, file_size, processing_status, document_date, uploaded_by) VALUES
    ('invoice','PRUEBA-EST-a-subido.pdf','prueba/e1.pdf',1,'uploaded','2026-06-01',ADM),
    ('invoice','PRUEBA-EST-b-procesando.pdf','prueba/e2.pdf',1,'processing','2026-06-01',ADM),
    ('invoice','PRUEBA-EST-c-procesado.pdf','prueba/e3.pdf',1,'processed','2026-06-01',ADM),
    ('invoice','PRUEBA-EST-d-aprobado.pdf','prueba/e4.pdf',1,'approved','2026-06-01',ADM),
    ('invoice','PRUEBA-EST-e-rechazado.pdf','prueba/e5.pdf',1,'rejected','2026-06-01',ADM),
    ('invoice','PRUEBA-EST-f-error.pdf','prueba/e6.pdf',1,'error','2026-06-01',ADM);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  r := search_documents('PRUEBA-EST-', NULL, NULL, NULL, 50, 0, 'uploaded');
  PERFORM pg_temp.check('E1 Subido: solo uploaded', (r->>'total')::int = 1 AND r->'items'->0->>'processing_status' = 'uploaded');

  r := search_documents('PRUEBA-EST-', NULL, NULL, NULL, 50, 0, 'processing');
  PERFORM pg_temp.check('E2 Procesando: solo processing', (r->>'total')::int = 1 AND r->'items'->0->>'processing_status' = 'processing');

  r := search_documents('PRUEBA-EST-', NULL, NULL, NULL, 50, 0, 'processed');
  PERFORM pg_temp.check('E3 Procesado: processed, approved y rejected', (r->>'total')::int = 3, r->>'total');

  r := search_documents('PRUEBA-EST-', NULL, NULL, NULL, 50, 0, 'error');
  PERFORM pg_temp.check('E4 Error: solo error', (r->>'total')::int = 1 AND r->'items'->0->>'processing_status' = 'error');

  r := search_documents('PRUEBA-EST-', NULL, NULL, NULL, 50, 0, NULL);
  PERFORM pg_temp.check('E5 Todos (sin estado): los seis', (r->>'total')::int = 6, r->>'total');

  r := search_documents('PRUEBA-EST-', 'invoice', NULL, NULL, 50, 0, 'error');
  PERFORM pg_temp.check('E6 estado combinado con tipo', (r->>'total')::int = 1);

  r := search_documents('a-subido', NULL, NULL, NULL, 50, 0, 'error');
  PERFORM pg_temp.check('E7 estado combinado con búsqueda (sin coincidencia)', (r->>'total')::int = 0);

  BEGIN
    PERFORM search_documents('PRUEBA-EST-', NULL, NULL, NULL, 50, 0, 'inventado');
    PERFORM pg_temp.check('E8 estado no válido rechazado', false);
  EXCEPTION WHEN invalid_parameter_value THEN
    PERFORM pg_temp.check('E8 estado no válido rechazado', true);
  END;

  RESET ROLE;
END $t$;

ROLLBACK;
