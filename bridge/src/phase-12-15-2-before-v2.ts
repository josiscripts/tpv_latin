import { createClient } from '@supabase/supabase-js';
import { config } from './config';

async function captureBeforeState() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          FASE 12.15.2 — ESTADO SUPABASE ANTES             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    const supabase = createClient(config.supabase.url, config.supabase.serviceKey);
    const TEST_SALE_ID = 1; // Venta candidata

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 1: REVISAR TABLA sysme_product_map');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Primero, ver todo lo que existe en el mapping
    const { data: allMappings, error: allError } = await supabase
      .from('sysme_product_map')
      .select('*');

    if (allError) {
      console.error('✗ Error consultando sysme_product_map:', allError);
      console.log('\nIntentando acceder a la tabla...');

      // Try to see the schema
      const { data: testData, error: testError } = await supabase
        .from('sysme_product_map')
        .select('*')
        .limit(1);

      if (testError) {
        console.error('✗ La tabla podría no existir o no tener registros');
        console.error('Error:', testError);
      }
    }

    console.log(`Registros en sysme_product_map: ${allMappings?.length || 0}\n`);

    if (allMappings && allMappings.length > 0) {
      console.log('Primeros registros:');
      allMappings.slice(0, 3).forEach((m: any) => {
        console.log(JSON.stringify(m, null, 2));
      });
      console.log();

      // Buscar mapeo para producto 00001
      const mapping00001 = allMappings.find((m: any) => m.id_complementog === '00001' || m.sysme_id === '00001');

      if (mapping00001) {
        console.log(`✓ Mapping para 00001 encontrado`);
        console.log(JSON.stringify(mapping00001, null, 2));
      } else {
        console.log(`⚠ No existe mapping para producto 00001`);
        console.log('  Availables:', allMappings.map((m: any) => m.id_complementog || m.sysme_id).join(', '));
      }
    } else {
      console.log('⚠ sysme_product_map está vacía o no existe');
      console.log('  El mapping se creará automáticamente durante la sincronización');
    }
    console.log();

    // PASO 2: Estado de Supabase
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 2: VENTA EN SUPABASE ANTES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: beforeSales, error: beforeSalesError } = await supabase
      .from('sales')
      .select('*')
      .eq('sysme_id_venta', TEST_SALE_ID);

    if (beforeSalesError) {
      console.error('✗ Error consultando sales:', beforeSalesError);
      process.exit(1);
    }

    console.log(`Sales con sysme_id_venta=${TEST_SALE_ID}: ${beforeSales?.length || 0}\n`);

    if (beforeSales && beforeSales.length > 0) {
      console.log('⚠ ADVERTENCIA: La venta ya existe en Supabase');
      beforeSales.forEach((s: any) => {
        console.log(`  ID: ${s.id} | sysme_id_venta: ${s.sysme_id_venta}`);
      });
    } else {
      console.log('✓ Venta no existe en Supabase (estado limpio)');
    }
    console.log();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 3: LÍNEAS EN SUPABASE ANTES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: beforeLines, error: beforeLinesError } = await supabase
      .from('sale_lines')
      .select('*')
      .eq('sysme_id_venta', TEST_SALE_ID);

    if (beforeLinesError) {
      console.error('✗ Error consultando sale_lines:', beforeLinesError);
      process.exit(1);
    }

    console.log(`Sale_lines con sysme_id_venta=${TEST_SALE_ID}: ${beforeLines?.length || 0}\n`);

    if (beforeLines && beforeLines.length > 0) {
      console.log('⚠ ADVERTENCIA: Líneas ya existen');
      beforeLines.forEach((l: any) => {
        console.log(`  Line ID: ${l.sysme_id_linea}`);
      });
    } else {
      console.log('✓ Líneas no existen en Supabase (estado limpio)');
    }
    console.log();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 4: CURSOR STATE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: syncState, error: syncStateError } = await supabase
      .from('sync_state')
      .select('*')
      .limit(1);

    if (syncStateError) {
      console.error('✗ Error consultando sync_state:', syncStateError);
      process.exit(1);
    }

    console.log(`Sync state:\n`);
    if (syncState && syncState.length > 0) {
      const state = syncState[0];
      console.log(`  last_finalized_sale_id: ${state.last_finalized_sale_id}`);
    } else {
      console.log('  No sync state found');
    }
    console.log();

    // Resumen
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ESTADO ANTES (SUMMARY)                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`Venta candidata: ID 1`);
    console.log(`Mappings en Supabase: ${allMappings?.length || 0}`);
    console.log(`Sales existentes: ${beforeSales?.length || 0}`);
    console.log(`Lines existentes: ${beforeLines?.length || 0}`);
    console.log(`Cursor: ${syncState?.[0]?.last_finalized_sale_id || 0}`);
    console.log();

    console.log('✓ Estado capturado\n');

    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
    console.error(error);
    process.exit(1);
  }
}

captureBeforeState();
