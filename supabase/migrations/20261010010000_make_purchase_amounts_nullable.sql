-- Migration: make_purchase_amounts_nullable
-- Purpose: Allow NULL values for unknown amounts in delivery notes
-- Impact: Enables distinction between zero amounts and unknown amounts

BEGIN;

-- Make columns nullable
ALTER TABLE public.purchases
  ALTER COLUMN subtotal DROP NOT NULL,
  ALTER COLUMN tax DROP NOT NULL,
  ALTER COLUMN total DROP NOT NULL;

-- Set new defaults to NULL (not 0)
ALTER TABLE public.purchases
  ALTER COLUMN subtotal SET DEFAULT NULL,
  ALTER COLUMN tax SET DEFAULT NULL,
  ALTER COLUMN total SET DEFAULT NULL;

-- Create index for queries filtering NULL amounts
CREATE INDEX IF NOT EXISTS idx_purchases_total_null
  ON public.purchases(total) WHERE total IS NULL;

-- Document the reason
COMMENT ON COLUMN public.purchases.subtotal IS 'NULL = amount unknown (e.g., delivery note without pricing). 0 = known zero amount.';
COMMENT ON COLUMN public.purchases.tax IS 'NULL = tax not specified. 0 = known zero tax.';
COMMENT ON COLUMN public.purchases.total IS 'NULL = total not specified. 0 = known zero total.';

COMMIT;
