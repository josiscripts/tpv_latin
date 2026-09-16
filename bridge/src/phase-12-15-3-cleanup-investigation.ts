import { createClient } from '@supabase/supabase-js';
import { config } from './config';

async function investigateCleanup() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   FASE 12.15.3 — INVESTIGAR FALLO DE CLEANUP               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

  try {
    const TARGET_IDS = ['1', '2', '4', '6'];

    // PASO 1: Verificar estado actual
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ESTADO ACTUAL DE SALES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('id, sysme_id_venta, status, created_at, updated_at')
      .in('sysme_id_venta', TARGET_IDS);

    if (salesError) {
      console.error('✗ Error consultando sales:', salesError);
      process.exit(1);
    }

    console.log(`Sales encontradas: ${sales?.length || 0}`);
    if (sales && sales.length > 0) {
      sales.forEach((s: any) => {
        console.log(`  - ${s.sysme_id_venta} (Supabase ID: ${s.id})`);
        console.log(`    Status: ${s.status}`);
        console.log(`    Created: ${s.created_at}`);
        console.log(`    Updated: ${s.updated_at}`);
      });
    }
    console.log();

    // PASO 2: Intentar DELETE simple
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('INTENTO 1: DELETE SIMPLE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Intentando: DELETE FROM sales WHERE sysme_id_venta IN (...)\n');

    const { error: deleteError } = await supabase
      .from('sales')
      .delete()
      .in('sysme_id_venta', TARGET_IDS);

    if (deleteError) {
      console.error('✗ Error DELETE:', deleteError);
      console.log('  Posibles causas:');
      console.log('  - RLS policy bloqueando DELETE');
      console.log('  - FK constraint (sale_lines depende)');
      console.log('  - Permission issue\n');
    } else {
      console.log('✓ DELETE retornó success\n');
    }

    // PASO 3: Verificar si realmente se eliminaron
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('VERIFICACIÓN POST-DELETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: salesAfterDelete } = await supabase
      .from('sales')
      .select('id, sysme_id_venta')
      .in('sysme_id_venta', TARGET_IDS);

    console.log(`Sales después de DELETE: ${salesAfterDelete?.length || 0}\n`);

    if (salesAfterDelete && salesAfterDelete.length > 0) {
      console.log('⚠ PROBLEMA CONFIRMADO: Las sales NO fueron eliminadas');
      console.log('  Sales aún presentes:');
      salesAfterDelete.forEach((s: any) => {
        console.log(`    - sysme_id_venta: ${s.sysme_id_venta}`);
      });
      console.log();
    } else {
      console.log('✓ Sales fueron eliminadas correctamente');
    }

    // PASO 4: Verificar FK y ON DELETE behavior
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('INVESTIGAR FK - SALE_LINES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: lines } = await supabase
      .from('sale_lines')
      .select('id, sale_id, sysme_id_venta')
      .in('sysme_id_venta', TARGET_IDS);

    console.log(`Sale_lines relacionadas: ${lines?.length || 0}`);

    if (lines && lines.length > 0) {
      console.log('\nPreguntas sobre FK:');
      console.log('  1. ¿sale_lines tiene FK a sales.id?');
      console.log('     → Debería, pero ¿con ON DELETE CASCADE?');
      console.log('  2. ¿Si sale se elimina, sale_lines se elimina?');
      console.log('     → Probable causa: FK sin CASCADE');
      console.log();

      lines.forEach((l: any) => {
        console.log(`  Line: ${l.id} → Sale ID: ${l.sale_id}`);
      });
    }
    console.log();

    // PASO 5: Intentar DELETE en cascada manual
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('INTENTO 2: DELETE CASCADA MANUAL');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Obtener sale IDs que existen
    const { data: existingSales } = await supabase
      .from('sales')
      .select('id')
      .in('sysme_id_venta', TARGET_IDS);

    if (existingSales && existingSales.length > 0) {
      const saleIds = existingSales.map((s: any) => s.id);

      console.log(`Eliminando sale_lines para ${saleIds.length} sales...\n`);

      const { error: linesDelError } = await supabase
        .from('sale_lines')
        .delete()
        .in('sale_id', saleIds);

      if (linesDelError) {
        console.error('✗ Error eliminando sale_lines:', linesDelError);
      } else {
        console.log('✓ sale_lines eliminadas\n');
      }

      // Verificar que sale_lines se eliminaron
      const { data: linesCheck } = await supabase
        .from('sale_lines')
        .select('id')
        .in('sale_id', saleIds);

      console.log(`sale_lines restantes: ${linesCheck?.length || 0}\n`);

      // Ahora intentar eliminar sales
      console.log('Eliminando sales...\n');
      const { error: salesDelError } = await supabase
        .from('sales')
        .delete()
        .in('id', saleIds);

      if (salesDelError) {
        console.error('✗ Error eliminando sales:', salesDelError);
      } else {
        console.log('✓ sales eliminadas\n');
      }

      // Verificar final
      const { data: finalSalesCheck } = await supabase
        .from('sales')
        .select('id')
        .in('id', saleIds);

      console.log(`Sales restantes: ${finalSalesCheck?.length || 0}`);
    }

    console.log();
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    HALLAZGOS FINALES                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('HIPÓTESIS PROBABLE:');
    console.log('  - sale_lines tiene FK a sales.id');
    console.log('  - FK NO tiene ON DELETE CASCADE');
    console.log('  - DELETE sales falla silenciosamente por FK constraint');
    console.log('  - O RLS bloquea el DELETE\n');

    console.log('RECOMENDACIÓN:');
    console.log('  1. Verificar ON DELETE behavior en DB schema');
    console.log('  2. Si es FK issue: eliminar sale_lines primero');
    console.log('  3. Si es RLS issue: ajustar policies\n');

    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
    process.exit(1);
  }
}

investigateCleanup();
