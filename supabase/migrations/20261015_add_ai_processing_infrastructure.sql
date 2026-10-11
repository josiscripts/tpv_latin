-- FASE 3: IA Processing Infrastructure
-- Fecha: 2026-10-15
-- Propósito: Agregar capacidad de procesamiento de documentos con IA

-- ============================================================================
-- 1. EXTENSIÓN: tabla documents
-- ============================================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'uploaded'
  CONSTRAINT processing_status_valid CHECK (
    processing_status IN ('uploaded', 'processing', 'processed', 'approved', 'rejected', 'error')
  );

ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_error TEXT;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_date DATE;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_documents_processing_status
  ON documents(processing_status);

CREATE INDEX IF NOT EXISTS idx_documents_document_date
  ON documents(document_date);

-- ============================================================================
-- 2. NUEVA TABLA: document_extractions
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK a documento
  document_id UUID NOT NULL
    REFERENCES documents(id) ON DELETE CASCADE,

  -- Modelo IA usado
  extraction_model TEXT NOT NULL,

  -- Timestamps
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Clasificación del documento
  document_type_detected TEXT
    CONSTRAINT doc_type_detected_valid CHECK (
      document_type_detected IN ('invoice', 'delivery_note', 'unknown')
    ),

  -- CABECERA: Información del proveedor
  vendor_name TEXT,
  vendor_tax_id TEXT,
  vendor_address TEXT,

  -- CABECERA: Información de factura/documento
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  currency TEXT DEFAULT 'EUR',

  -- TOTALES
  subtotal NUMERIC(12, 2),
  tax_total NUMERIC(12, 2),
  tax_rate NUMERIC(5, 2),
  total NUMERIC(12, 2),

  -- LÍNEAS: JSON array con líneas extraídas
  lines_extracted JSONB,

  -- Texto bruto extraído (fallback)
  raw_text_extracted TEXT,

  -- Respuesta completa de IA (para debugging y reprocesamiento)
  raw_response JSONB NOT NULL,

  -- Confianza de la extracción
  confidence_score NUMERIC(3, 2)
    CONSTRAINT confidence_valid CHECK (
      confidence_score >= 0 AND confidence_score <= 1
    ),

  confidence_supplier NUMERIC(3, 2),
  confidence_invoice NUMERIC(3, 2),
  confidence_lines NUMERIC(3, 2),

  -- Estado del procesamiento
  processing_state TEXT DEFAULT 'extracted'
    CONSTRAINT processing_state_valid CHECK (
      processing_state IN ('extracted', 'validated', 'matched', 'error')
    ),

  processing_error TEXT,

  -- Número de intento (para múltiples reintentos)
  attempt_number INTEGER DEFAULT 1,

  -- Notas adicionales
  notes TEXT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_extractions_document_id
  ON document_extractions(document_id);

CREATE INDEX IF NOT EXISTS idx_extractions_created_at
  ON document_extractions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_extractions_attempt
  ON document_extractions(document_id, attempt_number DESC);

CREATE INDEX IF NOT EXISTS idx_extractions_confidence
  ON document_extractions(confidence_score DESC);

-- ============================================================================
-- 3. RLS: document_extractions
-- ============================================================================

ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;

-- SELECT: Usuario puede ver extracciones de sus propios documentos o admin
CREATE POLICY "extractions_select_own_document"
ON document_extractions
FOR SELECT
USING (
  document_id IN (
    SELECT id FROM documents
    WHERE deleted_at IS NULL
  )
);

-- INSERT: Solo el sistema (Edge Functions con SERVICE_ROLE_KEY)
-- Implícitamente DENY_ALL (no hay policy INSERT)

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE document_extractions
  IS 'Almacena extracciones de IA de documentos. Una extracción por intento, historiales preservados.';

COMMENT ON COLUMN document_extractions.raw_response
  IS 'Respuesta completa del modelo IA (JSON). Necesario para debugging, reprocesamiento, y auditoría.';

COMMENT ON COLUMN document_extractions.lines_extracted
  IS 'Array JSON de líneas detectadas. Estructura: [{sku, ean, description, quantity, unit_price, tax_rate, ...}]';

COMMENT ON COLUMN documents.processing_status
  IS 'Estado: uploaded | processing | processed | approved | rejected | error';

-- ============================================================================
-- VERSIONADO DE MIGRACIONES
-- ============================================================================

-- Esta migración:
-- - Agrega capacidad IA a documents
-- - Crea tabla para historiar extracciones
-- - Habilita reprocesamiento y auditoría
-- - NO implementa confirmación (FASE 6)
-- - NO implementa recepción (FASE 8)
