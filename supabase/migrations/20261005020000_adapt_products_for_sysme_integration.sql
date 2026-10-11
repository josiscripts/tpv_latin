-- Migration: Adapt products table to Sysme integration
-- Date: 2026-10-04
-- Purpose: Allow products from Sysme to exist with NULL values for fields Sysme doesn't provide
-- This is safe for existing data: only removes NOT NULL constraints and adds optional fields

-- ============================================================================
-- STEP 1: ALTER PRODUCTS TABLE - Make nullable fields that Sysme doesn't provide
-- ============================================================================

-- SKU: Sysme doesn't provide SKU, make nullable but keep UNIQUE constraint
ALTER TABLE products
  ALTER COLUMN sku DROP NOT NULL,
  -- Remove old check constraint and add new one that allows NULL
  DROP CONSTRAINT sku_not_empty;

-- Add new check constraint that only validates non-NULL values
ALTER TABLE products
  ADD CONSTRAINT sku_not_empty CHECK (sku IS NULL OR LENGTH(TRIM(sku)) > 0);

-- category_id: Sysme doesn't have categories, make nullable
ALTER TABLE products
  ALTER COLUMN category_id DROP NOT NULL,
  DROP CONSTRAINT products_category_id_fkey,
  ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id)
    REFERENCES categories(id) ON DELETE SET NULL;

-- cost_price: Sysme doesn't provide real cost, make nullable
ALTER TABLE products
  ALTER COLUMN cost_price DROP NOT NULL,
  DROP CONSTRAINT cost_price_positive,
  ADD CONSTRAINT cost_price_positive CHECK (cost_price IS NULL OR cost_price >= 0);

-- min_stock: Sysme may not always provide this, make nullable
ALTER TABLE products
  ALTER COLUMN min_stock DROP NOT NULL,
  DROP CONSTRAINT min_stock_not_negative,
  ADD CONSTRAINT min_stock_not_negative CHECK (min_stock IS NULL OR min_stock >= 0);

-- ============================================================================
-- STEP 2: ADD NEW COLUMNS for Sysme data
-- ============================================================================

-- tax_rate: Store product IVA (currently 21% for all, but allow flexibility)
-- This is needed because Sysme provides avgiva per line, should also be per product
ALTER TABLE products
  ADD COLUMN tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 21.00
    CHECK (tax_rate >= 0 AND tax_rate <= 100);

-- weight_kg: Sysme provides weight (peso field in complementog)
ALTER TABLE products
  ADD COLUMN weight_kg NUMERIC(8, 3) NULL;

-- metadata: Store optional technical Sysme fields (friendly name, flags, etc.)
-- Used ONLY for fields that are technical or metadata, not for business data
ALTER TABLE products
  ADD COLUMN metadata JSONB NULL;

-- ============================================================================
-- STEP 3: UPDATE EXISTING PRODUCTS with tax_rate
-- ============================================================================

-- All existing products have 21% IVA based on Sysme audit
-- This preserves current behavior while allowing variability in future
UPDATE products
SET tax_rate = 21.00
WHERE tax_rate = 21.00 OR tax_rate IS NULL;

-- ============================================================================
-- STEP 4: VERIFY data integrity
-- ============================================================================

-- Ensure no products were accidentally modified
-- This query should return the same count before and after
-- SELECT COUNT(*) FROM products;

-- Ensure sale_price is still NOT NULL (critical for operations)
-- SELECT COUNT(*) FROM products WHERE sale_price IS NULL;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

-- Summary of changes:
-- - SKU: NOT NULL -> NULL (with CHECK constraint)
-- - category_id: NOT NULL -> NULL (FK now SET NULL on delete)
-- - cost_price: NOT NULL -> NULL (with CHECK constraint)
-- - min_stock: NOT NULL -> NULL (with CHECK constraint)
-- + tax_rate: NEW, NUMERIC(5,2) NOT NULL DEFAULT 21.00
-- + weight_kg: NEW, NUMERIC(8,3) NULL
-- + metadata: NEW, JSONB NULL
--
-- Backward compatible: existing data preserved, only constraints relaxed
-- Bridge compatible: Bridge can still read all existing columns
-- RLS compatible: RLS policies unchanged
