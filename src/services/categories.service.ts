import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type Category = Database['public']['Tables']['categories']['Row'];
type CategoryInsert = Database['public']['Tables']['categories']['Insert'];
type CategoryUpdate = Database['public']['Tables']['categories']['Update'];

export const categoriesService = {
  async listActive() {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('active', true)
      .order('name');

    if (error) throw error;
    return data;
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(category: CategoryInsert) {
    const { data, error } = await supabase
      .from('categories')
      .insert([category])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<CategoryUpdate>) {
    const { data, error } = await supabase
      .from('categories')
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

  async updateName(id: string, name: string) {
    return this.update(id, { name });
  },

  async updateColor(id: string, color: string) {
    return this.update(id, { color });
  },

  async updateImage(id: string, imageUrl: string) {
    return this.update(id, { image_url: imageUrl });
  },

  async uploadCategoryImage(categoryId: string, file: File) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${categoryId}/${Date.now()}.${fileExt}`;
    const filePath = `categories/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('category-images')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('category-images')
      .getPublicUrl(filePath);

    await this.updateImage(categoryId, data.publicUrl);

    return data.publicUrl;
  },

  async deactivate(id: string) {
    return this.update(id, { active: false });
  },
};
