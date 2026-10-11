import { documentsService } from './documents.service';
import { documentSupplierIntegrationService } from './document-supplier-integration.service';
import { suppliersService } from './suppliers.service';
import { supabase } from '@/lib/supabase';

/**
 * Complete workflow: Process document → Identify supplier → Create purchase
 * Implements PARTE 3: Full integration without schema changes
 */
export const documentsWorkflowService = {
  /**
   * After document is processed, perform complete integration workflow
   * Safe: No automatic overrides, proposes duplicates for review
   */
  async completeIntegrationAfterProcessing(
    documentId: string,
  ): Promise<{
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
      // Step 1: Get extraction for processed document
      const extraction = await documentsService.getDocumentExtraction(documentId);

      if (!extraction) {
        return {
          status: 'error',
          errors: ['No extraction found for document'],
        };
      }

      // Step 2: Link to supplier (safe: respects existing data)
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

        // Update document with linked supplier_id for future reference
        await supabase
          .from('documents')
          .update({ purchase_id: null }) // Reserved for explicit linking
          .eq('id', documentId);
      } catch (err) {
        errors.push(`Failed to link supplier: ${err instanceof Error ? err.message : 'Unknown error'}`);
        return {
          status: 'error',
          extractionId: extraction.id,
          errors,
        };
      }

      // Step 3: Determine document type
      const docType = extraction.document_type_detected || 'invoice';
      if (docType === 'unknown') {
        warnings.push('Document type could not be determined. Review manually.');
      }

      // Step 4: Create purchase from extraction (idempotent)
      let purchaseId: string | undefined;
      try {
        purchaseId = await documentSupplierIntegrationService.createPurchaseFromExtraction(
          supplierId,
          extraction.id,
        );
      } catch (err) {
        // Fail the integration on purchase creation error
        // This ensures errors are visible to the user instead of being silenced as warnings
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Purchase creation failed: ${errorMsg}`);
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
   * Safe test: Verify integration flow without creating data
   * Used for testing and validation only
   */
  async testIntegrationFlow(
    extractionId: string,
  ): Promise<{
    canLinkSupplier: boolean;
    canCreatePurchase: boolean;
    issues?: string[];
  }> {
    const issues: string[] = [];

    try {
      // Test 1: Get extraction
      const { data: extraction, error: extractionError } = await supabase
        .from('document_extractions')
        .select('*')
        .eq('id', extractionId)
        .single();

      if (extractionError || !extraction) {
        issues.push('Extraction not found');
        return { canLinkSupplier: false, canCreatePurchase: false, issues };
      }

      let canLinkSupplier = false;
      let canCreatePurchase = false;

      // Test 2: Check if supplier can be linked
      if (extraction.vendor_tax_id) {
        const existing = await suppliersService.findByTaxId(extraction.vendor_tax_id);
        canLinkSupplier = !!existing || !!extraction.vendor_name;
      } else if (extraction.vendor_name) {
        canLinkSupplier = true;
      } else {
        issues.push('No vendor info (name or tax_id) available');
      }

      // Test 3: Check if purchase can be created
      if (extraction.supplier_id || extraction.vendor_tax_id || extraction.vendor_name) {
        // Supplier can be determined
        if (extraction.invoice_number && extraction.invoice_date) {
          canCreatePurchase = true; // Has unique identifiers
        } else {
          issues.push('Invoice number or date missing - purchase creation may fail');
          canCreatePurchase = !!extraction.vendor_name; // Can still create if vendor known
        }
      }

      return {
        canLinkSupplier,
        canCreatePurchase,
        issues: issues.length > 0 ? issues : undefined,
      };
    } catch (err) {
      return {
        canLinkSupplier: false,
        canCreatePurchase: false,
        issues: [err instanceof Error ? err.message : 'Unknown error'],
      };
    }
  },

  /**
   * Get integration status for a document
   * Shows what's been done and what's pending
   */
  async getIntegrationStatus(documentId: string): Promise<{
    documentProcessed: boolean;
    extractionExists: boolean;
    supplierLinked: boolean;
    purchaseCreated: boolean;
    warnings?: string[];
  }> {
    const warnings: string[] = [];

    // Check document status
    const { data: document } = await supabase
      .from('documents')
      .select('processing_status, purchase_id')
      .eq('id', documentId)
      .single();

    const documentProcessed = document?.processing_status === 'processed';

    // Check extraction
    const extraction = await documentsService.getDocumentExtraction(documentId);
    const extractionExists = !!extraction;

    // Check purchase link
    const purchaseCreated = !!document?.purchase_id;
    const supplierLinked = extractionExists && !purchaseCreated; // Has data but no purchase yet

    return {
      documentProcessed,
      extractionExists,
      supplierLinked,
      purchaseCreated,
      warnings,
    };
  },
};
