import { createClient } from '@supabase/supabase-js';
import { config } from './config';

async function diagnoseIdempotence() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║    FASE 12.15.3 — DIAGNÓSTICO DE IDEMPOTENCIA               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

  try {
    const PRODUCT_ID = '19034260-0971-40a2-a573-3e91ff8ba102';

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TODOS LOS MOVIMIENTOS DE STOCK PARA ESTE PRODUCTO');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: movements } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('product_id', PRODUCT_ID)
      .order('created_at', { ascending: true });

    console.log(`Total movimientos: ${movements?.length || 0}\n`);

    if (movements) {
      movements.forEach((m: any, i: number) => {
        console.log(`${i + 1}. ${m.created_at}`);
        console.log(`   Type: ${m.movement_type}`);
        console.log(`   Quantity: ${m.quantity}`);
        console.log(`   Previous: ${m.previous_stock} → Result: ${m.resulting_stock}`);
        console.log(`   Source: ${m.source}`);
        console.log(`   Reason: ${m.reason}`);
        console.log();
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('DIAGNÓSTICO');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (movements && movements.length > 1) {
      console.log('⚠ PROBLEMA: Hay múltiples movimientos para la misma venta');
      console.log('  Causa probable: Sale_lines verification no funcionó correctamente');
      console.log();
      console.log('Solución: Revisar la lógica en Edge Function para sale_lines check');
    }

    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
    process.exit(1);
  }
}

diagnoseIdempotence();
