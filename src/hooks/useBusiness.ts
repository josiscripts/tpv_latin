import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { businessService } from '@/services/business.service';

const BUSINESS_KEY = ['business'];

export function useBusiness() {
  return useQuery({
    queryKey: BUSINESS_KEY,
    queryFn: () => businessService.getDefault(),
  });
}

export function useUpdateBusinessName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      businessService.updateName(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUSINESS_KEY });
    },
  });
}

export function useUpdateBusinessTaxId() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, taxId }: { id: string; taxId: string }) =>
      businessService.updateTaxId(id, taxId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUSINESS_KEY });
    },
  });
}

export function useUpdateBusinessAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, address }: { id: string; address: string }) =>
      businessService.updateAddress(id, address),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUSINESS_KEY });
    },
  });
}

export function useUpdateBusinessPhone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, phone }: { id: string; phone: string }) =>
      businessService.updatePhone(id, phone),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUSINESS_KEY });
    },
  });
}

export function useUploadBusinessLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ businessId, file }: { businessId: string; file: File }) =>
      businessService.uploadLogo(businessId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUSINESS_KEY });
    },
  });
}

export function useCreateBusiness() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => businessService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BUSINESS_KEY });
    },
  });
}
