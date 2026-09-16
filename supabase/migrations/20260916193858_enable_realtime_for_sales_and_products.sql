-- Enable Realtime for sales table
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;

-- Enable Realtime for products table
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
