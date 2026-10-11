import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { suppliersService } from '@/services/suppliers.service';
import type { Database } from '@/lib/database.types';

type SupplierInsert = Database['public']['Tables']['suppliers']['Insert'];
type SupplierUpdate = Database['public']['Tables']['suppliers']['Update'];

const SUPPLIERS_KEY = ['suppliers'];

export function useSuppliers() {
  return useQuery({
    queryKey: SUPPLIERS_KEY,
    queryFn: () => suppliersService.listActive(),
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (supplier: SupplierInsert) => suppliersService.create(supplier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUPPLIERS_KEY });
    },
  });
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: [...SUPPLIERS_KEY, id],
    queryFn: () => suppliersService.getById(id),
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: SupplierUpdate }) =>
      suppliersService.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUPPLIERS_KEY });
    },
  });
}

export function useCheckDuplicatesByTaxId(taxId: string | null) {
  return useQuery({
    queryKey: [...SUPPLIERS_KEY, 'tax-id', taxId],
    queryFn: () => suppliersService.findByTaxId(taxId),
    enabled: !!taxId,
  });
}

export function useCheckDuplicatesByName(name: string) {
  return useQuery({
    queryKey: [...SUPPLIERS_KEY, 'similar', name],
    queryFn: () => suppliersService.findByNameSimilarity(name),
    enabled: name.length > 2,
  });
}

export function usePurchaseHistory(supplierId: string) {
  return useQuery({
    queryKey: [...SUPPLIERS_KEY, supplierId, 'purchases'],
    queryFn: () => suppliersService.getPurchaseHistory(supplierId),
  });
}

export function usePurchaseStats(supplierId: string) {
  return useQuery({
    queryKey: [...SUPPLIERS_KEY, supplierId, 'stats'],
    queryFn: () => suppliersService.getPurchaseStats(supplierId),
  });
}
