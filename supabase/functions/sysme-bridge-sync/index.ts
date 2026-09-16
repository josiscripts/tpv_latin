import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface SalesPayload {
  sysme_id_venta: string;
  sysme_serie: string;
  sysme_id_tiquet: string;
  sale_date: string;
  subtotal: number;
  tax: number;
  total: number;
  lineas: Array<{
    sysme_id_venta: string;
    sysme_id_linea: string;
    product_id: string;
    cantidad: number;
    PVPTiquet: number;
    precio_compra: number;
    total: number;
    avgiva: number;
  }>;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // Verificar autenticación
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.substring(7);
    // TODO: Validar token contra SERVICE_ROLE_KEY

    const payload: SalesPayload = await req.json();

    // Inicializar cliente
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Ejecutar transacción
    const result = await processSaleTransaction(supabase, payload);

    if (!result.success) {
      return new Response(JSON.stringify(result), { status: 400 });
    }

    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
});

async function processSaleTransaction(supabase: any, payload: SalesPayload) {
  try {
    // 1. UPSERT venta (idempotente)
    const { data: saleData, error: saleError } = await supabase
      .from("sales")
      .upsert(
        {
          source: "sysme",
          status: "completed",
          sysme_id_venta: payload.sysme_id_venta,
          sysme_serie: payload.sysme_serie,
          sysme_id_tiquet: payload.sysme_id_tiquet,
          sale_date: payload.sale_date,
          subtotal: payload.subtotal,
          tax: payload.tax,
          total: payload.total,
          payment_method: "unknown",
        },
        { onConflict: "sysme_id_venta" }
      )
      .select("id")
      .single();

    if (saleError) throw saleError;
    const saleId = saleData.id;

    // 2. Procesar líneas y actualizar stock
    // ESTRATEGIA: Borrar líneas existentes y re-insertar (garantiza idempotencia)
    // Esto es seguro porque:
    // - La venta ya existe (UPSERT anterior)
    // - Si es reintento, borra líneas viejas
    // - Luego inserta nuevas (garantiza consistencia)

    const { error: deleteError } = await supabase
      .from("sale_lines")
      .delete()
      .eq("sale_id", saleId);

    if (deleteError) throw deleteError;

    // Ahora insertar todas las líneas
    for (const linea of payload.lineas) {
      const { error: lineError } = await supabase
        .from("sale_lines")
        .insert({
          sale_id: saleId,
          product_id: linea.product_id,
          sysme_id_venta: linea.sysme_id_venta,
          sysme_id_linea: linea.sysme_id_linea,
          quantity: linea.cantidad,
          unit_sale_price: linea.PVPTiquet,
          unit_cost_at_time: linea.precio_compra > 0 ? linea.precio_compra : null,
          tax_rate: linea.avgiva,
          discount: 0,
          total_sale: linea.total,
        });

      if (lineError) throw lineError;

      // Verificar si el movimiento de stock ya existe (idempotencia)
      const { data: existingMovement } = await supabase
        .from("stock_movements")
        .select("id")
        .eq("reference_id", saleId)
        .eq("product_id", linea.product_id)
        .eq("movement_type", "sale")
        .single();

      // Si el movimiento ya existe, saltamos actualización de stock (es reintento)
      if (!existingMovement) {
        // Obtener stock actual
        const { data: productData, error: prodError } = await supabase
          .from("products")
          .select("stock")
          .eq("id", linea.product_id)
          .single();

        if (prodError) throw prodError;

        const currentStock = productData.stock || 0;
        const newStock = currentStock - linea.cantidad;

        // Actualizar stock
        const { error: updateError } = await supabase
          .from("products")
          .update({ stock: newStock })
          .eq("id", linea.product_id);

        if (updateError) throw updateError;

        // Registrar movimiento
        const { error: movError } = await supabase
          .from("stock_movements")
          .insert({
            product_id: linea.product_id,
            movement_type: "sale",
            quantity: -linea.cantidad,
            previous_stock: currentStock,
            resulting_stock: newStock,
            reference_type: "sale",
            reference_id: saleId,
            source: "sysme_bridge",
            reason: `Venta Sysme ${payload.sysme_id_venta}`,
          });

        if (movError) throw movError;
      }
    }

    // 3. Actualizar cursor
    const { error: cursorError } = await supabase
      .from("sync_state")
      .update({
        last_finalized_sale_id: payload.sysme_id_venta,
        last_sync_at: new Date().toISOString(),
        status: "idle",
      })
      .eq("integration_name", "sysme_bridge");

    if (cursorError) throw cursorError;

    return {
      success: true,
      saleId,
      message: `Sale ${payload.sysme_id_venta} processed successfully`,
    };
  } catch (error) {
    console.error("Transaction error:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}
