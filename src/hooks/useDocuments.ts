import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { documentsService } from '@/services/documents.service';

const DOCUMENTS_KEY = ['documents'];

export function useDocumentsBySale(saleId: string) {
  return useQuery({
    queryKey: [...DOCUMENTS_KEY, 'sale', saleId],
    queryFn: () => documentsService.listBySaleId(saleId),
    enabled: !!saleId,
  });
}

export function useDocumentsByPurchase(purchaseId: string) {
  return useQuery({
    queryKey: [...DOCUMENTS_KEY, 'purchase', purchaseId],
    queryFn: () => documentsService.listByPurchaseId(purchaseId),
    enabled: !!purchaseId,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      file,
      saleId,
      purchaseId,
      documentType,
    }: {
      file: File;
      saleId?: string;
      purchaseId?: string;
      documentType?: string;
    }) => documentsService.uploadDocument(file, saleId, purchaseId, documentType),
    onSuccess: (_, { saleId, purchaseId }) => {
      if (saleId) {
        queryClient.invalidateQueries({
          queryKey: [...DOCUMENTS_KEY, 'sale', saleId],
        });
      }
      if (purchaseId) {
        queryClient.invalidateQueries({
          queryKey: [...DOCUMENTS_KEY, 'purchase', purchaseId],
        });
      }
    },
  });
}

export function useRenameDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ docId, newName }: { docId: string; newName: string }) =>
      documentsService.renameDocument(docId, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (docId: string) => documentsService.deleteDocument(docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY });
    },
  });
}
