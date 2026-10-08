-- Add notifications table to supabase_realtime publication
-- This allows Supabase Realtime to emit INSERT events from the notifications table
-- Fecha: 2026-10-08
-- Razón: Realtime no estaba recibiendo eventos INSERT porque notifications no estaba en la publicación

-- Agregar notificaciones a la publicación supabase_realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Verificación: Este comando hará que Realtime emita eventos cuando:
-- - Se inserte una fila en notifications
-- - Se actualice una fila en notifications
-- - Se elimine una fila en notifications
--
-- El filtro user_id=eq.${profile.id} funcionará correctamente ahora
