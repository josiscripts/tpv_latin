// Estado del Bridge a partir de su latido (tabla bridge_heartbeats). Función pura, sin dependencias.
// Solo afirma lo que el latido permite verificar.

export interface LatidoBridge {
  environment: string;
  last_seen_at: string;
  process_running: boolean;
  sysme_connected: boolean | null;
  consecutive_sysme_failures: number;
  sync_status: string;
  last_successful_sync_at: string | null;
  last_error_summary: string | null;
}

export type EstadoBridge = 'activa' | 'reconectando' | 'sin_sysme' | 'desconocido';

// El Bridge envía latido cada 60 s. Sin señal durante 3 minutos no sabemos si falla Sysme o Supabase.
export const UMBRAL_SIN_SENAL_MS = 3 * 60 * 1000;
// Tres comprobaciones seguidas fallidas (3 minutos) con señal reciente = Sysme sin conexión.
export const FALLOS_PARA_SIN_CONEXION = 3;

export interface EstadoBridgeInfo {
  estado: EstadoBridge;
  texto: string;
  detalle: string;
}

export function estadoBridge(latido: LatidoBridge | null, ahoraMs: number): EstadoBridgeInfo {
  if (!latido) {
    return { estado: 'desconocido', texto: 'Estado desconocido', detalle: 'Todavía no hay datos del Bridge.' };
  }
  const ultimaSenal = Date.parse(latido.last_seen_at);
  if (Number.isNaN(ultimaSenal) || ahoraMs - ultimaSenal > UMBRAL_SIN_SENAL_MS) {
    const cuando = Number.isNaN(ultimaSenal) ? 'fecha desconocida' : new Date(ultimaSenal).toLocaleString('es-ES');
    return {
      estado: 'desconocido',
      texto: 'Estado desconocido',
      detalle: `Sin señal del Bridge desde ${cuando}. No se puede saber si falla Sysme o la conexión con el servidor.`,
    };
  }
  if (!latido.process_running || latido.sync_status === 'stopped') {
    return { estado: 'desconocido', texto: 'Estado desconocido', detalle: 'La sincronización está detenida.' };
  }
  if (latido.sysme_connected === true) {
    return { estado: 'activa', texto: 'Sincronización activa', detalle: 'Sysme responde y el Bridge envía su estado.' };
  }
  if (latido.sysme_connected === false) {
    const fallos = latido.consecutive_sysme_failures;
    if (fallos >= FALLOS_PARA_SIN_CONEXION) {
      return {
        estado: 'sin_sysme',
        texto: 'Sin conexión con Sysme',
        detalle: latido.last_error_summary ?? 'Sysme no responde.',
      };
    }
    return {
      estado: 'reconectando',
      texto: 'Reconectando',
      detalle: `Sysme no responde (${fallos} de ${FALLOS_PARA_SIN_CONEXION}). Reintentando.`,
    };
  }
  return { estado: 'desconocido', texto: 'Estado desconocido', detalle: 'Sysme todavía no se ha comprobado.' };
}
