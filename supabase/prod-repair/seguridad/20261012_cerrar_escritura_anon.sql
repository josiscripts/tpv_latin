-- SEGURIDAD: cerrar escritura de anon/public en compras, líneas, proveedores y productos.
-- Motivo: las políticas *_anon tenían USING/WITH CHECK (true) para el rol public, y anon tenía
-- privilegios de tabla completos (incluido TRUNCATE, que no pasa por RLS).
-- Efecto:
--   * anon: solo SELECT (sin cambios). Ninguna escritura ni TRUNCATE.
--   * authenticated con usuario activo: INSERT y UPDATE (uso normal de la aplicación).
--   * authenticated administrador activo: DELETE directo. Las funciones de borrado ya exigen admin.
--   * service_role (Bridge con SUPABASE_SERVICE_KEY): BYPASSRLS, sin cambios.
-- No modifica filas. No toca ventas, stock_movements ni otras tablas.
BEGIN;

-- 1. Privilegios de tabla: anon no escribe ni trunca; nadie trunca desde la aplicación
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.purchases, public.purchase_lines, public.suppliers, public.products FROM anon;
REVOKE TRUNCATE ON public.purchases, public.purchase_lines, public.suppliers, public.products FROM authenticated;

-- 2. Eliminar las políticas abiertas a public
DROP POLICY IF EXISTS purchases_insert_anon ON public.purchases;
DROP POLICY IF EXISTS purchases_update_anon ON public.purchases;
DROP POLICY IF EXISTS purchases_delete_anon ON public.purchases;
DROP POLICY IF EXISTS purchase_lines_insert_anon ON public.purchase_lines;
DROP POLICY IF EXISTS purchase_lines_update_anon ON public.purchase_lines;
DROP POLICY IF EXISTS purchase_lines_delete_anon ON public.purchase_lines;
DROP POLICY IF EXISTS suppliers_insert_anon ON public.suppliers;
DROP POLICY IF EXISTS suppliers_update_anon ON public.suppliers;
DROP POLICY IF EXISTS suppliers_delete_anon ON public.suppliers;
DROP POLICY IF EXISTS products_insert_anon ON public.products;
DROP POLICY IF EXISTS products_update_anon ON public.products;
DROP POLICY IF EXISTS products_delete_anon ON public.products;

-- 3. Políticas para authenticated. Usuario activo: escribe. Administrador activo: borra.
-- Los SELECT (purchases_select_all, purchase_lines_select_all, suppliers_select_all, products_select_all) no cambian.

-- purchases
CREATE POLICY purchases_insert_active ON public.purchases FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active));
CREATE POLICY purchases_update_active ON public.purchases FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active));
CREATE POLICY purchases_delete_admin ON public.purchases FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active AND p.role_id = 'admin'));

-- purchase_lines
CREATE POLICY purchase_lines_insert_active ON public.purchase_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active));
CREATE POLICY purchase_lines_update_active ON public.purchase_lines FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active));
CREATE POLICY purchase_lines_delete_admin ON public.purchase_lines FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active AND p.role_id = 'admin'));

-- suppliers
CREATE POLICY suppliers_insert_active ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active));
CREATE POLICY suppliers_update_active ON public.suppliers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active));
CREATE POLICY suppliers_delete_admin ON public.suppliers FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active AND p.role_id = 'admin'));

-- products
CREATE POLICY products_insert_active ON public.products FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active));
CREATE POLICY products_update_active ON public.products FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active));
CREATE POLICY products_delete_admin ON public.products FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active AND p.role_id = 'admin'));

COMMIT;
