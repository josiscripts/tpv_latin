import { supabase } from '@/lib/supabase';
import { documentSupplierIntegrationService } from './document-supplier-integration.service';
import { documentsService } from './documents.service';

/**
 * Recovery service for documents that were processed but extraction integration was not completed
 * Uses existing extractions without re-running IA
 */
export const documentsRecoveryService = {
  /**
   * Recover integration for a processed document that has an extraction but no purchase
   * Does NOT re-run IA, uses existing extraction data only
   */
  async recoverIntegrationForDocument(documentId: string): Promise<{
    status: 'success' | 'partial' | 'error';
    supplierId?: string;
    purchaseId?: string;
    extractionId?: string;
    warnings?: string[];
    errors?: string[];
  }> {
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Step 1: Verify document is in processed state
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (docError || !document) {
        return {
          status: 'error',
          errors: ['Document not found'],
        };
      }

      if (document.processing_status !== 'processed') {
        return {
          status: 'error',
          errors: [`Document is not in processed state (current: ${document.processing_status})`],
        };
      }

      // Step 2: Get existing extraction
      const extraction = await documentsService.getDocumentExtraction(documentId);

      if (!extraction) {
        return {
          status: 'error',
          errors: ['No extraction found for document'],
        };
      }

      // Step 3: Link to supplier (safe: respects existing data)
      let supplierId: string;
      try {
        const supplierResult = await documentSupplierIntegrationService.linkDocumentToSupplier(
          extraction.id,
          extraction.vendor_name,
          extraction.vendor_tax_id,
        );

        supplierId = supplierResult.supplierId;

        if (supplierResult.conflict) {
          warnings.push(supplierResult.conflict);
        }
      } catch (err) {
        errors.push(`Failed to link supplier: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return {
          status: 'error',
          extractionId: extraction.id,
          errors,
        };
      }

      // Step 4: Create purchase from extraction (idempotent)
      let purchaseId: string | undefined;
      try {
        purchaseId = await documentSupplierIntegrationService.createPurchaseFromExtraction(
          supplierId,
          extraction.id,
        );
      } catch (err) {
        // Return error for purchase creation (unlike the workflow service which converts to warning)
        errors.push(
          `Purchase creation failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
        return {
          status: 'error',
          supplierId,
          extractionId: extraction.id,
          errors,
        };
      }

      return {
        status: warnings.length > 0 ? 'partial' : 'success',
        supplierId,
        purchaseId,
        extractionId: extraction.id,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (err) {
      return {
        status: 'error',
        errors: [err instanceof Error ? err.message : 'Unknown error'],
      };
    }
  },

  /**
   * Find all documents that are processed but have no purchase (integration incomplete)
   * Returns their extraction data for manual recovery
   */
  async findDocumentsNeedingRecovery(): Promise<
    Array<{
      documentId: string;
      documentName: string;
      extractionId: string;
      vendorName: string;
      invoiceNumber: string;
      invoiceDate: string;
      hasSupplier: boolean;
      totalLines: number;
    }>
  > {
    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('processing_status', 'processed');

    if (!documents || documents.length === 0) {
      return [];
    }

    const { data: extractions } = await supabase
      .from('document_extractions')
      .select('*');

    const { data: purchases } = await supabase.from('purchases').select('*');
    const { data: suppliers } = await supabase.from('suppliers').select('*');

    const needsRecovery: Array<any> = [];

    for (const doc of documents) {
      const extraction = extractions?.find(e => e.document_id === doc.id);

      if (!extraction) continue; // Skip docs without extraction

      // Check if purchase exists for this extraction
      const hasPurchase = purchases?.some(
        p => p.invoice_number === extraction.invoice_number && p.supplier_id
      );

      if (!hasPurchase) {
        // Check if supplier already exists
        const hasSupplier = suppliers?.some(
          s =>
            (extraction.vendor_tax_id && s.tax_id === extraction.vendor_tax_id) ||
            s.name === extraction.vendor_name
        );

        needsRecovery.push({
          documentId: doc.id,
          documentName: doc.original_name,
          extractionId: extraction.id,
          vendorName: extraction.vendor_name,
          invoiceNumber: extraction.invoice_number,
          invoiceDate: extraction.invoice_date,
          hasSupplier: !!hasSupplier,
          totalLines: extraction.lines_extracted?.length || 0,
        });
      }
    }

    return needsRecovery;
  },
};
