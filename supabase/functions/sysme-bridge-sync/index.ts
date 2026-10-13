// Recepción de ventas de Sysme (Bridge). Autenticación real: el Bridge envía la clave service_role
// en Authorization: Bearer. Cualquier otra credencial (vacía, malformada, anon, usuario, clave falsa) se rechaza.
// La aplicación de la venta se delega en la función SQL sysme_apply_sale (transacción, idempotente).
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_BODY_BYTES = 512 * 1024;

// Comparación en tiempo constante: no revela en qué posición difiere la credencial.
function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer ([^\s]{20,4096})$/.exec(header);
  return m ? m[1] : null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Método no permitido" });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("sysme-bridge-sync: configuración del entorno incompleta");
    return json(500, { error: "Configuración del servidor incompleta" });
  }

  const token = bearerToken(req);
  if (!token || !constantTimeEqual(token, SERVICE_ROLE_KEY)) {
    // Mismo mensaje para cualquier credencial incorrecta
    return json(401, { error: "No autorizado" });
  }

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return json(413, { error: "Petición demasiado grande" });
  }

  let payload: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, { error: "Petición demasiado grande" });
    payload = JSON.parse(raw);
  } catch {
    return json(400, { error: "JSON no válido" });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(400, { error: "Formato de venta no válido" });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("sysme_apply_sale", { p_payload: payload });

  if (error) {
    // 22023 = dato de la venta no válido (lo corrige el origen). Cualquier otro error es interno.
    if (error.code === "22023") {
      return json(400, { success: false, error: error.message });
    }
    console.error("sysme-bridge-sync: fallo al aplicar la venta", error.code, error.message);
    return json(500, { success: false, error: "No se pudo aplicar la venta" });
  }

  return json(200, data);
});
