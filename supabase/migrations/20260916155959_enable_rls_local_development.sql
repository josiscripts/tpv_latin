-- Políticas RLS para desarrollo LOCAL de Latin POS
-- Fecha: 2026-09-16
-- IMPORTANTE: Estas políticas son TEMPORALES para desarrollo local.
-- NO son aptas para producción.
-- Serán reemplazadas por políticas basadas en Supabase Auth cuando se implemente.
--
-- Esta migración permite al cliente con la clave pública (anon) acceder a las tablas
-- mientras se desarrolla la persistencia del frontend.
--
-- Después de implementar Supabase Auth se deberán crear políticas más restrictivas:
-- - basadas en roles de usuario (admin, gerente, vendedor, etc.)
-- - basadas en autenticación JWT válida
-- - con control granular por tabla

-- ============================================================================
-- POLÍTICAS RLS: CATEGORIES
-- ============================================================================

DROP POLICY IF EXISTS categories_deny_all ON categories;

CREATE POLICY categories_select_all
ON categories
FOR SELECT
USING (true);

CREATE POLICY categories_insert_anon
ON categories
FOR INSERT
WITH CHECK (true);

CREATE POLICY categories_update_anon
ON categories
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY categories_delete_anon
ON categories
FOR DELETE
USING (true);

-- ============================================================================
-- POLÍTICAS RLS: SUPPLIERS
-- ============================================================================

DROP POLICY IF EXISTS suppliers_deny_all ON suppliers;

CREATE POLICY suppliers_select_all
ON suppliers
FOR SELECT
USING (true);

CREATE POLICY suppliers_insert_anon
ON suppliers
FOR INSERT
WITH CHECK (true);

CREATE POLICY suppliers_update_anon
ON suppliers
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY suppliers_delete_anon
ON suppliers
FOR DELETE
USING (true);

-- ============================================================================
-- POLÍTICAS RLS: PRODUCTS
-- ============================================================================

DROP POLICY IF EXISTS products_deny_all ON products;

CREATE POLICY products_select_all
ON products
FOR SELECT
USING (true);

CREATE POLICY products_insert_anon
ON products
FOR INSERT
WITH CHECK (true);

CREATE POLICY products_update_anon
ON products
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY products_delete_anon
ON products
FOR DELETE
USING (true);

-- ============================================================================
-- POLÍTICAS RLS: PURCHASES
-- ============================================================================

DROP POLICY IF EXISTS purchases_deny_all ON purchases;

CREATE POLICY purchases_select_all
ON purchases
FOR SELECT
USING (true);

CREATE POLICY purchases_insert_anon
ON purchases
FOR INSERT
WITH CHECK (true);

CREATE POLICY purchases_update_anon
ON purchases
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY purchases_delete_anon
ON purchases
FOR DELETE
USING (true);

-- ============================================================================
-- POLÍTICAS RLS: PURCHASE_LINES
-- ============================================================================

DROP POLICY IF EXISTS purchase_lines_deny_all ON purchase_lines;

CREATE POLICY purchase_lines_select_all
ON purchase_lines
FOR SELECT
USING (true);

CREATE POLICY purchase_lines_insert_anon
ON purchase_lines
FOR INSERT
WITH CHECK (true);

CREATE POLICY purchase_lines_update_anon
ON purchase_lines
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY purchase_lines_delete_anon
ON purchase_lines
FOR DELETE
USING (true);

-- ============================================================================
-- POLÍTICAS RLS: SALES
-- ============================================================================

DROP POLICY IF EXISTS sales_deny_all ON sales;

CREATE POLICY sales_select_all
ON sales
FOR SELECT
USING (true);

CREATE POLICY sales_insert_anon
ON sales
FOR INSERT
WITH CHECK (true);

CREATE POLICY sales_update_anon
ON sales
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY sales_delete_anon
ON sales
FOR DELETE
USING (true);

-- ============================================================================
-- POLÍTICAS RLS: SALE_LINES
-- ============================================================================

DROP POLICY IF EXISTS sale_lines_deny_all ON sale_lines;

CREATE POLICY sale_lines_select_all
ON sale_lines
FOR SELECT
USING (true);

CREATE POLICY sale_lines_insert_anon
ON sale_lines
FOR INSERT
WITH CHECK (true);

CREATE POLICY sale_lines_update_anon
ON sale_lines
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY sale_lines_delete_anon
ON sale_lines
FOR DELETE
USING (true);

-- ============================================================================
-- POLÍTICAS RLS: STOCK_MOVEMENTS
-- ============================================================================

DROP POLICY IF EXISTS stock_movements_deny_all ON stock_movements;

CREATE POLICY stock_movements_select_all
ON stock_movements
FOR SELECT
USING (true);

CREATE POLICY stock_movements_insert_anon
ON stock_movements
FOR INSERT
WITH CHECK (true);

CREATE POLICY stock_movements_update_anon
ON stock_movements
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY stock_movements_delete_anon
ON stock_movements
FOR DELETE
USING (true);

-- ============================================================================
-- POLÍTICAS RLS: SYSME_PRODUCT_MAP
-- ============================================================================

DROP POLICY IF EXISTS sysme_product_map_deny_all ON sysme_product_map;

CREATE POLICY sysme_product_map_select_all
ON sysme_product_map
FOR SELECT
USING (true);

CREATE POLICY sysme_product_map_insert_anon
ON sysme_product_map
FOR INSERT
WITH CHECK (true);

CREATE POLICY sysme_product_map_update_anon
ON sysme_product_map
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY sysme_product_map_delete_anon
ON sysme_product_map
FOR DELETE
USING (true);

-- ============================================================================
-- POLÍTICAS RLS: SYNC_STATE
-- ============================================================================

DROP POLICY IF EXISTS sync_state_deny_all ON sync_state;

CREATE POLICY sync_state_select_all
ON sync_state
FOR SELECT
USING (true);

CREATE POLICY sync_state_insert_anon
ON sync_state
FOR INSERT
WITH CHECK (true);

CREATE POLICY sync_state_update_anon
ON sync_state
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY sync_state_delete_anon
ON sync_state
FOR DELETE
USING (true);

-- ============================================================================
-- POLÍTICAS RLS: SYNC_EVENTS
-- ============================================================================

DROP POLICY IF EXISTS sync_events_deny_all ON sync_events;

CREATE POLICY sync_events_select_all
ON sync_events
FOR SELECT
USING (true);

CREATE POLICY sync_events_insert_anon
ON sync_events
FOR INSERT
WITH CHECK (true);

CREATE POLICY sync_events_update_anon
ON sync_events
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY sync_events_delete_anon
ON sync_events
FOR DELETE
USING (true);

-- ============================================================================
-- POLÍTICAS RLS: BRIDGE_ERRORS
-- ============================================================================

DROP POLICY IF EXISTS bridge_errors_deny_all ON bridge_errors;

CREATE POLICY bridge_errors_select_all
ON bridge_errors
FOR SELECT
USING (true);

CREATE POLICY bridge_errors_insert_anon
ON bridge_errors
FOR INSERT
WITH CHECK (true);

CREATE POLICY bridge_errors_update_anon
ON bridge_errors
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY bridge_errors_delete_anon
ON bridge_errors
FOR DELETE
USING (true);

-- ============================================================================
-- POLÍTICAS RLS: EXPENSES
-- ============================================================================

DROP POLICY IF EXISTS expenses_deny_all ON expenses;

CREATE POLICY expenses_select_all
ON expenses
FOR SELECT
USING (true);

CREATE POLICY expenses_insert_anon
ON expenses
FOR INSERT
WITH CHECK (true);

CREATE POLICY expenses_update_anon
ON expenses
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY expenses_delete_anon
ON expenses
FOR DELETE
USING (true);

-- ============================================================================
-- FIN: Políticas RLS Desarrollo Local
-- ============================================================================
-- RECUERDA: Estas políticas NO son aptas para producción.
-- Cuando se implemente Supabase Auth, reemplaza estas políticas por:
-- - Restricción basada en usuario autenticado
-- - Restricción basada en rol de usuario
-- - Restricción basada en pertenencia a organización/tienda
-- - Restricción granular: quien puede leer/crear/editar/eliminar según su rol
