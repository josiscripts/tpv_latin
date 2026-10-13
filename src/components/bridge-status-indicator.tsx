import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { estadoBridge, type EstadoBridge, type LatidoBridge } from '@/lib/bridge-estado';

const COLORES: Record<EstadoBridge, string> = {
  activa: 'bg-emerald-500',
  reconectando: 'bg-amber-400',
  sin_sysme: 'bg-red-500',
  desconocido: 'bg-slate-400',
};

// La tabla bridge_heartbeats no está en los tipos generados. Lectura con RLS: solo usuarios activos.
function useLatidoBridge(entorno: string) {
  return useQuery({
    queryKey: ['bridge-heartbeat', entorno],
    queryFn: async (): Promise<LatidoBridge | null> => {
      const { data, error } = await (supabase as any)
        .from('bridge_heartbeats')
        .select('environment,last_seen_at,process_running,sysme_connected,consecutive_sysme_failures,sync_status,last_successful_sync_at,last_error_summary')
        .eq('environment', entorno)
        .order('last_seen_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data as LatidoBridge[] | null)?.[0]) ?? null;
    },
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function BridgeStatusIndicator() {
  const entorno = import.meta.env['VITE_BRIDGE_ENVIRONMENT'] || 'PROD';
  const { data, isError } = useLatidoBridge(entorno);

  const info = isError
    ? { estado: 'desconocido' as const, texto: 'Estado desconocido', detalle: 'No se pudo leer el estado del Bridge.' }
    : estadoBridge(data ?? null, Date.now());

  return (
    <div
      role="status"
      aria-live="polite"
      title={info.detalle}
      className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs whitespace-nowrap"
    >
      <span className={`size-2.5 rounded-full ${COLORES[info.estado]}`} aria-hidden="true" />
      <span className="font-medium">{info.texto}</span>
    </div>
  );
}
