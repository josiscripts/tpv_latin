import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { documentsService } from '@/services/documents.service';

interface DocumentFilter {
  documentType?: 'invoice' | 'delivery_note';
  fromDate?: Date;
  toDate?: Date;
  saleId?: string;
  purchaseId?: string;
}

const DOCUMENTS_KEY = ['documents'];

export function useDocuments(filter?: DocumentFilter) {
  return useQuery({
    queryKey: [...DOCUMENTS_KEY, 'all', filter],
    queryFn: () => documentsService.listAll(filter),
  });
}

export function useDocumentsByType(documentType: 'invoice' | 'delivery_note') {
  return useQuery({
    queryKey: [...DOCUMENTS_KEY, 'type', documentType],
    queryFn: () => documentsService.listByType(documentType),
  });
}

export function useDocumentsByDateRange(
  fromDate?: Date,
  toDate?: Date,
  documentType?: 'invoice' | 'delivery_note'
) {
  return useQuery({
    queryKey: [...DOCUMENTS_KEY, 'dateRange', fromDate, toDate, documentType],
    queryFn: () => {
      if (!fromDate || !toDate) return Promise.resolve([]);
      return documentsService.listByDateRange(fromDate, toDate, documentType);
    },
    enabled: !!fromDate && !!toDate,
  });
}

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

export function useDocumentById(docId: string) {
  return useQuery({
    queryKey: [...DOCUMENTS_KEY, 'id', docId],
    queryFn: () => documentsService.getById(docId),
    enabled: !!docId,
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
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY });
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

export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ docId, updates }: { docId: string; updates: { original_name?: string; document_type?: string } }) =>
      documentsService.updateDocument(docId, updates),
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

export function useProcessDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ docId, aiModelId }: { docId: string; aiModelId: string }) =>
      documentsService.processDocument(docId, aiModelId),
    onSuccess: (_, { docId }) => {
      // Invalidate the specific document and overall documents list
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_KEY });
      queryClient.invalidateQueries({ queryKey: [...DOCUMENTS_KEY, 'id', docId] });
    },
  });
}

export function useExtractionById(extractionId: string | null) {
  return useQuery({
    queryKey: ['extraction', extractionId],
    queryFn: () => {
      if (!extractionId) throw new Error('Extraction ID required');
      return documentsService.getExtractionById(extractionId);
    },
    enabled: !!extractionId,
  });
}

export function useDocumentLatestExtraction(documentId: string | null) {
  return useQuery({
    queryKey: [...DOCUMENTS_KEY, 'extraction', documentId],
    queryFn: () => {
      if (!documentId) throw new Error('Document ID required');
      return documentsService.getDocumentExtraction(documentId);
    },
    enabled: !!documentId,
  });
}
