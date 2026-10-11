-- Create product-images bucket for Bridge image synchronization
-- Fecha: 2026-10-08
-- Propósito: Enable image synchronization from Sysme LAB via Bridge LAB

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;
