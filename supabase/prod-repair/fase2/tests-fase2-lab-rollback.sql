-- PRUEBAS FASE 2 EN LAB. Datos sintéticos MARCADOS COMO PRUEBA, dentro de una transacción con ROLLBACK.
-- Ejecutar: contenido del candidato (sin BEGIN/COMMIT) + este fichero. No toca PROD.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.check(name text, ok boolean, detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok THEN RAISE NOTICE 'PASS  % %', name, detail; ELSE RAISE NOTICE 'FAIL  % %', name, detail; END IF;
END $$;

DO $t$
DECLARE
  A uuid := 'aaaaaaaa-0000-0000-0000-000000000001';  -- flujo completo
  B uuid := 'bbbbbbbb-0000-0000-0000-000000000002';  -- lease expirado CON extracción
  C uuid := 'cccccccc-0000-0000-0000-000000000003';  -- lease expirado SIN extracción
  D uuid := 'dddddddd-0000-0000-0000-000000000004';  -- lease vigente (no debe tocarse)
  lease uuid; wrong uuid := gen_random_uuid(); ext1 uuid; ext2 uuid; ok boolean; n int; rec record;
  js jsonb := '{"document_type_detected":"invoice","vendor_name":"PRUEBA-PROVEEDOR","vendor_tax_id":"X0000000T","invoice_number":"TEST-001","invoice_date":"2026-10-01","due_date":null,"currency":"EUR","subtotal":10,"tax_total":2.1,"tax_rate":21,"total":12.1,"lines_extracted":[{"description":"linea prueba","quantity":1,"unit_price":10}],"confidence_score":0.9,"raw_response":{"confidence":{"supplier":0.9,"invoice_number":0.8,"lines":0.7},"extraction":{"invoice":{"date":"2026-10-01"}}}}'::jsonb;
BEGIN
  INSERT INTO documents (id, document_type, original_name, file_path, file_size, processing_status) VALUES
    (A,'invoice','PRUEBA-A.pdf','prueba/a.pdf',1,'uploaded'),
    (B,'invoice','PRUEBA-B.pdf','prueba/b.pdf',1,'uploaded'),
    (C,'invoice','PRUEBA-C.pdf','prueba/c.pdf',1,'uploaded'),
    (D,'invoice','PRUEBA-D.pdf','prueba/d.pdf',1,'uploaded');

  -- S1 flujo completo: uploaded -> processing -> processed
  lease := claim_document_for_processing(A);
  PERFORM pg_temp.check('S1 claim desde uploaded', lease IS NOT NULL);
  SELECT processing_status INTO rec FROM documents WHERE id=A;
  PERFORM pg_temp.check('S1 estado tras claim = processing', (SELECT processing_status FROM documents WHERE id=A)='processing');
  ext1 := persist_extraction_with_ownership(A, lease, js, 'modelo-prueba');
  PERFORM pg_temp.check('S1 persist devuelve id', ext1 IS NOT NULL);
  SELECT vendor_name, invoice_number, invoice_date, total, lines_extracted IS NOT NULL AS has_lines INTO rec FROM document_extractions WHERE id=ext1;
  PERFORM pg_temp.check('S1 columnas tipadas rellenadas', rec.vendor_name='PRUEBA-PROVEEDOR' AND rec.invoice_number='TEST-001' AND rec.invoice_date='2026-10-01' AND rec.total=12.10 AND rec.has_lines, format('vendor=%s inv=%s date=%s total=%s', rec.vendor_name, rec.invoice_number, rec.invoice_date, rec.total));
  ext2 := persist_extraction_with_ownership(A, lease, js, 'modelo-prueba');
  SELECT count(*) INTO n FROM document_extractions WHERE document_id=A;
  PERFORM pg_temp.check('S1 persist idempotente (mismo intento -> misma fila)', ext1=ext2 AND n=1, format('filas=%s', n));
  ok := finalize_document_as_processed(A, lease, NULL);
  PERFORM pg_temp.check('S1 finalize con lease válido -> true (sin error SQL)', ok);
  PERFORM pg_temp.check('S1 estado final = processed', (SELECT processing_status FROM documents WHERE id=A)='processed');
  PERFORM pg_temp.check('S1 lease liberado', (SELECT processing_lease_token FROM documents WHERE id=A) IS NULL);

  -- S2 lease ajeno: finalize y mark no cambian nada
  lease := claim_document_for_processing(C);
  ok := finalize_document_as_processed(C, wrong, NULL);
  PERFORM pg_temp.check('S2 finalize con lease ajeno -> false', ok = false);
  ok := mark_document_as_error(C, wrong, 'x');
  PERFORM pg_temp.check('S2 mark con lease ajeno -> false', ok = false);
  PERFORM pg_temp.check('S2 documento sigue en processing con su lease', (SELECT processing_status FROM documents WHERE id=C)='processing' AND (SELECT processing_lease_token FROM documents WHERE id=C)=lease);

  -- S3 mark_error con lease válido (antes fallaba por tipo)
  ok := mark_document_as_error(C, lease, 'error de prueba');
  PERFORM pg_temp.check('S3 mark con lease válido -> true', ok);
  PERFORM pg_temp.check('S3 estado = error con motivo', (SELECT processing_status||'|'||processing_error FROM documents WHERE id=C)='error|error de prueba');

  -- S4 recuperación: B (expirado con extracción), C ya está en error, D vigente
  lease := claim_document_for_processing(B);
  PERFORM persist_extraction_with_ownership(B, lease, js, 'modelo-prueba');
  lease := claim_document_for_processing(D);
  UPDATE documents SET processing_lease_expires_at = NOW() - interval '1 hour' WHERE id IN (B);
  UPDATE documents SET processing_status='processing', processing_lease_token=gen_random_uuid(), processing_lease_expires_at=NOW() - interval '10 minutes' WHERE id = C;
  -- C: expirado, sin extracción -> error ; B: expirado con extracción -> processed ; D: vigente -> intacto
  SELECT count(*) INTO n FROM documents WHERE processing_status='processing' AND processing_lease_expires_at < NOW() AND id NOT IN (B,C);
  SELECT * INTO rec FROM recover_abandoned_documents();
  PERFORM pg_temp.check('S4 recuperación cubre B y C más los atascados previos de LAB', rec.recovered_count + rec.error_recovery_count = n + 2 AND rec.recovered_count >= 1 AND rec.error_recovery_count >= 1, format('previos=%s processed=%s error=%s', n, rec.recovered_count, rec.error_recovery_count));
  PERFORM pg_temp.check('S4 B -> processed (sin reprocesar)', (SELECT processing_status FROM documents WHERE id=B)='processed');
  PERFORM pg_temp.check('S4 C -> error con motivo', (SELECT processing_status FROM documents WHERE id=C)='error' AND (SELECT processing_error FROM documents WHERE id=C) LIKE 'Lease expirado%');
  PERFORM pg_temp.check('S4 D (vigente) intacto', (SELECT processing_status FROM documents WHERE id=D)='processing');
  PERFORM pg_temp.check('S4 no se borró ninguna extracción', (SELECT count(*) FROM document_extractions WHERE document_id=B)=1);

  -- S5 permisos de recuperación
  PERFORM pg_temp.check('S5 authenticated NO puede ejecutar recover', NOT has_function_privilege('authenticated','public.recover_abandoned_documents(interval)','EXECUTE'));
  PERFORM pg_temp.check('S5 service_role SÍ puede ejecutar recover', has_function_privilege('service_role','public.recover_abandoned_documents(interval)','EXECUTE'));

  -- S6 claim sigue funcionando sobre uploaded y no sobre processed
  PERFORM pg_temp.check('S6 claim rechaza documento processed', claim_document_for_processing(A) IS NULL);
END $t$;

ROLLBACK;
