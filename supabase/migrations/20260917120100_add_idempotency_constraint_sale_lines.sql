-- Add idempotency constraint for sale_lines
-- UNIQUE(sysme_id_venta, sysme_id_linea) ensures idempotent processing
-- If Bridge retries a sale, it won't create duplicate lines
-- Fecha: 2026-09-17

-- ============================================================================
-- VERIFICACIÓN PREVIA: No deben existir duplicados
-- ============================================================================
-- SELECT
--   sysme_id_venta,
--   sysme_id_linea,
--   COUNT(*)
-- FROM sale_lines
-- WHERE sysme_id_venta IS NOT NULL AND sysme_id_linea IS NOT NULL
-- GROUP BY sysme_id_venta, sysme_id_linea
-- HAVING COUNT(*) > 1;
--
-- Si esta consulta retorna filas, hay duplicados y no podemos proceder.
-- Esperado: 0 filas duplicadas (ya que es esquema nuevo).

-- ============================================================================
-- AGREGAR: Constraint UNIQUE para idempotencia
-- ============================================================================
ALTER TABLE sale_lines
ADD CONSTRAINT unique_sysme_sale_line UNIQUE (sysme_id_venta, sysme_id_linea);

-- ============================================================================
-- EXPLICACIÓN
-- ============================================================================
-- El constraint permite NULL en ambas columnas simultáneamente.
-- En PostgreSQL, UNIQUE constraints tratan NULL como "no duplicado".
-- Esto es correcto porque:
--   1. Líneas creadas localmente (sin Sysme) tendrán NULL en sysme_id_venta/sysme_id_linea
--   2. Múltiples líneas locales pueden existir sin violar el constraint
--   3. Solo líneas Sysme (no-NULL) son forzadas a ser únicas por pareja
--
-- Tres niveles de idempotencia:
--   1. sync_events.event_key UNIQUE         → Evento no duplicado
--   2. sales.sysme_id_venta UNIQUE          → Venta no duplicada
--   3. sale_lines(sysme_id_venta, sysme_id_linea) UNIQUE  → Línea no duplicada
--
-- Resultado: Bridge puede reintentar cualquier venta sin crear duplicados
