import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type UserAICredentials = Database['public']['Tables']['user_ai_credentials']['Row'];
type UserAICredentialsInsert = Database['public']['Tables']['user_ai_credentials']['Insert'];
type UserAICredentialsUpdate = Database['public']['Tables']['user_ai_credentials']['Update'];

export const userAICredentialsService = {
  /**
   * Get user's Anthropic credentials
   * Only returns non-sensitive metadata, never the encrypted key
   */
  async getByUserId(userId: string) {
    const { data, error } = await supabase
      .from('user_ai_credentials')
      .select('id, user_id, provider, model_id, validation_status, last_validated_at, created_at, updated_at')
      .eq('user_id', userId)
      .eq('provider', 'anthropic')
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  },

  /**
   * Save user's API key (encrypted on backend)
   * Frontend should not attempt to encrypt - send to secure endpoint
   */
  async upsert(userId: string, apiKey: string, modelId: string) {
    // This will be handled by an RPC function or endpoint that:
    // 1. Receives the plain key from frontend via HTTPS
    // 2. Encrypts it server-side with a server-only encryption key
    // 3. Stores the encrypted version
    // 4. Never returns the plain or encrypted key

    const { data, error } = await supabase
      .rpc('upsert_ai_credentials', {
        p_user_id: userId,
        p_provider: 'anthropic',
        p_api_key: apiKey,
        p_model_id: modelId,
      });

    if (error) throw error;
    return data;
  },

  /**
   * Update model selection only
   */
  async updateModel(userId: string, modelId: string) {
    const { data, error } = await supabase
      .from('user_ai_credentials')
      .update({ model_id: modelId, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', 'anthropic')
      .select('model_id, updated_at')
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete user's API credentials
   */
  async delete(userId: string) {
    const { error } = await supabase
      .from('user_ai_credentials')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'anthropic');

    if (error) throw error;
  },

  /**
   * Test API key validity (backend only)
   * Returns true/false without exposing the key
   */
  async testConnection(userId: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const result = await supabase
        .rpc('test_ai_credentials', {
          p_user_id: userId,
          p_provider: 'anthropic',
        });

      if (result.error) {
        return { valid: false, error: result.error.message };
      }

      return { valid: result.data?.valid || false, error: result.data?.error };
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  },

  /**
   * Check if user has configured API credentials
   */
  async hasCredentials(userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('user_ai_credentials')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'anthropic')
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  },
};
