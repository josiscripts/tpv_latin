import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useRealtimeSubscriptions() {
  const queryClient = useQueryClient();

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
}
