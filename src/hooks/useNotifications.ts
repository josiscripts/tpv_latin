import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsService } from '@/services/notifications.service';

const NOTIFICATION_PREFERENCES_KEY = (userId: string) => ['notification-preferences', userId];
const NOTIFICATIONS_KEY = (userId: string) => ['notifications', userId];

export function useNotificationPreferences(userId: string | null) {
  return useQuery({
    queryKey: NOTIFICATION_PREFERENCES_KEY(userId || ''),
    queryFn: () => (userId ? notificationsService.getPreferences(userId) : null),
    enabled: !!userId,
  });
}

export function useToggleSalesNotifications(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (enabled: boolean) =>
      userId ? notificationsService.toggleSalesNotifications(userId, enabled) : Promise.reject('No user'),
    onSuccess: () => {
      userId && queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_KEY(userId) });
    },
  });
}

export function useToggleProductNotifications(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (enabled: boolean) =>
      userId ? notificationsService.toggleProductNotifications(userId, enabled) : Promise.reject('No user'),
    onSuccess: () => {
      userId && queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_KEY(userId) });
    },
  });
}

export function useToggleSoundNotifications(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (enabled: boolean) =>
      userId ? notificationsService.toggleSoundNotifications(userId, enabled) : Promise.reject('No user'),
    onSuccess: () => {
      userId && queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_KEY(userId) });
    },
  });
}

export function useNotifications(userId: string | null) {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY(userId || ''),
    queryFn: () => (userId ? notificationsService.getNotifications(userId) : []),
    enabled: !!userId,
  });
}
