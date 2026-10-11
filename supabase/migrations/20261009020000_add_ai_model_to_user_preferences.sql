-- Add AI model selection to user preferences
-- Fecha: 2026-10-09
-- Propósito: Permitir que usuarios seleccionen modelo de Claude para procesamiento de documentos
-- Modelos permitidos: claude-haiku-4-5-20251001 (default), claude-sonnet-5

ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS ai_model_id TEXT
DEFAULT 'claude-haiku-4-5-20251001'
CONSTRAINT ai_model_id_valid CHECK (
  ai_model_id IN ('claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022', 'claude-haiku-5-5', 'claude-sonnet-5-5')
);

COMMENT ON COLUMN user_preferences.ai_model_id
IS 'Modelo de Claude seleccionado para procesamiento de documentos. Default: claude-haiku-4-5-20251001 (económico)';
