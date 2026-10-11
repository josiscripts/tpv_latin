import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthContext } from '@/components/auth-provider';
import { notificationsService } from '@/services/notifications.service';
import { toast } from 'sonner';

const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioContext.currentTime;

    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);
    osc1.frequency.value = 800;

    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    osc2.frequency.value = 1000;

    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.2, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.15, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc1.start(now);
    osc1.stop(now + 0.3);

    osc2.start(now + 0.05);
    osc2.stop(now + 0.4);
  } catch (error) {
    console.warn('Notification sound unavailable', error);
  }
};

const processedNotificationIds = new Set<string>();

export function useRealtimeSubscriptions() {
  const queryClient = useQueryClient();
  const { profile } = useAuthContext();
  const notificationsChannelRef = useRef<any>(null);

  useEffect(() => {
    // Suscripción única global para productos
    const productsChannel = supabase
      .channel('products-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'products',
        },
        (payload) => {
          console.log('[REALTIME] Product updated:', payload.new?.id, 'stock:', payload.new?.stock);
          queryClient.invalidateQueries({ queryKey: ['products'] });
        }
      )
      .subscribe((status) => {
        console.log('[REALTIME] Products channel status:', status);
      });

    // Suscripción única global para ventas
    const salesChannel = supabase
      .channel('sales-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales',
        },
        (payload) => {
          console.log('[REALTIME] Sales change:', payload.eventType, payload.new || payload.old);
          queryClient.invalidateQueries({ queryKey: ['sales'] });
        }
      )
      .subscribe((status) => {
        console.log('[REALTIME] Sales channel status:', status);
      });

    // Cleanup: eliminar ambos canales
    return () => {
      supabase.removeChannel(productsChannel);
      supabase.removeChannel(salesChannel);
    };
  }, [queryClient]);

  // Suscripción única global para notificaciones (se crea DESPUÉS de que profile.id esté disponible)
  useEffect(() => {
    if (!profile?.id) {
      console.log('[REALTIME NOTIFICATIONS] Skipping - profile.id not available yet');
      return;
    }

    // Si ya existe un canal para este usuario, no crear otro
    if (notificationsChannelRef.current) {
      console.log('[REALTIME NOTIFICATIONS] Channel already exists for this user');
      return;
    }

    console.log(`[REALTIME NOTIFICATIONS] Creating listener for user: ${profile.id.substring(0, 8)}...`);

    const notificationsChannel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        async (payload) => {
          const newNotifId = (payload.new as any)?.id;
          const notification = payload.new as any;
          const notificationType = notification?.type || 'system';

          console.log(`[REALTIME NOTIFICATIONS] INSERT RECEIVED - notification ID: ${newNotifId}, type: ${notificationType}`);

          // Deduplicar: no procesar si ya fue visto
          if (processedNotificationIds.has(newNotifId)) {
            console.log(`[REALTIME NOTIFICATIONS] Duplicate notification: ${newNotifId} (already processed)`);
            queryClient.invalidateQueries({
              queryKey: ['notifications', profile.id],
            });
            return;
          }

          // Marcar como procesado
          processedNotificationIds.add(newNotifId);

          console.log(`[REALTIME NOTIFICATIONS] Processing new notification: ${newNotifId}`);

          // Obtener preferencias de notificación
          try {
            const prefs = await notificationsService.getPreferences(profile.id);

            // Verificar si el tipo de notificación está habilitado
            let typeEnabled = true;
            if (notificationType === 'sale') {
              typeEnabled = prefs?.sales_enabled ?? true;
            } else if (notificationType === 'product') {
              typeEnabled = prefs?.products_enabled ?? true;
            }

            if (!typeEnabled) {
              console.log(`[REALTIME NOTIFICATIONS] Notification type '${notificationType}' is disabled`);
              queryClient.invalidateQueries({
                queryKey: ['notifications', profile.id],
              });
              return;
            }

            // Reproducir sonido si está habilitado
            if (prefs?.sound_enabled ?? true) {
              console.log('[REALTIME NOTIFICATIONS] SOUND ENABLED');
              playNotificationSound();
              console.log('[REALTIME NOTIFICATIONS] SOUND PLAY');
            } else {
              console.log('[REALTIME NOTIFICATIONS] SOUND DISABLED');
            }

            // Mostrar toast visual
            console.log('[REALTIME NOTIFICATIONS] TOAST');
            toast.success(notification?.['title'] || 'Nueva notificación', {
              description: notification?.['content'] || '',
              duration: 8000,
            });

            // Invalidar cache para actualizar badge y historial
            console.log('[REALTIME NOTIFICATIONS] Invalidating React Query cache');
            queryClient.invalidateQueries({
              queryKey: ['notifications', profile.id],
            });
          } catch (error) {
            console.error('[REALTIME NOTIFICATIONS] Error fetching preferences:', error);
            // Aún así mostrar el toast aunque falle
            toast.success(notification?.['title'] || 'Nueva notificación', {
              description: notification?.['content'] || '',
              duration: 8000,
            });
            queryClient.invalidateQueries({
              queryKey: ['notifications', profile.id],
            });
          }
        }
      )
      .subscribe((status) => {
        console.log(`[REALTIME NOTIFICATIONS] Channel status: ${status}`);
      });

    notificationsChannelRef.current = notificationsChannel;

    return () => {
      console.log(`[REALTIME NOTIFICATIONS] Cleaning up listener for user: ${profile.id.substring(0, 8)}...`);
      supabase.removeChannel(notificationsChannel);
      notificationsChannelRef.current = null;
      processedNotificationIds.clear();
    };
  }, [profile?.id, queryClient]);
}
