-- Add sale_id to notifications for idempotency
-- Fecha: 2026-10-09
-- Objetivo: Asociar notificaciones de venta con su venta correspondiente
--           para garantizar que solo se cree UNA notificación por user+venta

-- 1. Agregar columna sale_id si no existe
DO $$ BEGIN
    ALTER TABLE notifications
    ADD COLUMN sale_id UUID;
EXCEPTION WHEN duplicate_column THEN
    -- Columna ya existe, ignorar
END $$;

-- 2. Agregar constraint de FK a sales si no existe
ALTER TABLE notifications
DROP CONSTRAINT IF EXISTS fk_notifications_sale_id;

ALTER TABLE notifications
ADD CONSTRAINT fk_notifications_sale_id
FOREIGN KEY (sale_id)
REFERENCES sales(id) ON DELETE CASCADE;

-- 3. Crear índice en sale_id para búsquedas rápidas
DROP INDEX IF EXISTS idx_notifications_sale_id;

CREATE INDEX idx_notifications_sale_id ON notifications(sale_id)
WHERE sale_id IS NOT NULL;

-- 4. Crear constraint UNIQUE para idempotencia usando índice único parcial
DROP INDEX IF EXISTS unique_user_sale_notification;

CREATE UNIQUE INDEX unique_user_sale_notification
ON notifications(user_id, sale_id)
WHERE sale_id IS NOT NULL;

-- 5. Agregar índice compuesto para queries frecuentes
DROP INDEX IF EXISTS idx_notifications_user_sale;

CREATE INDEX idx_notifications_user_sale ON notifications(user_id, sale_id)
WHERE sale_id IS NOT NULL;

-- 6. Actualizar comentario de columna
COMMENT ON COLUMN notifications.sale_id IS 'FK a sales.id para notificaciones de venta (NULL para otras notificaciones)';
