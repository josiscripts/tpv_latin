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
  async createPurchaseFromExtraction(
    supplierId: string,
    extractionId: string,
  ): Promise<string> {
    const { data: extraction, error: extractionError } = await supabase
      .from('document_extractions')
      .select('*')
      .eq('id', extractionId)
      .single();

    if (extractionError) throw extractionError;

    // Check if a purchase already exists for this invoice (idempotency key: supplier + invoice_number + invoice_date)
    let existingPurchaseId: string | null = null;
    if (extraction.invoice_number && extraction.invoice_date) {
      const existing = await this.findMatchingPurchases(
        supplierId,
        extraction.invoice_number,
        extraction.invoice_date,
      );

      if (existing.length > 0) {
        existingPurchaseId = existing[0].id;
      }
    }

    // If purchase exists, attempt to recover missing lines
    if (existingPurchaseId) {
      // Normalize extracted lines: calculate consistent values
      const expectedLines = Array.isArray(extraction.lines_extracted)
        ? extraction.lines_extracted.map((line: any) => ({
            quantity: (line.quantity !== null && line.quantity !== undefined) ? Number(line.quantity) : 1,
            unit_cost: (line.unit_price !== null && line.unit_price !== undefined)
              ? Number(line.unit_price)
              : (line.price !== null && line.price !== undefined)
              ? Number(line.price)
              : 0,
            tax_rate: extraction.tax_rate ?? 0,
            description: (line.description || '').trim(),
            sku: (line.sku || '').trim(),
          }))
        : [];

      // Calculate total for each line to use as signature
      const expectedWithTotals = expectedLines.map(line => ({
        ...line,
        total: line.quantity * line.unit_cost,
      }));

      // Get existing lines from purchase: use normalized values for comparison
      const { data: existingLines, error: lineError } = await supabase
        .from('purchase_lines')
        .select('id, quantity, unit_cost, total')
        .eq('purchase_id', existingPurchaseId);

      if (!lineError && existingLines) {
        // Create line signatures with description to distinguish products
        // Signature: quantity|unit_cost|total|description (includes product info to avoid ambiguity)
        const expectedSignatures = expectedWithTotals.map(line =>
          `${line.quantity}|${line.unit_cost}|${line.total}|${line.description || ''}`
        );
        const existingSignatures = existingLines.map(line =>
          `${line.quantity}|${line.unit_cost}|${line.total}|`  // No description in BD (will never match)
        );

        // Count expected and existing lines by signature (respects multiplicity)
        const expectedCounts = new Map<string, number>();
        expectedSignatures.forEach(sig => {
          expectedCounts.set(sig, (expectedCounts.get(sig) ?? 0) + 1);
        });

        const existingCounts = new Map<string, number>();
        existingSignatures.forEach(sig => {
          existingCounts.set(sig, (existingCounts.get(sig) ?? 0) + 1);
        });

        // Check if counts match exactly (no extra, no missing)
        const totalExpected = expectedSignatures.length;
        const totalExisting = existingSignatures.length;

        if (totalExisting > totalExpected) {
          // More lines exist than expected - inconsistency
          throw new Error(
            `Purchase ${existingPurchaseId} has ${totalExisting} line(s) ` +
            `but extraction expects ${totalExpected}. ` +
            `Inconsistency detected: possible manual edit or duplicate. Please review.`
          );
        }

        // Check if all expected lines exist with correct multiplicity
        let allComplete = true;
        for (const [sig, expectedCount] of expectedCounts) {
          const existingCount = existingCounts.get(sig) ?? 0;
          if (existingCount !== expectedCount) {
            allComplete = false;
            break;
          }
        }

        if (allComplete) {
          // All expected lines exist with correct multiplicity - integration already complete
          return existingPurchaseId;
        }

        // Identify which extracted lines are missing (need insertion), respecting multiplicity
        const linesToInsert: any[] = [];
        for (const [sig, expectedCount] of expectedCounts) {
          const existingCount = existingCounts.get(sig) ?? 0;
          const missingCount = expectedCount - existingCount;

          if (missingCount > 0) {
            // Find the line template with this signature and add missing copies
            const lineTemplate = expectedWithTotals.find(line => `${line.quantity}|${line.unit_cost}|${line.total}` === sig);
            if (lineTemplate) {
              for (let i = 0; i < missingCount; i++) {
                linesToInsert.push({
                  purchase_id: existingPurchaseId!,
                  product_id: null as any, // Will be matched manually by user. Now that schema allows NULL.
                  quantity: lineTemplate.quantity,
                  unit_cost: lineTemplate.unit_cost,
                  tax_rate: lineTemplate.tax_rate,
                  total: lineTemplate.total,
                });
              }
            }
          }
        }

        // Insert missing lines
        if (linesToInsert.length > 0) {
          const { error: insertError, data: insertedLines } = await supabase
            .from('purchase_lines')
            .insert(linesToInsert)
            .select();

          if (insertError) {
            console.error(`Failed to insert missing purchase lines for purchase ${existingPurchaseId}:`, insertError);
            throw new Error(`Could not save missing purchase lines: ${insertError.message}`);
          }

          if (!insertedLines || insertedLines.length !== linesToInsert.length) {
            throw new Error(`Only ${insertedLines?.length || 0} of ${linesToInsert.length} missing lines were saved`);
          }
        }

        return existingPurchaseId;
      }
    }

    // Only create new purchase if one doesn't exist
    let purchaseId = existingPurchaseId;
    if (!purchaseId) {
      const { data: purchase, error: purchaseError } = await supabase
        .from('purchases')
        .insert([{
          supplier_id: supplierId,
          purchase_date: extraction.invoice_date || new Date().toISOString().split('T')[0],
          invoice_number: extraction.invoice_number,
          type: extraction.document_type_detected === 'delivery_note' ? 'albarán' : 'factura',
          subtotal: extraction.subtotal ?? null,
          tax: extraction.tax_total ?? null,
          total: extraction.total ?? null,
          status: 'draft',
        }])
        .select()
        .single();

      if (purchaseError) throw purchaseError;
      purchaseId = purchase.id;
    }

    // Create purchase lines from extracted lines (for new purchases)
    if (extraction.lines_extracted && Array.isArray(extraction.lines_extracted)) {
      const linesToInsert = extraction.lines_extracted.map((line: any) => {
        // Use extracted values directly: no defaults that would hide missing data
        const quantity = (line.quantity !== null && line.quantity !== undefined) ? Number(line.quantity) : 1;
        const unitCost = (line.unit_price !== null && line.unit_price !== undefined)
          ? Number(line.unit_price)
          : (line.price !== null && line.price !== undefined)
          ? Number(line.price)
          : 0;

        const total = (line.total !== null && line.total !== undefined)
          ? Number(line.total)
          : quantity * unitCost;

        return {
          purchase_id: purchaseId,
          product_id: null, // Will be matched manually by user. Now that schema allows NULL.
          quantity,
          unit_cost: unitCost,
          tax_rate: extraction.tax_rate ?? 0,
          total,
        };
      });

      // Insert lines with error handling
      const { error: linesError, data: insertedLines } = await supabase
        .from('purchase_lines')
        .insert(linesToInsert)
        .select();

      if (linesError) {
        // Log error - if purchase was just created, it will be empty. Allow user to retry.
        console.error(`Failed to insert purchase lines for purchase ${purchaseId}:`, linesError);
        throw new Error(`Could not save purchase lines: ${linesError.message}`);
      }

      if (!insertedLines || insertedLines.length === 0) {
        throw new Error(`No purchase lines were saved (expected ${linesToInsert.length})`);
      }
    }

    return purchaseId;
  },
};
