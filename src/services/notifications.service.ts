import { supabase } from '@/lib/supabase';

export const notificationsService = {
  async getPreferences(userId: string) {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data as { user_id: string; sales_enabled: boolean; products_enabled: boolean; sound_enabled: boolean; updated_at: string } | null;
  },

  async upsertPreferences(userId: string, preferences: { sales_enabled?: boolean; products_enabled?: boolean; sound_enabled?: boolean }) {
    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: userId,
        ...preferences,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async toggleSalesNotifications(userId: string, enabled: boolean) {
    return this.upsertPreferences(userId, { sales_enabled: enabled });
  },

  async toggleProductNotifications(userId: string, enabled: boolean) {
    return this.upsertPreferences(userId, { products_enabled: enabled });
  },

  async toggleSoundNotifications(userId: string, enabled: boolean) {
    return this.upsertPreferences(userId, { sound_enabled: enabled });
  },

  async getNotifications(userId: string, limit = 50) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  async markAsRead(notificationId: string) {
    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async createNotification(notification: { user_id: string; title: string; content?: string | null; type: string; sale_id?: string | null }) {
    const { data, error } = await supabase
      .from('notifications')
      .insert([notification])
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
