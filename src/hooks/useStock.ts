import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stockService } from '@/services/stock.service';

const STOCK_KEY = ['stock'];

export function useStockMovements(productId?: string) {
  return useQuery({
    queryKey: [...STOCK_KEY, 'movements', productId],
    queryFn: () => stockService.getMovements(productId),
  });
}

export function useStockStatus(productId: string) {
  return useQuery({
    queryKey: [...STOCK_KEY, 'status', productId],
    queryFn: () => stockService.getStockStatus(productId),
  });
}

export function useCreateAdjustment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, delta, reason }: { productId: string; delta: number; reason: string }) =>
      stockService.registerAdjustment(productId, delta, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STOCK_KEY });
    },
  });
}
