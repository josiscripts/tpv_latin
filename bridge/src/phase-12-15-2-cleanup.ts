import { createClient } from '@supabase/supabase-js';
import { config } from './config';

async function cleanupForPhase() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║      FASE 12.15.2 — CLEANUP SUPABASE PARA TEST REAL       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('⚠ JUSTIFICACIÓN:');
  console.log('  - Ventas 1 y 2 existen de ejecuciones anteriores');
  console.log('  - Cursor fue avanzado a 6');
  console.log('  - Edge Function usa INSERT (no idempotente)');
  console.log('  - Necesitamos estado LIMPIO para sync real\n');

  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

  try {
    // 1. Obtener sales para limpiar
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 1: IDENTIFICAR REGISTROS A LIMPIAR');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: sales } = await supabase
      .from('sales')
      .select('id, sysme_id_venta')
      .in('sysme_id_venta', ['1', '2', '4', '6']);

    console.log(`Sales a limpiar: ${sales?.length || 0}\n`);

    if (sales && sales.length > 0) {
      for (const sale of sales) {
        console.log(`  ID Supabase: ${sale.id}`);
        console.log(`  Sysme ID: ${sale.sysme_id_venta}`);
      }
      console.log();
    }

    // 2. Limpiar sale_lines asociadas
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 2: ELIMINAR SALE_LINES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (sales && sales.length > 0) {
      const { error: linesError } = await supabase
        .from('sale_lines')
        .delete()
        .in('sysme_id_venta', ['1', '2', '4', '6']);

      if (linesError) {
        console.error('✗ Error eliminando sale_lines:', linesError);
        process.exit(1);
      }

      console.log('✓ Sale_lines eliminadas\n');
    }

    // 3. Limpiar stock_movements
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 3: ELIMINAR STOCK_MOVEMENTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (sales && sales.length > 0) {
      const saleIds = sales.map((s) => s.id);

      const { error: movError } = await supabase
        .from('stock_movements')
        .delete()
        .in('reference_id', saleIds);

      if (movError) {
        console.error('✗ Error eliminando stock_movements:', movError);
        process.exit(1);
      }

      console.log('✓ Stock_movements eliminados\n');
    }

    // 4. Limpiar sales
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 4: ELIMINAR SALES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (sales && sales.length > 0) {
      const { error: salesError } = await supabase
        .from('sales')
        .delete()
        .in('sysme_id_venta', ['1', '2', '4', '6']);

      if (salesError) {
        console.error('✗ Error eliminando sales:', salesError);
        process.exit(1);
      }

      console.log('✓ Sales eliminadas\n');
    }

    // 5. Resetear cursor
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 5: RESETEAR CURSOR');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { error: cursorError } = await supabase
      .from('sync_state')
      .update({
        last_finalized_sale_id: 0,
        status: 'idle',
      })
      .eq('integration_name', 'sysme_bridge');

    if (cursorError) {
      console.error('✗ Error reseteando cursor:', cursorError);
      process.exit(1);
    }

    console.log('✓ Cursor resetado a 0\n');

    // Verificación final
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('VERIFICACIÓN FINAL');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: salesCheck } = await supabase
      .from('sales')
      .select('id')
      .in('sysme_id_venta', ['1', '2', '4', '6']);

    const { data: linesCheck } = await supabase
      .from('sale_lines')
      .select('id')
      .in('sysme_id_venta', ['1', '2', '4', '6']);

    const { data: stateCheck } = await supabase
      .from('sync_state')
      .select('last_finalized_sale_id')
      .limit(1);

    console.log(`Sales restantes: ${salesCheck?.length || 0}`);
    console.log(`Lines restantes: ${linesCheck?.length || 0}`);
    console.log(`Cursor: ${stateCheck?.[0]?.last_finalized_sale_id || 0}`);
    console.log();

    if ((salesCheck?.length || 0) === 0 && (linesCheck?.length || 0) === 0) {
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║              ✓ CLEANUP COMPLETADO - ESTADO LIMPIO          ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      console.log('Supabase está listo para FASE 12.15.2 (sync real)\n');
    }

    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
    process.exit(1);
  }
}

cleanupForPhase();
