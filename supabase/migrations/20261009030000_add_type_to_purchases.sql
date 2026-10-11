-- Add purchase type field for purchase classification
-- Supports: factura (invoice), albarán (delivery note), nota_crédito (credit note), etc.

ALTER TABLE purchases
ADD COLUMN type TEXT DEFAULT 'factura' NOT NULL;

CREATE INDEX idx_purchases_type ON purchases(type);
