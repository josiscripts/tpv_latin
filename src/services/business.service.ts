import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type Business = Database['public']['Tables']['business']['Row'];
type BusinessInsert = Database['public']['Tables']['business']['Insert'];
type BusinessUpdate = Database['public']['Tables']['business']['Update'];

export const businessService = {
  async getDefault() {
    const { data, error } = await supabase
      .from('business')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<BusinessUpdate>) {
    const { data, error } = await supabase
      .from('business')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async create(business: BusinessInsert) {
    const { data, error } = await supabase
      .from('business')
      .insert([business])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateName(id: string, name: string) {
    return this.update(id, { name });
  },

  async updateTaxId(id: string, taxId: string) {
    return this.update(id, { tax_id: taxId });
  },

  async updateAddress(id: string, address: string) {
    return this.update(id, { address });
  },

  async updatePhone(id: string, phone: string) {
    return this.update(id, { phone });
  },

  async uploadLogo(businessId: string, file: File) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${businessId}/logo.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(fileName, file, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('logos')
      .getPublicUrl(fileName);

    await this.update(businessId, { logo_url: data.publicUrl });

    return data.publicUrl;
  },
};
