-- PRUEBAS DE SEGURIDAD RLS EN LAB. Datos PRUEBA-SEG-*, transacción con ROLLBACK. No toca PROD.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.check(name text, ok boolean, detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok THEN RAISE NOTICE 'PASS  % %', name, detail; ELSE RAISE NOTICE 'FAIL  % %', name, detail; END IF;
END $$;

DO $t$
DECLARE
  ADM uuid; EMP uuid;
  PR uuid := gen_random_uuid(); PR2 uuid := gen_random_uuid();
  SU uuid := gen_random_uuid(); SU2 uuid := gen_random_uuid();
  PU uuid := gen_random_uuid(); PU2 uuid := gen_random_uuid();
  n int; denied boolean; stock_antes numeric; stock_despues numeric;
BEGIN
  SELECT id INTO ADM FROM profiles WHERE role_id='admin' AND active LIMIT 1;
  EMP := gen_random_uuid();
  INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, instance_id)
    VALUES (EMP, 'authenticated', 'authenticated', 'prueba-seg-empleado@example.test', now(), now(), '00000000-0000-0000-0000-000000000000');
  UPDATE profiles SET role_id='employee', active=true WHERE id=EMP;

  INSERT INTO products (id, name, sale_price, stock, active, tax_rate) VALUES (PR,'PRUEBA-SEG-PRODUCTO',10,5,true,21), (PR2,'PRUEBA-SEG-PRODUCTO-2',10,5,true,21);
  INSERT INTO suppliers (id, name) VALUES (SU,'PRUEBA-SEG-PROV'), (SU2,'PRUEBA-SEG-PROV-2');
  INSERT INTO purchases (id, supplier_id, purchase_date, invoice_number, subtotal, tax, total, status, type) VALUES
    (PU,SU,'2026-10-01','PRUEBA-SEG-C1',10,2.1,12.1,'draft','factura'),
    (PU2,SU2,'2026-10-01','PRUEBA-SEG-C2',10,2.1,12.1,'draft','factura');
  INSERT INTO purchase_lines (purchase_id, product_id, quantity, unit_cost, tax_rate, total) VALUES (PU, PR, 2, 5, 21, 10);

  -- ANÓNIMO (sin sesión): sin escritura ni TRUNCATE
  PERFORM set_config('request.jwt.claims', '{}', true);
  SET LOCAL ROLE anon;
  denied := false; BEGIN INSERT INTO products (name, sale_price, stock, active, tax_rate) VALUES ('PRUEBA-SEG-ANON',1,1,true,21); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('A1 anon no inserta productos', denied);
  denied := false; BEGIN UPDATE products SET stock = 999 WHERE id = PR; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('A2 anon no modifica productos', denied);
  denied := false; BEGIN DELETE FROM products WHERE id = PR2; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('A3 anon no elimina productos', denied);
  denied := false; BEGIN TRUNCATE products; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('A4 anon no trunca productos', denied);
  denied := false; BEGIN INSERT INTO suppliers (name) VALUES ('PRUEBA-SEG-ANON'); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('A5 anon no inserta proveedores', denied);
  denied := false; BEGIN UPDATE suppliers SET name='X' WHERE id = SU2; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('A6 anon no modifica proveedores', denied);
  denied := false; BEGIN DELETE FROM suppliers WHERE id = SU2; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('A7 anon no elimina proveedores', denied);
  denied := false; BEGIN INSERT INTO purchases (supplier_id, purchase_date, invoice_number, subtotal, tax, total, status, type) VALUES (SU2,'2026-10-01','PRUEBA-SEG-ANON',1,0,1,'draft','factura'); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('A8 anon no inserta compras', denied);
  denied := false; BEGIN UPDATE purchases SET status='received' WHERE id = PU2; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('A9 anon no modifica compras', denied);
  denied := false; BEGIN DELETE FROM purchases WHERE id = PU2; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('A10 anon no elimina compras', denied);
  denied := false; BEGIN INSERT INTO purchase_lines (purchase_id, quantity, unit_cost, tax_rate, total) VALUES (PU2, 1, 1, 21, 1); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('A11 anon no inserta líneas', denied);
  denied := false; BEGIN DELETE FROM purchase_lines WHERE purchase_id = PU; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('A12 anon no elimina líneas', denied);
  n := (SELECT count(*) FROM products WHERE id IN (PR, PR2));
  PERFORM pg_temp.check('A13 anon sí puede leer productos (SELECT conservado)', n = 2);
  RESET ROLE;

  -- EMPLEADO ACTIVO (no admin)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', EMP, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE products SET stock = 4 WHERE id = PR; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.check('U1 empleado actualiza producto (uso normal)', n = 1, format('filas=%s', n));
  INSERT INTO suppliers (name) VALUES ('PRUEBA-SEG-PROV-EMP'); GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.check('U2 empleado crea proveedor', n = 1);
  DELETE FROM products WHERE id = PR2; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.check('U3 empleado NO elimina producto (0 filas)', n = 0, format('filas=%s', n));
  DELETE FROM suppliers WHERE id = SU2; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.check('U4 empleado NO elimina proveedor directo (0 filas)', n = 0, format('filas=%s', n));
  DELETE FROM purchases WHERE id = PU2; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.check('U5 empleado NO elimina compra directa (0 filas)', n = 0, format('filas=%s', n));
  DELETE FROM purchase_lines WHERE purchase_id = PU; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.check('U6 empleado NO elimina líneas directas (0 filas)', n = 0, format('filas=%s', n));
  denied := false; BEGIN TRUNCATE products; EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  PERFORM pg_temp.check('U7 empleado no trunca', denied);
  BEGIN
    PERFORM delete_supplier(SU2);
    PERFORM pg_temp.check('U8 empleado no puede borrar proveedor por función', false);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.check('U8 empleado no puede borrar proveedor por función', true);
  END;
  RESET ROLE;

  -- EMPLEADO INACTIVO: sin escritura aunque tenga sesión
  UPDATE profiles SET active=false WHERE id=EMP;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', EMP, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE products SET stock = 3 WHERE id = PR; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.check('I1 usuario inactivo no actualiza productos', n = 0);
  RESET ROLE;
  UPDATE profiles SET active=true WHERE id=EMP;

  -- ADMINISTRADOR ACTIVO
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  DELETE FROM products WHERE id = PR2; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.check('M1 admin elimina producto', n = 1);
  DELETE FROM purchase_lines WHERE purchase_id = PU; DELETE FROM purchases WHERE id = PU2; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.check('M2 admin elimina compra sin dependencias por tabla', n = 1);
  PERFORM pg_temp.check('M3 admin elimina proveedor sin relaciones (función)', (delete_supplier(SU2)->>'deleted')::boolean);
  RESET ROLE;

  -- BRIDGE (service_role): sincronización sin RLS
  SET LOCAL ROLE service_role;
  UPDATE products SET stock = 7 WHERE id = PR; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.check('S1 Bridge (service_role) actualiza productos', n = 1);
  INSERT INTO products (id, name, sale_price, stock, active, tax_rate) VALUES (PR2, 'PRUEBA-SEG-BRIDGE', 1, 1, true, 21);
  PERFORM pg_temp.check('S2 Bridge inserta productos', true);
  DELETE FROM products WHERE id = PR2; GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.check('S3 Bridge elimina productos', n = 1);
  RESET ROLE;

  -- COMPRAS: recibir no cambia stock (la transición es solo de estado)
  SELECT stock INTO stock_antes FROM products WHERE id = PR;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ADM, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM receive_purchase(PU);
  RESET ROLE;
  SELECT stock INTO stock_despues FROM products WHERE id = PR;
  PERFORM pg_temp.check('C1 recibir compra no modifica stock', stock_antes = stock_despues, format('antes=%s despues=%s', stock_antes, stock_despues));
END $t$;

ROLLBACK;
