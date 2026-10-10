import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface AICredentials {
  id: string;
  provider: string;
  model_id: string;
  validation_status: 'unvalidated' | 'valid' | 'invalid';
  updated_at: string;
}

const AI_CREDENTIALS_KEY = (userId: string) => ['ai-credentials', userId];

/**
 * Get user's AI credentials configuration (metadata only, never the key)
 * Uses Edge Function backend to ensure no secrets leak
 */
export function useAICredentials(userId: string | null) {
  return useQuery({
    queryKey: AI_CREDENTIALS_KEY(userId || ''),
    queryFn: async () => {
      if (!userId) return null;

      try {
        const { data, error } = await supabase.functions.invoke('user-ai-credentials', {
          body: { action: 'get' },
        });

        if (error) throw error;
        return data?.data as AICredentials | null;
      } catch (err) {
        console.error('[useAICredentials] get failed:', err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    enabled: !!userId,
  });
}

/**
 * Save API key and model selection
 */
export function useSaveAICredentials(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ apiKey, modelId }: { apiKey: string; modelId: string }) => {
      if (!userId) throw new Error('No user');

      if (!apiKey.startsWith('sk-ant-')) {
        throw new Error('Invalid API key format');
      }

      try {
        const { data, error } = await supabase.functions.invoke('user-ai-credentials', {
          body: { action: 'save', apiKey, modelId },
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Failed to save credentials');
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[useSaveAICredentials] save failed:', message);
        throw new Error(message.includes('fetch') ? 'Connection failed. Ensure Supabase LOCAL is running.' : message);
      }
    },
    onSuccess: () => {
      userId && queryClient.invalidateQueries({ queryKey: AI_CREDENTIALS_KEY(userId) });
    },
  });
}

/**
 * Delete API credentials
 */
export function useDeleteAICredentials(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('No user');

      try {
        const { data, error } = await supabase.functions.invoke('user-ai-credentials', {
          body: { action: 'delete' },
        });

        if (error) throw error;
        return data || { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[useDeleteAICredentials] delete failed:', message);
        throw new Error(message.includes('fetch') ? 'Connection failed. Ensure Supabase LOCAL is running.' : message);
      }
    },
    onSuccess: () => {
      userId && queryClient.invalidateQueries({ queryKey: AI_CREDENTIALS_KEY(userId) });
    },
  });
}

/**
 * Test API key connection
 * Runs server-side in Edge Function — frontend never sees the key
 */
export function useTestAIConnection(userId: string | null) {
  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('No user');

      try {
        const { data, error } = await supabase.functions.invoke('user-ai-credentials', {
          body: { action: 'test' },
        });

        if (error) throw error;
        if (!data?.valid) throw new Error(data?.error || 'API key validation failed');
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[useTestAIConnection] test failed:', message);
        throw new Error(message);
      }
    },
  });
}
