import { createClient } from '@supabase/supabase-js';
import { config } from './config';

async function diagnose() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     DIAGNÓSTICO: SALE_LINES FALTANTES                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // 1. VENTAS EN SUPABASE
    // ═══════════════════════════════════════════════════════════════════════
    const { data: allSales } = await supabase
      .from('sales')
      .select('id, sysme_id_venta');

    console.log('Ventas en Supabase:\n');

    for (const sale of (allSales || [])) {
      console.log(`  Venta ${sale.sysme_id_venta} (id: ${sale.id}):`);

      // Líneas para esta venta
      const { data: lines } = await supabase
        .from('sale_lines')
        .select('id, sysme_id_linea, product_id')
        .eq('sale_id', sale.id);

      console.log(`    Líneas: ${lines?.length || 0}`);

      // Movimientos para esta venta
      const { data: movements } = await supabase
        .from('stock_movements')
        .select('id, product_id, quantity')
        .eq('reference_id', sale.id);

      console.log(`    Movimientos: ${movements?.length || 0}`);

      if (lines && lines.length > 0) {
        console.log(`    Detalles líneas:`);
        (lines || []).forEach((l: any) => {
          console.log(`      - ${l.sysme_id_linea}: ${l.product_id}`);
        });
      }

      if (movements && movements.length > 0) {
        console.log(`    Detalles movimientos:`);
        (movements || []).forEach((m: any) => {
          console.log(`      - ${m.product_id}: qty ${m.quantity}`);
        });
      }

      console.log();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. MAPEO DE PRODUCTOS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('Mapeo de productos:\n');

    const { data: mappings } = await supabase
      .from('sysme_product_map')
      .select('id_complementog, product_id');

    (mappings || []).forEach((m: any) => {
      console.log(`  ${m.id_complementog} → ${m.product_id}`);
    });
    console.log();

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Error:', (error as Error).message);
    process.exit(1);
  }
}

diagnose();
