import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchasesService } from '@/services/purchases.service';
import type { Database } from '@/lib/database.types';

type PurchaseInsert = Database['public']['Tables']['purchases']['Insert'];
type PurchaseLineInsert = Database['public']['Tables']['purchase_lines']['Insert'];

const PURCHASES_KEY = ['purchases'];

export function usePurchases() {
  return useQuery({
    queryKey: PURCHASES_KEY,
    queryFn: () => purchasesService.listAll(),
  });
}

export function usePurchase(id: string) {
  return useQuery({
    queryKey: [...PURCHASES_KEY, id],
    queryFn: () => purchasesService.getById(id),
  });
}

export function useCreatePurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ purchase, lines }: { purchase: PurchaseInsert; lines: Array<Omit<PurchaseLineInsert, 'purchase_id'>> }) =>
      purchasesService.createPurchase(purchase, lines),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PURCHASES_KEY });
    },
  });
}

export function useReceivePurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (purchaseId: string) => purchasesService.receivePurchase(purchaseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PURCHASES_KEY });
    },
  });
}
