-- Tabla de mapeo persistente: id_tipo_comg → category_id
-- Esta tabla permite que el Bridge resuelva automáticamente la categoría
-- de un producto en función de su id_empresa + id_centro + id_tipo_comg

-- Estructura genérica para ser reutilizada en cualquier instalación
-- Sin dependencia de datos específicos del laboratorio

CREATE TABLE tipo_comg_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identidad técnica del tipo de complemento en Sysme
  id_empresa TEXT NOT NULL,
  id_centro TEXT NOT NULL,
  id_tipo_comg TEXT NOT NULL,

  -- Categoría correspondiente en Supabase
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,

  -- Auditoría
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Restricción: una categoría única por identidad técnica
  UNIQUE(id_empresa, id_centro, id_tipo_comg)
);

-- Índices para búsqueda rápida
CREATE INDEX idx_tipo_comg_categories_empresa_centro_tipo
  ON tipo_comg_categories(id_empresa, id_centro, id_tipo_comg);

CREATE INDEX idx_tipo_comg_categories_category_id
  ON tipo_comg_categories(category_id);

-- Comentarios para documentación
COMMENT ON TABLE tipo_comg_categories IS
  'Mapeo persistente entre tipos de complemento Sysme y categorías TPV PRO. '
  'Permite que el Bridge resuelva automáticamente la categoría de un producto. '
  'Estructura genérica para ser utilizada en cualquier instalación.';

COMMENT ON COLUMN tipo_comg_categories.id_empresa IS
  'Empresa en Sysme (ej: 001). Parte de la identidad técnica del producto.';

COMMENT ON COLUMN tipo_comg_categories.id_centro IS
  'Centro en Sysme (ej: 01). Parte de la identidad técnica del producto.';

COMMENT ON COLUMN tipo_comg_categories.id_tipo_comg IS
  'Tipo de complemento en Sysme (ej: 0001, 0002, 0003). '
  'Se obtiene de complementog.id_tipo_comg.';

COMMENT ON COLUMN tipo_comg_categories.category_id IS
  'UUID de la categoría correspondiente en la tabla categories.';
