import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userPreferencesService } from '@/services/user-preferences.service';

const USER_PREFERENCES_KEY = (userId: string) => ['user-preferences', userId];

export function useUserPreferences(userId: string | null) {
  return useQuery({
    queryKey: USER_PREFERENCES_KEY(userId || ''),
    queryFn: () => (userId ? userPreferencesService.getByUserId(userId) : null),
    enabled: !!userId,
  });
}

export function useUpdateTheme(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (theme: 'light' | 'dark') =>
      userId ? userPreferencesService.updateTheme(userId, theme) : Promise.reject('No user'),
    onSuccess: () => {
      userId && queryClient.invalidateQueries({ queryKey: USER_PREFERENCES_KEY(userId) });
    },
  });
}

export function useUpdateAccentColor(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accentColor: string) =>
      userId ? userPreferencesService.updateAccentColor(userId, accentColor) : Promise.reject('No user'),
    onSuccess: () => {
      userId && queryClient.invalidateQueries({ queryKey: USER_PREFERENCES_KEY(userId) });
    },
  });
}

export function useUpdateLanguage(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (language: 'es' | 'en' | 'ca') =>
      userId ? userPreferencesService.updateLanguage(userId, language) : Promise.reject('No user'),
    onSuccess: () => {
      userId && queryClient.invalidateQueries({ queryKey: USER_PREFERENCES_KEY(userId) });
    },
  });
}

export function useUpdateAIModel(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (aiModelId: string) =>
      userId ? userPreferencesService.updateAIModel(userId, aiModelId) : Promise.reject('No user'),
    onSuccess: () => {
      userId && queryClient.invalidateQueries({ queryKey: USER_PREFERENCES_KEY(userId) });
    },
  });
}
