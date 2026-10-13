-- SEGURIDAD: quitar escritura a anon en ventas, stock y tablas de sincronización con Sysme.
-- Se revocan privilegios de tabla de anon (no se tocan las políticas). Los usuarios autenticados
-- conservan su acceso actual. service_role (Bridge y funciones) no cambia: tiene BYPASSRLS.
-- Las ventas de Sysme ya se aplican con sysme_apply_sale (solo service_role).
-- Solo se revocan las tablas que existen en el entorno (LAB no tiene sysme_category_map).
BEGIN;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales','sale_lines','stock_movements','sync_state','sysme_product_map',
                           'sysme_category_map','expenses','categories','bridge_errors','sync_events'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
