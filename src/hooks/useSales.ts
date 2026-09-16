import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salesService } from '@/services/sales.service';
import type { Database } from '@/lib/database.types';

type SaleInsert = Database['public']['Tables']['sales']['Insert'];

interface CartItem {
  productId: string;
  quantity: number;
  unitSalePrice: number;
  discount?: number;
  taxRate?: number;
}

const SALES_KEY = ['sales'];

export function useSales() {
  const query = useQuery({
    queryKey: SALES_KEY,
    queryFn: () => salesService.listAll(),
  });

  return query;
}

export function useSale(id: string) {
  return useQuery({
    queryKey: [...SALES_KEY, id],
    queryFn: () => salesService.getById(id),
  });
}

export function useDailySales(date?: Date) {
  return useQuery({
    queryKey: [...SALES_KEY, 'daily', date?.toDateString()],
    queryFn: () => salesService.getDailySales(date),
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sale, cart }: { sale: Omit<SaleInsert, 'source'> & { source: 'latin_pos' | 'sysme' }; cart: CartItem[] }) =>
      salesService.createSale(sale, cart),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_KEY });
    },
  });
}

export function useCancelSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (saleId: string) => salesService.cancelSale(saleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SALES_KEY });
    },
  });
}
