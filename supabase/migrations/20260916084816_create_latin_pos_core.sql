-- Latin POS Core Schema
-- Fecha: 2026-09-16
-- Descripción: Esquema inicial para gestión de TPV, inventario, compras y ventas
-- Con soporte para integración con Sysme TPV e idempotencia de eventos

-- ============================================================================
-- EXTENSIONES
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- FUNCIÓN AUXILIAR: Actualizar updated_at automáticamente
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLA: CATEGORIES (Categorías de productos)
-- ============================================================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT name_not_empty CHECK (LENGTH(TRIM(name)) > 0)
);

CREATE TRIGGER categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_categories_active ON categories(active);

-- ============================================================================
-- TABLA: SUPPLIERS (Proveedores)
-- ============================================================================
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  tax_id TEXT UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT name_not_empty CHECK (LENGTH(TRIM(name)) > 0)
);

CREATE TRIGGER suppliers_updated_at
BEFORE UPDATE ON suppliers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_suppliers_active ON suppliers(active);
CREATE INDEX idx_suppliers_email ON suppliers(email);
CREATE INDEX idx_suppliers_tax_id ON suppliers(tax_id);

-- ============================================================================
-- TABLA: PRODUCTS (Catálogo de productos)
-- ============================================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  barcode TEXT UNIQUE,
  category_id UUID NOT NULL,
  supplier_id UUID,
  sale_price NUMERIC(10, 2) NOT NULL,
  cost_price NUMERIC(10, 2) NOT NULL,
  stock NUMERIC(12, 2) NOT NULL DEFAULT 0,
  min_stock NUMERIC(12, 2) NOT NULL DEFAULT 0,
  image TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,

  CONSTRAINT sku_not_empty CHECK (LENGTH(TRIM(sku)) > 0),
  CONSTRAINT name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT sale_price_positive CHECK (sale_price >= 0),
  CONSTRAINT cost_price_positive CHECK (cost_price >= 0),
  CONSTRAINT stock_not_negative CHECK (stock >= 0),
  CONSTRAINT min_stock_not_negative CHECK (min_stock >= 0),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE TRIGGER products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_supplier_id ON products(supplier_id);
CREATE INDEX idx_products_active ON products(active);
CREATE INDEX idx_products_deleted_at ON products(deleted_at);
CREATE INDEX idx_products_sku_trgm ON products USING gin(sku gin_trgm_ops);
CREATE INDEX idx_products_name_trgm ON products USING gin(name gin_trgm_ops);

-- ============================================================================
-- TABLA: PURCHASES (Cabecera de compras)
-- ============================================================================
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL,
  purchase_date DATE NOT NULL,
  invoice_number TEXT,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT status_valid CHECK (status IN ('draft', 'received', 'partial', 'cancelled')),
  CONSTRAINT subtotal_not_negative CHECK (subtotal >= 0),
  CONSTRAINT tax_not_negative CHECK (tax >= 0),
  CONSTRAINT total_not_negative CHECK (total >= 0),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT
);

CREATE TRIGGER purchases_updated_at
BEFORE UPDATE ON purchases
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX idx_purchases_status ON purchases(status);
CREATE INDEX idx_purchases_purchase_date ON purchases(purchase_date);
CREATE INDEX idx_purchases_invoice_number ON purchases(invoice_number);

-- ============================================================================
-- TABLA: PURCHASE_LINES (Líneas de compra)
-- ============================================================================
CREATE TABLE purchase_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL,
  unit_cost NUMERIC(10, 2) NOT NULL,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT quantity_positive CHECK (quantity > 0),
  CONSTRAINT unit_cost_positive CHECK (unit_cost >= 0),
  CONSTRAINT tax_rate_valid CHECK (tax_rate >= 0 AND tax_rate <= 100),
  CONSTRAINT total_not_negative CHECK (total >= 0),
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX idx_purchase_lines_purchase_id ON purchase_lines(purchase_id);
CREATE INDEX idx_purchase_lines_product_id ON purchase_lines(product_id);

-- ============================================================================
-- TABLA: SALES (Cabecera de ventas)
-- ============================================================================
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  sysme_id_venta TEXT UNIQUE,
  sysme_id_tiquet TEXT,
  sysme_serie TEXT,
  sale_date TIMESTAMPTZ NOT NULL,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMPTZ,

  CONSTRAINT source_valid CHECK (source IN ('sysme', 'latin_pos')),
  CONSTRAINT status_valid CHECK (status IN ('completed', 'cancelled', 'pending')),
  CONSTRAINT subtotal_not_negative CHECK (subtotal >= 0),
  CONSTRAINT tax_not_negative CHECK (tax >= 0),
  CONSTRAINT total_not_negative CHECK (total >= 0)
);

CREATE TRIGGER sales_updated_at
BEFORE UPDATE ON sales
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_sales_source ON sales(source);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_sales_sale_date ON sales(sale_date);
CREATE INDEX idx_sales_sysme_id_venta ON sales(sysme_id_venta);
CREATE INDEX idx_sales_sysme_tiquet ON sales(sysme_id_tiquet);
CREATE INDEX idx_sales_created_at ON sales(created_at);

-- ============================================================================
-- TABLA: SALE_LINES (Líneas de venta)
-- ============================================================================
CREATE TABLE sale_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL,
  product_id UUID NOT NULL,
  sysme_id_venta TEXT,
  sysme_id_linea TEXT,
  quantity NUMERIC(12, 2) NOT NULL,
  unit_sale_price NUMERIC(10, 2) NOT NULL,
  unit_cost_at_time NUMERIC(10, 2),
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_sale NUMERIC(12, 2) NOT NULL,
  total_cost NUMERIC(12, 2),
  gross_profit NUMERIC(12, 2),
  gross_margin_percent NUMERIC(5, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT quantity_positive CHECK (quantity > 0),
  CONSTRAINT unit_sale_price_not_negative CHECK (unit_sale_price >= 0),
  CONSTRAINT unit_cost_at_time_not_negative CHECK (unit_cost_at_time IS NULL OR unit_cost_at_time >= 0),
  CONSTRAINT tax_rate_valid CHECK (tax_rate >= 0 AND tax_rate <= 100),
  CONSTRAINT discount_not_negative CHECK (discount >= 0),
  CONSTRAINT total_sale_not_negative CHECK (total_sale >= 0),
  CONSTRAINT total_cost_not_negative CHECK (total_cost IS NULL OR total_cost >= 0),
  CONSTRAINT gross_profit_calculated CHECK (
    gross_profit IS NULL OR
    (unit_cost_at_time IS NOT NULL AND ABS(gross_profit - (total_sale - total_cost)) < 0.01)
  ),
  CONSTRAINT gross_margin_valid CHECK (
    gross_margin_percent IS NULL OR
    (gross_margin_percent >= -100 AND gross_margin_percent <= 100)
  ),
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX idx_sale_lines_sale_id ON sale_lines(sale_id);
CREATE INDEX idx_sale_lines_product_id ON sale_lines(product_id);
CREATE INDEX idx_sale_lines_sysme_venta ON sale_lines(sysme_id_venta);
CREATE INDEX idx_sale_lines_sysme_linea ON sale_lines(sysme_id_linea);

-- ============================================================================
-- TABLA: STOCK_MOVEMENTS (Historial de movimientos de stock)
-- ============================================================================
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  movement_type TEXT NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL,
  previous_stock NUMERIC(12, 2) NOT NULL,
  resulting_stock NUMERIC(12, 2) NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  source TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT movement_type_valid CHECK (
    movement_type IN ('purchase', 'sale', 'sale_cancellation', 'adjustment', 'sysme_reconciliation', 'initial_stock')
  ),
  CONSTRAINT previous_stock_not_negative CHECK (previous_stock >= 0),
  CONSTRAINT resulting_stock_not_negative CHECK (resulting_stock >= 0),
  CONSTRAINT source_not_empty CHECK (LENGTH(TRIM(source)) > 0),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE INDEX idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_movement_type ON stock_movements(movement_type);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
CREATE INDEX idx_stock_movements_source ON stock_movements(source);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at);

-- ============================================================================
-- TABLA: SYSME_PRODUCT_MAP (Mapeo Sysme ↔ Latin POS)
-- ============================================================================
CREATE TABLE sysme_product_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE,
  id_empresa TEXT NOT NULL,
  id_centro TEXT NOT NULL,
  id_tipo_comg TEXT NOT NULL,
  id_complementog TEXT NOT NULL,
  sysme_barcode TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (id_empresa, id_centro, id_tipo_comg, id_complementog),
  CONSTRAINT ids_not_empty CHECK (
    LENGTH(TRIM(id_empresa)) > 0 AND
    LENGTH(TRIM(id_centro)) > 0 AND
    LENGTH(TRIM(id_tipo_comg)) > 0 AND
    LENGTH(TRIM(id_complementog)) > 0
  ),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TRIGGER sysme_product_map_updated_at
BEFORE UPDATE ON sysme_product_map
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_sysme_product_map_product_id ON sysme_product_map(product_id);
CREATE INDEX idx_sysme_product_map_sysme_ids ON sysme_product_map(id_empresa, id_centro, id_tipo_comg, id_complementog);
CREATE INDEX idx_sysme_product_map_active ON sysme_product_map(active);

-- ============================================================================
-- TABLA: SYNC_STATE (Estado de sincronización del Bridge)
-- ============================================================================
CREATE TABLE sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_name TEXT NOT NULL UNIQUE,
  last_finalized_sale_id TEXT,
  last_sync_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'idle',
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT integration_name_not_empty CHECK (LENGTH(TRIM(integration_name)) > 0),
  CONSTRAINT status_valid CHECK (status IN ('idle', 'syncing', 'error'))
);

CREATE TRIGGER sync_state_updated_at
BEFORE UPDATE ON sync_state
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_sync_state_integration_name ON sync_state(integration_name);

-- Insertar estado inicial para Sysme Bridge
INSERT INTO sync_state (integration_name, status)
VALUES ('sysme_bridge', 'idle')
ON CONFLICT (integration_name) DO NOTHING;

-- ============================================================================
-- TABLA: SYNC_EVENTS (Eventos para idempotencia)
-- ============================================================================
CREATE TABLE sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_id TEXT,
  payload JSONB,
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT event_key_not_empty CHECK (LENGTH(TRIM(event_key)) > 0),
  CONSTRAINT source_not_empty CHECK (LENGTH(TRIM(source)) > 0),
  CONSTRAINT event_type_not_empty CHECK (LENGTH(TRIM(event_type)) > 0),
  CONSTRAINT status_valid CHECK (status IN ('pending', 'processed', 'failed', 'skipped'))
);

CREATE INDEX idx_sync_events_event_key ON sync_events(event_key);
CREATE INDEX idx_sync_events_status ON sync_events(status);
CREATE INDEX idx_sync_events_source ON sync_events(source);
CREATE INDEX idx_sync_events_event_type ON sync_events(event_type);
CREATE INDEX idx_sync_events_created_at ON sync_events(created_at);

-- ============================================================================
-- TABLA: BRIDGE_ERRORS (Registro de errores del Bridge)
-- ============================================================================
CREATE TABLE bridge_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  error_type TEXT NOT NULL,
  source TEXT NOT NULL,
  sysme_id_venta TEXT,
  sysme_id_linea TEXT,
  message TEXT NOT NULL,
  payload JSONB,
  resolved_at TIMESTAMPTZ,

  CONSTRAINT error_type_not_empty CHECK (LENGTH(TRIM(error_type)) > 0),
  CONSTRAINT source_not_empty CHECK (LENGTH(TRIM(source)) > 0),
  CONSTRAINT message_not_empty CHECK (LENGTH(TRIM(message)) > 0)
);

CREATE INDEX idx_bridge_errors_error_type ON bridge_errors(error_type);
CREATE INDEX idx_bridge_errors_source ON bridge_errors(source);
CREATE INDEX idx_bridge_errors_sysme_id_venta ON bridge_errors(sysme_id_venta);
CREATE INDEX idx_bridge_errors_resolved_at ON bridge_errors(resolved_at);
CREATE INDEX idx_bridge_errors_occurred_at ON bridge_errors(occurred_at);

-- ============================================================================
-- TABLA: EXPENSES (Gastos operativos)
-- ============================================================================
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  tax NUMERIC(12, 2) NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL,
  supplier_id UUID,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT category_not_empty CHECK (LENGTH(TRIM(category)) > 0),
  CONSTRAINT amount_not_negative CHECK (amount >= 0),
  CONSTRAINT tax_not_negative CHECK (tax >= 0),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE TRIGGER expenses_updated_at
BEFORE UPDATE ON expenses
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX idx_expenses_supplier_id ON expenses(supplier_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - Configuración base segura
-- ============================================================================
-- Habilitar RLS en todas las tablas
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sysme_product_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bridge_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Políticas base: Denegar todo por defecto
CREATE POLICY categories_deny_all ON categories USING (FALSE);
CREATE POLICY suppliers_deny_all ON suppliers USING (FALSE);
CREATE POLICY products_deny_all ON products USING (FALSE);
CREATE POLICY purchases_deny_all ON purchases USING (FALSE);
CREATE POLICY purchase_lines_deny_all ON purchase_lines USING (FALSE);
CREATE POLICY sales_deny_all ON sales USING (FALSE);
CREATE POLICY sale_lines_deny_all ON sale_lines USING (FALSE);
CREATE POLICY stock_movements_deny_all ON stock_movements USING (FALSE);
CREATE POLICY sysme_product_map_deny_all ON sysme_product_map USING (FALSE);
CREATE POLICY sync_state_deny_all ON sync_state USING (FALSE);
CREATE POLICY sync_events_deny_all ON sync_events USING (FALSE);
CREATE POLICY bridge_errors_deny_all ON bridge_errors USING (FALSE);
CREATE POLICY expenses_deny_all ON expenses USING (FALSE);

-- NOTA: Las políticas de lectura/escritura para autenticación de usuarios se añadirán
-- después de implementar autenticación. El Bridge Windows usará una autenticación separada
-- (service_role) que bypasea RLS.

-- ============================================================================
-- COMENTARIOS EXPLICATIVOS
-- ============================================================================
COMMENT ON TABLE products IS 'Catálogo de productos. cost_price es el coste actual conocido, pero la rentabilidad histórica debe calcularse con unit_cost_at_time de sale_lines.';
COMMENT ON TABLE sale_lines IS 'Líneas de venta. Cada línea almacena unit_cost_at_time para calcular beneficio histórico sin depender del cost_price actual del producto.';
COMMENT ON COLUMN sale_lines.unit_cost_at_time IS 'Coste unitario del producto en el momento de la venta. Obligatorio para ventas completadas. Jamás usar products.cost_price para histórico.';
COMMENT ON COLUMN sales.sysme_id_venta IS 'Identificador de venta en Sysme. Solo se importan ventas con cerrada = S.';
COMMENT ON TABLE sysme_product_map IS 'Mapeo explícito entre productos de Sysme (id_empresa, id_centro, id_tipo_comg, id_complementog) y productos de Latin POS. Nunca confiar únicamente en barcode.';
COMMENT ON TABLE sync_state IS 'Cursor de sincronización. last_finalized_sale_id debe avanzar SOLO sobre ventas finalizadas (cerrada = S en Sysme).';
COMMENT ON TABLE sync_events IS 'Eventos para idempotencia. El Bridge debe usar event_key único para evitar duplicados al reintentar.';
COMMENT ON TABLE bridge_errors IS 'Registro de errores del Bridge para auditoría y debugging.';
COMMENT ON TABLE expenses IS 'Gastos operativos. Para calcular resultado neto = beneficio bruto - gastos.';

-- ============================================================================
-- FIN DE MIGRACIÓN
-- ============================================================================
