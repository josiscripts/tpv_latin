-- Allow NULL product_id in purchase_lines for lines without product mapping
-- This enables storing extracted lines before products are mapped
-- The user can later map them manually to actual products

ALTER TABLE public.purchase_lines
ALTER COLUMN product_id DROP NOT NULL;

COMMENT ON COLUMN public.purchase_lines.product_id IS
'Foreign key to products. NULL when product not yet mapped (lines extracted from documents before manual assignment).';
