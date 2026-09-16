-- Create bridge_config table for centralized configuration
-- Allows runtime parameter adjustment without redeploy
-- Fecha: 2026-09-17

-- ============================================================================
-- TABLA: bridge_config
-- ============================================================================
CREATE TABLE bridge_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  category TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,

  CONSTRAINT key_not_empty CHECK (LENGTH(TRIM(key)) > 0),
  CONSTRAINT value_not_empty CHECK (LENGTH(TRIM(value)) > 0)
);

CREATE TRIGGER bridge_config_updated_at
BEFORE UPDATE ON bridge_config
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_bridge_config_key ON bridge_config(key);
CREATE INDEX idx_bridge_config_category ON bridge_config(category);

-- ============================================================================
-- INSERTAR CONFIGURACIÓN INICIAL
-- ============================================================================
INSERT INTO bridge_config (key, value, description, category) VALUES
  ('polling_interval_ms', '300000', 'Intervalo entre sincronizaciones en milisegundos', 'timing'),
  ('batch_size', '1000', 'Máximo de ventas a procesar por lote', 'performance'),
  ('batch_timeout_ms', '30000', 'Timeout máximo para procesar un lote en milisegundos', 'performance'),
  ('max_retries', '5', 'Máximo número de reintentos antes de marcar como fallida', 'retry'),
  ('retry_backoff_seconds', '2', 'Base para backoff exponencial (2^n segundos)', 'retry'),
  ('enable_alerts', 'true', 'Habilitar alertas de errores', 'monitoring'),
  ('alert_threshold_errors', '10', 'Umbral de errores en 5 min para alertar', 'monitoring'),
  ('alert_threshold_pending_sales', '100', 'Umbral de ventas pending para alertar', 'monitoring')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- EXPLICACIÓN
-- ============================================================================
-- Parámetros iniciales:
--
-- TIMING:
--   polling_interval_ms: 300000 (5 minutos)
--     Intervalo entre ciclos de sincronización
--
-- PERFORMANCE:
--   batch_size: 1000
--     Máximo de ventas Sysme a leer y procesar por ciclo
--   batch_timeout_ms: 30000
--     Timeout máximo para procesar un lote (30 segundos)
--
-- RETRY:
--   max_retries: 5
--     Si una venta falla 5 veces, se marca como fallida permanente
--   retry_backoff_seconds: 2
--     Backoff exponencial: 2^1=2s, 2^2=4s, 2^3=8s, 2^4=16s, 2^5=32s
--
-- MONITORING:
--   enable_alerts: true
--     Activa el sistema de alertas
--   alert_threshold_errors: 10
--     Si hay >10 errores en 5 minutos, alerta
--   alert_threshold_pending_sales: 100
--     Si hay >100 ventas pending, alerta
--
-- El Bridge leerá esta tabla en el futuro y ajustará su comportamiento.
-- Cambios a esta tabla NO requieren redeploy.
-- Cambios toman efecto en el siguiente ciclo de sincronización.
