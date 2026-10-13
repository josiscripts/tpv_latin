-- LATIDO DEL BRIDGE. Una fila por instalación. Escribe solo service_role (clave del Bridge).
-- Los usuarios autenticados leen el estado; anon no accede. Sin datos comerciales.
BEGIN;

CREATE TABLE IF NOT EXISTS public.bridge_heartbeats (
  installation_id TEXT PRIMARY KEY CHECK (char_length(installation_id) BETWEEN 8 AND 80),
  environment TEXT NOT NULL CHECK (environment IN ('PROD', 'LAB')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  process_running BOOLEAN NOT NULL DEFAULT false,
  sysme_connected BOOLEAN,
  sysme_checked_at TIMESTAMPTZ,
  consecutive_sysme_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_sysme_failures >= 0),
  sync_status TEXT NOT NULL DEFAULT 'unknown' CHECK (sync_status IN ('running', 'idle', 'error', 'stopped', 'unknown')),
  last_successful_sync_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  last_error_summary TEXT CHECK (last_error_summary IS NULL OR char_length(last_error_summary) <= 200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bridge_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bridge_heartbeats_select_authenticated ON public.bridge_heartbeats;
CREATE POLICY bridge_heartbeats_select_authenticated ON public.bridge_heartbeats
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active));

REVOKE ALL ON public.bridge_heartbeats FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.bridge_heartbeats FROM authenticated;
GRANT SELECT ON public.bridge_heartbeats TO authenticated;
GRANT ALL ON public.bridge_heartbeats TO service_role;

COMMIT;
