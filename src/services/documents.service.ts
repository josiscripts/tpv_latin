import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type Document = Database['public']['Tables']['documents']['Row'];
type DocumentInsert = Database['public']['Tables']['documents']['Insert'];

interface DocumentFilter {
  documentType?: 'invoice' | 'delivery_note';
  fromDate?: Date;
  toDate?: Date;
  saleId?: string;
  purchaseId?: string;
}

export const documentsService = {
  async listAll(filter?: DocumentFilter) {
    let query = supabase
      .from('documents')
      .select('*')
      .is('deleted_at', null);

    if (filter?.documentType) {
      query = query.eq('document_type', filter.documentType);
    }

    if (filter?.saleId) {
      query = query.eq('sale_id', filter.saleId);
    }

    if (filter?.purchaseId) {
      query = query.eq('purchase_id', filter.purchaseId);
    }

    if (filter?.fromDate) {
      query = query.gte('created_at', filter.fromDate.toISOString());
    }

    if (filter?.toDate) {
      const endOfDay = new Date(filter.toDate);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte('created_at', endOfDay.toISOString());
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async listByType(documentType: 'invoice' | 'delivery_note') {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('document_type', documentType)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async listByDateRange(fromDate: Date, toDate: Date, documentType?: 'invoice' | 'delivery_note') {
    const endOfDay = new Date(toDate);
    endOfDay.setHours(23, 59, 59, 999);

    let query = supabase
      .from('documents')
      .select('*')
      .is('deleted_at', null)
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', endOfDay.toISOString());

    if (documentType) {
      query = query.eq('document_type', documentType);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async listBySaleId(saleId: string) {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('sale_id', saleId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async listByPurchaseId(purchaseId: string) {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('purchase_id', purchaseId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async getById(docId: string) {
    const { data, error } = await supabase
      .from('documents')
      .select(`
        *,
        sales(id, total, sale_date),
        purchases(id, invoice_number, purchase_date)
      `)
      .eq('id', docId)
      .single();

    if (error) throw error;
    return data;
  },

  async uploadDocument(
    file: File,
    saleId?: string,
    purchaseId?: string,
    documentType: string = 'invoice'
  ) {
    // Determinar carpeta según tipo
    const folder = documentType === 'invoice' ? 'invoices' : 'delivery-notes';
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
    const filePath = `${folder}/${year}/${month}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // Get authenticated user ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User must be authenticated to upload documents');

    // Crear registro en tabla
    const { data, error: dbError } = await supabase
      .from('documents')
      .insert([
        {
          sale_id: saleId || null,
          purchase_id: purchaseId || null,
          document_type: documentType,
          original_name: file.name,
          file_path: filePath,
          file_size: file.size,
          uploaded_by: null,
        } as any,
      ])
      .select()
      .single();

    if (dbError) {
      await supabase.storage.from('documents').remove([filePath]);
      throw dbError;
    }

    return data;
  },

  async renameDocument(docId: string, newName: string) {
    const { data, error } = await supabase
      .from('documents')
      .update({ original_name: newName, updated_at: new Date().toISOString() })
      .eq('id', docId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateDocument(docId: string, updates: { original_name?: string; document_type?: string }) {
    const { data, error } = await supabase
      .from('documents')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', docId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteDocument(docId: string) {
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('file_path')
      .eq('id', docId)
      .single();

    if (fetchError) throw fetchError;

    if (doc?.file_path) {
      await supabase.storage.from('documents').remove([doc.file_path]);
    }

    const { error } = await supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', docId);

    if (error) throw error;
  },

  async getDownloadUrl(filePath: string) {
    const { data } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    return data.publicUrl;
  },

  async getSignedUrl(filePath: string, expiresIn: number = 3600) {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, expiresIn);

    if (error) throw error;
    return data.signedUrl;
  },

  async downloadFile(filePath: string): Promise<Blob> {
    const { data, error } = await supabase.storage
      .from('documents')
      .download(filePath);

    if (error) throw error;
    return data;
  },

  async processDocument(documentId: string, aiModelId: string = 'claude-haiku-4-5-20251001') {
    // Call Edge Function to process document with IA
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/process-document`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ documentId, aiModelId }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to process document');
    }

    const result = await response.json();

    // Handle idempotent response (document already processed)
    if (result.status === 'already_processed') {
      // Get the latest extraction ID for navigation
      const existingExtraction = await this.getDocumentExtraction(documentId);
      return {
        ...result,
        isIdempotent: true,
        extraction_id: existingExtraction?.id,
      };
    }

    return result;
  },

  async getDocumentExtraction(documentId: string) {
    // Get latest extraction for a document
    const { data, error } = await supabase
      .from('document_extractions')
      .select('*')
      .eq('document_id', documentId)
      .order('attempt_number', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data || null;
  },

  async getExtractionById(extractionId: string) {
    // Get specific extraction by ID with linked document info
    const { data: extraction, error: extError } = await supabase
      .from('document_extractions')
      .select(`
        *,
        documents(id, original_name, document_type, processing_status, file_path, created_at, updated_at)
      `)
      .eq('id', extractionId)
      .single();

    if (extError) throw extError;
    return extraction;
  },
};
