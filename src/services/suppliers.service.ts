import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type Supplier = Database['public']['Tables']['suppliers']['Row'];
type SupplierInsert = Database['public']['Tables']['suppliers']['Insert'];
type SupplierUpdate = Database['public']['Tables']['suppliers']['Update'];

// Normalize tax ID for comparison (remove spaces, convert to lowercase)
const normalizeTaxId = (taxId: string | null | undefined): string => {
  if (!taxId) return '';
  return taxId.toLowerCase().replace(/\s/g, '');
};

// Normalize name for comparison
const normalizeName = (name: string): string => {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
};

// Helper: Generate signed URL for supplier logo if path exists
async function generateLogoUrl(supplier: Supplier): Promise<Supplier & { logo_url_signed?: string }> {
  if (!supplier.logo_url) return supplier;

  try {
    // logo_url stores the path, generate signed URL for 1 hour
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('supplier-logos')
      .createSignedUrl(supplier.logo_url, 3600);

    if (!urlError && signedUrlData?.signedUrl) {
      return { ...supplier, logo_url_signed: signedUrlData.signedUrl };
    }
  } catch (e) {
    console.error(`Failed to generate logo URL for supplier ${supplier.id}:`, e);
  }

  return supplier;
}

export const suppliersService = {
  async listActive() {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) throw error;

    // Generate signed URLs for all suppliers with logos
    return Promise.all((data || []).map(s => generateLogoUrl(s)));
  },

  async listAll() {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name');

    if (error) throw error;
    return data;
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('suppliers')
      .select(`
        *,
        purchases(
          id,
          purchase_date,
          invoice_number,
          type,
          subtotal,
          tax,
          total,
          status
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // Generate signed URL for logo if it exists
    return data ? generateLogoUrl(data) : data;
  },

  async findByTaxId(taxId: string | null): Promise<Supplier | null> {
    if (!taxId) return null;

    const normalized = normalizeTaxId(taxId);
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('active', true);

    if (error) throw error;

    // Find exact match by normalized tax_id
    return data?.find(s => normalizeTaxId(s.tax_id) === normalized) || null;
  },

  async findByNameSimilarity(name: string): Promise<Supplier[]> {
    const normalized = normalizeName(name);
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('active', true);

    if (error) throw error;

    // Return suppliers with similar names for manual review
    return (data || []).filter(s => {
      const sNormalized = normalizeName(s.name);
      // Simple similarity: check if names contain common words
      const nameWords = normalized.split(/\s+/);
      const sWords = sNormalized.split(/\s+/);
      const commonWords = nameWords.filter(w => sWords.includes(w));
      return commonWords.length > 0 && s.name !== name;
    });
  },

  async getPurchaseHistory(supplierId: string) {
    const { data, error } = await supabase
      .from('purchases')
      .select(`
        id,
        purchase_date,
        invoice_number,
        type,
        subtotal,
        tax,
        total,
        status,
        purchase_lines(
          quantity,
          products(name, sku)
        )
      `)
      .eq('supplier_id', supplierId)
      .order('purchase_date', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getPurchaseStats(supplierId: string) {
    const { data, error } = await supabase
      .from('purchases')
      .select(`
        id,
        purchase_date,
        invoice_number,
        total,
        status,
        purchase_lines(quantity)
      `)
      .eq('supplier_id', supplierId)
      .order('purchase_date', { ascending: false });

    if (error) throw error;

    const purchases = data || [];
    const receivedPurchases = purchases.filter(p => p.status === 'received');

    // Calculate total units in received purchases
    let totalReceivedUnits = 0;
    for (const purchase of receivedPurchases) {
      const lines = (purchase as any).purchase_lines as any[];
      if (lines && lines.length > 0) {
        totalReceivedUnits += lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
      } else {
        // Fallback: try to get units from document_extractions
        const { data: extraction } = await supabase
          .from('document_extractions')
          .select('lines_extracted')
          .eq('invoice_number', purchase.invoice_number)
          .single();

        if (extraction?.lines_extracted) {
          const extractedLines = Array.isArray(extraction.lines_extracted) ? extraction.lines_extracted : [];
          totalReceivedUnits += extractedLines.reduce((sum, line: any) => sum + (Number(line.quantity) || 0), 0);
        }
      }
    }

    return {
      totalPurchases: purchases.length,
      receivedUnits: totalReceivedUnits,
      totalSpent: receivedPurchases.reduce((sum, p) => sum + (p.total ? Number(p.total) : 0), 0),
      lastPurchase: purchases.length > 0 ? purchases[0] : null,
    };
  },

  // Eliminar proveedor: solo administradores; la base de datos bloquea si tiene compras, productos o gastos.
  async deleteSupplier(supplierId: string) {
    const client = supabase as unknown as {
      rpc: (fn: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data, error } = await client.rpc('delete_supplier', { p_supplier_id: supplierId });
    if (error) throw new Error(error.message);
    return data as { deleted: boolean };
  },

  async create(supplier: SupplierInsert) {
    const { data, error } = await supabase
      .from('suppliers')
      .insert([supplier])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, updates: SupplierUpdate) {
    const { data, error } = await supabase
      .from('suppliers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deactivate(id: string) {
    return this.update(id, { active: false });
  },

  async getDocumentForPurchase(invoiceNumber: string) {
    const { data: extraction, error: extractError } = await supabase
      .from('document_extractions')
      .select('document_id')
      .eq('invoice_number', invoiceNumber)
      .single();

    if (extractError || !extraction) return null;

    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, original_name, file_path')
      .eq('id', extraction.document_id)
      .single();

    if (docError || !document || !document.file_path) return null;

    return document;
  },

  async getDocumentForPurchaseId(purchaseId: string) {
    // Try direct link first (documents.purchase_id = purchaseId)
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, original_name, file_path')
      .eq('purchase_id', purchaseId)
      .single();

    if (!docError && document && document.file_path) {
      return document;
    }

    // Fallback: get invoice_number from purchase, then find document via extraction
    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('invoice_number')
      .eq('id', purchaseId)
      .single();

    if (purchaseError || !purchase || !purchase.invoice_number) return null;

    // Find document via extraction (for historical documents)
    const { data: extraction, error: extractError } = await supabase
      .from('document_extractions')
      .select('document_id')
      .eq('invoice_number', purchase.invoice_number)
      .single();

    if (extractError || !extraction) return null;

    const { data: fallbackDoc, error: fallbackError } = await supabase
      .from('documents')
      .select('id, original_name, file_path')
      .eq('id', extraction.document_id)
      .single();

    if (fallbackError || !fallbackDoc || !fallbackDoc.file_path) return null;

    return fallbackDoc;
  },

  async getDocumentSignedUrl(filePath: string) {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, 3600);

    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  },

  async getExtractedLines(invoiceNumber: string) {
    const { data, error } = await supabase
      .from('document_extractions')
      .select('lines_extracted')
      .eq('invoice_number', invoiceNumber)
      .single();

    if (error || !data?.lines_extracted) return null;

    const lines = Array.isArray(data.lines_extracted) ? data.lines_extracted : [];
    return lines.length > 0 ? lines : null;
  },
};
