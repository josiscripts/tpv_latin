-- PRUEBAS DE PERMISOS FASE 2 EN LAB. Transacción con ROLLBACK. No toca PROD.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.check(name text, ok boolean, detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok THEN RAISE NOTICE 'PASS  % %', name, detail; ELSE RAISE NOTICE 'FAIL  % %', name, detail; END IF;
END $$;

DO $t$
DECLARE
  fn TEXT;
  sigs TEXT[] := ARRAY[
    'public.claim_document_for_processing(uuid, interval)',
    'public.persist_extraction_with_ownership(uuid, uuid, jsonb, text)',
    'public.finalize_document_as_processed(uuid, uuid, date)',
    'public.mark_document_as_error(uuid, uuid, text)',
    'public.recover_abandoned_documents(interval)'];
  denied BOOLEAN;
BEGIN
  FOREACH fn IN ARRAY sigs LOOP
    PERFORM pg_temp.check('anon sin EXECUTE ' || fn, NOT has_function_privilege('anon', fn, 'EXECUTE'));
    PERFORM pg_temp.check('authenticated sin EXECUTE ' || fn, NOT has_function_privilege('authenticated', fn, 'EXECUTE'));
    PERFORM pg_temp.check('public sin EXECUTE ' || fn, NOT has_function_privilege('public', fn, 'EXECUTE'));
    PERFORM pg_temp.check('service_role con EXECUTE ' || fn, has_function_privilege('service_role', fn, 'EXECUTE'));
  END LOOP;

  -- Llamadas reales como anon: deben fallar con permission denied
  SET LOCAL ROLE anon;
  denied := false;
  BEGIN PERFORM public.claim_document_for_processing(gen_random_uuid(), '1 minute'); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('anon no puede reclamar leases', denied);
  denied := false;
  BEGIN PERFORM public.recover_abandoned_documents('1 minute'); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('anon no puede recuperar documentos', denied);
  RESET ROLE;

  -- Llamada real como authenticated
  SET LOCAL ROLE authenticated;
  denied := false;
  BEGIN PERFORM public.finalize_document_as_processed(gen_random_uuid(), gen_random_uuid(), NULL); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('authenticated no puede finalizar leases ajenos', denied);
  denied := false;
  BEGIN PERFORM public.persist_extraction_with_ownership(gen_random_uuid(), gen_random_uuid(), '{}'::jsonb, 'x'); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('authenticated no puede guardar extracciones directamente', denied);
  RESET ROLE;

  -- service_role sí puede ejecutar (la Edge Function usa esta identidad)
  SET LOCAL ROLE service_role;
  denied := false;
  BEGIN PERFORM public.recover_abandoned_documents('1 minute'); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('service_role puede recuperar (no denegado)', NOT denied);
  RESET ROLE;
END $t$;

ROLLBACK;
