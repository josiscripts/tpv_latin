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
    console.log('STEP 1: MAPPING DEL PRODUCTO');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: mappings, error: mappingError } = await supabase
      .from('sysme_product_map')
      .select('*')
      .eq('sysme_id_complementog', '00001');

    if (mappingError) {
      console.error('✗ Error consultando mappings:', mappingError);
      process.exit(1);
    }

    console.log(`Mappings encontrados: ${mappings?.length || 0}\n`);

    if (mappings && mappings.length > 0) {
      mappings.forEach((m: any) => {
        console.log(`Sysme 00001 → Supabase ${m.supabase_product_id}`);
      });
    } else {
      console.log('⚠ NO existe mapping para Sysme 00001');
      console.log('  Esto causará que la sincronización FALLE');
    }
    console.log();

    // Si no hay mapping, no continuar
    if (!mappings || mappings.length === 0) {
      console.log('✗ DETENIDO: Sin mapping, no es seguro continuar');
      process.exit(1);
    }

    const mapping = mappings[0];
    const supabaseProductId = mapping.supabase_product_id;

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
        console.log(`  ID: ${s.id} | sysme_id_venta: ${s.sysme_id_venta} | status: ${s.status}`);
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
        console.log(`  Line ID: ${l.sysme_id_linea} | Product: ${l.product_id}`);
      });
    } else {
      console.log('✓ Líneas no existen en Supabase (estado limpio)');
    }
    console.log();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 4: PRODUCTO EN SUPABASE ANTES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: beforeProducts, error: beforeProductsError } = await supabase
      .from('products')
      .select('id, name, stock, cost_price, price')
      .eq('id', supabaseProductId);

    if (beforeProductsError) {
      console.error('✗ Error consultando productos:', beforeProductsError);
      process.exit(1);
    }

    console.log(`Producto Supabase ID ${supabaseProductId}:\n`);

    if (beforeProducts && beforeProducts.length > 0) {
      const p = beforeProducts[0];
      console.log(`  ID: ${p.id}`);
      console.log(`  Nombre: ${p.name}`);
      console.log(`  Stock: ${p.stock}`);
      console.log(`  Costo: ${p.cost_price}`);
      console.log(`  Precio: ${p.price}`);
      console.log();
    } else {
      console.log('⚠ ADVERTENCIA: Producto no existe en Supabase');
      console.log('  Esto causará que la sincronización FALLE');
      process.exit(1);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 5: CURSOR STATE');
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
      console.log(`  status: ${state.status}`);
    }
    console.log();

    // Resumen
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ESTADO ANTES (SUMMARY)                  ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`Venta candidata: ID 1`);
    console.log(`Producto Sysme: 00001 → Supabase ${supabaseProductId}`);
    console.log(`Sales existentes: ${beforeSales?.length || 0}`);
    console.log(`Lines existentes: ${beforeLines?.length || 0}`);
    console.log(`Stock ANTES: ${beforeProducts?.[0]?.stock || 'N/A'}`);
    console.log(`Cursor: ${syncState?.[0]?.last_finalized_sale_id || 0}`);
    console.log();

    // Guardar estado para comparar después
    const beforeState = {
      testSaleId: TEST_SALE_ID,
      sysmeProductId: '00001',
      supabaseProductId,
      salesBefore: beforeSales?.length || 0,
      linesBefore: beforeLines?.length || 0,
      stockBefore: beforeProducts?.[0]?.stock || null,
      cursorBefore: syncState?.[0]?.last_finalized_sale_id || 0,
    };

    console.log('✓ Estado capturado\n');
    console.log(JSON.stringify(beforeState, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
    process.exit(1);
  }
}

captureBeforeState();
