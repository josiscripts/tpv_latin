import { suppliersService } from './suppliers.service';
import { supabase } from '@/lib/supabase';

export const documentSupplierIntegrationService = {
  /**
   * Link a document extraction to a supplier
   * Implements Req #3-5: Identify duplicates by tax ID, resolve conflicts safely
   */
  async linkDocumentToSupplier(
    extractionId: string,
    vendorName: string | null,
    vendorTaxId: string | null,
  ): Promise<{ supplierId: string; isNew: boolean; conflict?: string }> {
    // Priority 1: Match by tax_id if available
    if (vendorTaxId) {
      const existingSupplier = await suppliersService.findByTaxId(vendorTaxId);
      if (existingSupplier) {
        return {
          supplierId: existingSupplier.id,
          isNew: false,
        };
      }
    }

    // Priority 2: Check for name similarity (only suggest, don't auto-merge)
    if (vendorName) {
      const similar = await suppliersService.findByNameSimilarity(vendorName);
      if (similar.length > 0) {
        // Return first match but mark as potential conflict
        return {
          supplierId: similar[0].id,
          isNew: false,
          conflict: `Nombre similar encontrado: "${similar[0].name}". Verifica manualmente.`,
        };
      }
    }

    // Priority 3: Create new supplier if data is sufficient
    if (vendorName) {
      const newSupplier = await suppliersService.create({
        name: vendorName.trim(),
        tax_id: vendorTaxId ? vendorTaxId.trim() : null,
        active: true,
      });
      return {
        supplierId: newSupplier.id,
        isNew: true,
      };
    }

    // Cannot link or create without vendor name
    throw new Error('Insufficient data to link document to supplier: vendor name required');
  },

  /**
   * Get supplier info from document extraction
   * Implements Req #7: Link documents to suppliers and purchases
   */
  async getSupplierFromExtraction(extractionId: string) {
    const { data, error } = await supabase
      .from('document_extractions')
      .select('vendor_name, vendor_tax_id, vendor_address, invoice_number, invoice_date, total')
      .eq('id', extractionId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Find purchases that match document data
   * Implements Req #7: Link documents to purchases
   * Idempotency: Matches by supplier + invoice_number + purchase_date to avoid cross-document integration
   */
  async findMatchingPurchases(
    supplierId: string,
    invoiceNumber: string | null,
    invoiceDate: string | null,
  ) {
    const query = supabase
      .from('purchases')
      .select('id, purchase_date, invoice_number, total, status')
      .eq('supplier_id', supplierId);

    if (invoiceNumber) {
      query.eq('invoice_number', invoiceNumber);
    }

    // Idempotency: Also match by invoice date to avoid associating different documents to same purchase
    if (invoiceDate) {
      query.eq('purchase_date', invoiceDate);
    }

    const { data, error } = await query.order('purchase_date', { ascending: false });
    if (error) throw error;

    return data || [];
  },

  /**
   * Get products from extraction data
   * Implements Req #8: Link suppliers and products
   */
  async getExtractedProducts(extractionId: string) {
    const { data: extraction, error: extractionError } = await supabase
      .from('document_extractions')
      .select('lines_extracted')
      .eq('id', extractionId)
      .single();

    if (extractionError) throw extractionError;

    const lines = extraction?.lines_extracted as any[] || [];
    return lines.map(line => ({
      description: line.description || line.item || '',
      quantity: line.quantity || 1,
      unitPrice: line.unit_price || line.price || 0,
      total: line.total || (line.quantity || 1) * (line.unit_price || line.price || 0),
    }));
  },

  /**
   * Create a purchase from document extraction
   * Idempotent: Returns existing purchase if already created
   * Implements Req #6: Prevent duplicates in future imports
   * Implements Req #9: Integrate documents with purchases
   * Recoverable: Can continue from partially integrated purchases
   */
};
