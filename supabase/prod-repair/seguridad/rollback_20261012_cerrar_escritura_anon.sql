-- REVERSIÓN de 20261012_cerrar_escritura_anon.sql: restaura las políticas y privilegios previos a PROD.
-- Solo para emergencias. Reintroduce la escritura abierta a anon.
BEGIN;

GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.purchases, public.purchase_lines, public.suppliers, public.products TO anon;
GRANT TRUNCATE ON public.purchases, public.purchase_lines, public.suppliers, public.products TO authenticated;

DROP POLICY IF EXISTS purchases_insert_active ON public.purchases;
DROP POLICY IF EXISTS purchases_update_active ON public.purchases;
DROP POLICY IF EXISTS purchases_delete_admin ON public.purchases;
DROP POLICY IF EXISTS purchase_lines_insert_active ON public.purchase_lines;
DROP POLICY IF EXISTS purchase_lines_update_active ON public.purchase_lines;
DROP POLICY IF EXISTS purchase_lines_delete_admin ON public.purchase_lines;
DROP POLICY IF EXISTS suppliers_insert_active ON public.suppliers;
DROP POLICY IF EXISTS suppliers_update_active ON public.suppliers;
DROP POLICY IF EXISTS suppliers_delete_admin ON public.suppliers;
DROP POLICY IF EXISTS products_insert_active ON public.products;
DROP POLICY IF EXISTS products_update_active ON public.products;
DROP POLICY IF EXISTS products_delete_admin ON public.products;

CREATE POLICY purchases_insert_anon ON public.purchases FOR INSERT TO public WITH CHECK (true);
CREATE POLICY purchases_update_anon ON public.purchases FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY purchases_delete_anon ON public.purchases FOR DELETE TO public USING (true);
CREATE POLICY purchase_lines_insert_anon ON public.purchase_lines FOR INSERT TO public WITH CHECK (true);
CREATE POLICY purchase_lines_update_anon ON public.purchase_lines FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY purchase_lines_delete_anon ON public.purchase_lines FOR DELETE TO public USING (true);
CREATE POLICY suppliers_insert_anon ON public.suppliers FOR INSERT TO public WITH CHECK (true);
CREATE POLICY suppliers_update_anon ON public.suppliers FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY suppliers_delete_anon ON public.suppliers FOR DELETE TO public USING (true);
CREATE POLICY products_insert_anon ON public.products FOR INSERT TO public WITH CHECK (true);
CREATE POLICY products_update_anon ON public.products FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY products_delete_anon ON public.products FOR DELETE TO public USING (true);

COMMIT;
