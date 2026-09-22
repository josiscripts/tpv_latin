import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type Document = Database['public']['Tables']['documents']['Row'];
type DocumentInsert = Database['public']['Tables']['documents']['Insert'];

export const documentsService = {
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

  async uploadDocument(
    file: File,
    saleId?: string,
    purchaseId?: string,
    documentType: string = 'invoice'
  ) {
    // Subir archivo a Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
    const filePath = `documents/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

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
          uploaded_by: 'anon',
        } as any,
      ])
      .select()
      .single();

    if (dbError) {
      // Intentar limpiar el archivo si falla la BD
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

  async deleteDocument(docId: string) {
    // Soft delete
    const { data: doc, error: fetchError } = await supabase
      .from('documents')
      .select('file_path')
      .eq('id', docId)
      .single();

    if (fetchError) throw fetchError;

    // Eliminar del storage
    if (doc?.file_path) {
      await supabase.storage.from('documents').remove([doc.file_path]);
    }

    // Marcar como eliminado
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
};
