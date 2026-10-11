import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type UserPreferences = Database['public']['Tables']['user_preferences']['Row'];
type UserPreferencesInsert = Database['public']['Tables']['user_preferences']['Insert'];
type UserPreferencesUpdate = Database['public']['Tables']['user_preferences']['Update'];

export const userPreferencesService = {
  async getByUserId(userId: string) {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async upsert(userId: string, preferences: Partial<UserPreferencesInsert>) {
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        ...preferences,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateTheme(userId: string, theme: 'light' | 'dark') {
    return this.upsert(userId, { theme });
  },

  async updateAccentColor(userId: string, accentColor: string) {
    return this.upsert(userId, { accent_color: accentColor });
  },

  async updateLanguage(userId: string, language: 'es' | 'en' | 'ca') {
    return this.upsert(userId, { language });
  },

  async updateAIModel(userId: string, aiModelId: string) {
    return this.upsert(userId, { ai_model_id: aiModelId });
  },
};
