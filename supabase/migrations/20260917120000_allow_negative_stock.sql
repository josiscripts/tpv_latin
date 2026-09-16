-- Allow negative stock in products and stock_movements
-- Sysme can operate with negative stock (overselling model)
-- Latin POS must reflect Sysme's actual stock state, including negatives
-- Fecha: 2026-09-17

-- ============================================================================
-- MODIFICAR: products.stock - PERMITIR NEGATIVOS
-- ============================================================================
-- Remover constraint que impedía stock negativo
ALTER TABLE products DROP CONSTRAINT stock_not_negative;

-- COMENTARIO: stock puede ahora ser cualquier valor (positivo, cero, negativo)
-- Refleja que Sysme puede tener stock negativo en almacen_complementg

-- ============================================================================
-- MODIFICAR: stock_movements - PERMITIR NEGATIVOS
-- ============================================================================
-- Remover constraints que impedían previous_stock y resulting_stock negativos
ALTER TABLE stock_movements DROP CONSTRAINT previous_stock_not_negative;
ALTER TABLE stock_movements DROP CONSTRAINT resulting_stock_not_negative;

-- COMENTARIO: Movimientos pueden ahora reflejar cambios hacia/desde negativos
-- Ejemplos:
--   purchase: 50 → 60 (normal)
--   sale: 50 → 40 (normal)
--   sale: 5 → -5 (ahora permitido, refleja overselling de Sysme)
--   sale_cancellation: -5 → 5 (revertir desde negativo)

-- ============================================================================
-- VALIDACIÓN DE DATOS EXISTENTES
-- ============================================================================
-- Verificar que no hay violaciones de constraints antes de proceder
-- (SQL Supabase ejecutará esto automáticamente)

-- SELECT COUNT(*) FROM products WHERE stock < 0;
-- SELECT COUNT(*) FROM stock_movements WHERE previous_stock < 0 OR resulting_stock < 0;
-- Espera: No debería haber ninguno, así que es seguro.
