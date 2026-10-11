import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

export const profileService = {
  async getById(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  async update(userId: string, updates: Partial<ProfileUpdate>) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateFullName(userId: string, fullName: string) {
    return this.update(userId, { full_name: fullName });
  },

  async updateAvatarUrl(userId: string, avatarUrl: string) {
    return this.update(userId, { avatar_url: avatarUrl });
  },

  async uploadAvatar(userId: string, file: File) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    await this.updateAvatarUrl(userId, data.publicUrl);

    return data.publicUrl;
  },

  async changePassword(oldPassword: string, newPassword: string) {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) throw error;
  },

  async updateEmail(newEmail: string) {
    const { error } = await supabase.auth.updateUser({
      email: newEmail,
    });

    if (error) throw error;
  },
};
