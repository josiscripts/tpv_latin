import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsService } from '@/services/products.service';
import type { Database } from '@/lib/database.types';

type ProductInsert = Database['public']['Tables']['products']['Insert'];
type ProductUpdate = Database['public']['Tables']['products']['Update'];

const PRODUCTS_KEY = ['products'];

export function useProducts() {
  const query = useQuery({
    queryKey: PRODUCTS_KEY,
    queryFn: () => productsService.listActive(),
  });

  return query;
}

export function useProductSearch(query: string) {
  return useQuery({
    queryKey: [...PRODUCTS_KEY, 'search', query],
    queryFn: () => productsService.search(query),
    enabled: query.length > 0,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: [...PRODUCTS_KEY, id],
    queryFn: () => productsService.getById(id),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (product: ProductInsert) => productsService.create(product),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: ProductUpdate }) =>
      productsService.update(id, updates),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [...PRODUCTS_KEY, id] });
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => productsService.softDelete(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: [...PRODUCTS_KEY, id] });
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}

export function useUpdateProductStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, stock }: { id: string; stock: number }) =>
      productsService.updateStock(id, stock),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [...PRODUCTS_KEY, id] });
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });
}
