import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileService } from '@/services/profile.service';

const PROFILE_KEY = (userId: string) => ['profile', userId];

export function useProfile(userId: string | null) {
  return useQuery({
    queryKey: PROFILE_KEY(userId || ''),
    queryFn: () => (userId ? profileService.getById(userId) : null),
    enabled: !!userId,
  });
}

export function useUpdateFullName(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fullName: string) =>
      userId ? profileService.updateFullName(userId, fullName) : Promise.reject('No user'),
    onSuccess: () => {
      userId && queryClient.invalidateQueries({ queryKey: PROFILE_KEY(userId) });
    },
  });
}

export function useUploadAvatar(userId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) =>
      userId ? profileService.uploadAvatar(userId, file) : Promise.reject('No user'),
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({
          queryKey: PROFILE_KEY(userId),
          refetchType: 'all',
        });
      }
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) =>
      profileService.changePassword(oldPassword, newPassword),
  });
}

export function useUpdateEmail() {
  return useMutation({
    mutationFn: (newEmail: string) =>
      profileService.updateEmail(newEmail),
  });
}
