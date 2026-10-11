-- Create category-images bucket for category image uploads
-- Fecha: 2026-10-06
-- Propósito: Enable image uploads for category personalization (name, description, image)

INSERT INTO storage.buckets (id, name, public)
VALUES ('category-images', 'category-images', true)
ON CONFLICT (id) DO NOTHING;
