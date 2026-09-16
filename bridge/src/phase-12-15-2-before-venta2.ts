import { createClient } from '@supabase/supabase-js';
import { config } from './config';

async function captureBeforeState() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║      FASE 12.15.2 — ESTADO SUPABASE ANTES (VENTA 2)      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    const supabase = createClient(config.supabase.url, config.supabase.serviceKey);
    const TEST_SALE_ID = 2; // Cambiar a venta 2

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('VENTA CANDIDATA: ID 2');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('De Sysme:');
    console.log('  Producto: 00002 (Product 2)');
    console.log('  Cantidad: 1');
    console.log('  Precio: 1.00');
    console.log('  Total: 1.00');
    console.log();

    // STEP 1: Verificar mapping para 00002
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 1: MAPPING PARA PRODUCTO 00002');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: mapping, error: mappingError } = await supabase
      .from('sysme_product_map')
      .select('*')
      .eq('id_complementog', '00002');

    if (mappingError) {
      console.error('✗ Error:', mappingError);
      process.exit(1);
    }

    if (!mapping || mapping.length === 0) {
      console.log('⚠ NO existe mapping para producto 00002');
      console.log('  La sincronización fallará sin mapping');
      process.exit(1);
    }

    const m = mapping[0];
    console.log(`✓ Mapping encontrado`);
    console.log(`  Sysme 00002 → Supabase ${m.product_id}`);
    console.log();

    // STEP 2: Venta en Supabase
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 2: VENTA EN SUPABASE ANTES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: beforeSales, error: salesError } = await supabase
      .from('sales')
      .select('*')
      .eq('sysme_id_venta', TEST_SALE_ID);

    if (salesError) {
      console.error('✗ Error:', salesError);
      process.exit(1);
    }

    if (beforeSales && beforeSales.length > 0) {
      console.log('⚠ ADVERTENCIA: Venta ya existe en Supabase');
      console.log('  No es seguro sincronizar (INSERT fallará)');
      process.exit(1);
    }

    console.log(`✓ Venta ${TEST_SALE_ID} no existe (estado limpio)`);
    console.log();

    // STEP 3: Líneas
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 3: LÍNEAS ANTES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: beforeLines, error: linesError } = await supabase
      .from('sale_lines')
      .select('*')
      .eq('sysme_id_venta', TEST_SALE_ID);

    if (linesError) {
      console.error('✗ Error:', linesError);
      process.exit(1);
    }

    console.log(`✓ Sale_lines: ${beforeLines?.length || 0} (limpio)`);
    console.log();

    // STEP 4: Producto
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 4: PRODUCTO ANTES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: productBefore, error: prodError } = await supabase
      .from('products')
      .select('id, name, stock, cost_price, price')
      .eq('id', m.product_id);

    if (prodError) {
      console.error('✗ Error:', prodError);
      process.exit(1);
    }

    if (!productBefore || productBefore.length === 0) {
      console.log('⚠ Producto no existe en Supabase');
      process.exit(1);
    }

    const p = productBefore[0];
    console.log(`✓ Producto encontrado`);
    console.log(`  ID: ${p.id}`);
    console.log(`  Nombre: ${p.name}`);
    console.log(`  Stock ANTES: ${p.stock}`);
    console.log();

    // STEP 5: Cursor
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 5: CURSOR ANTES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: syncState } = await supabase
      .from('sync_state')
      .select('*')
      .limit(1);

    const cursorBefore = syncState?.[0]?.last_finalized_sale_id || 0;
    console.log(`Cursor ANTES: ${cursorBefore}\n`);

    // RESUMEN
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ESTADO ANTES                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`Venta candidata:        2`);
    console.log(`Producto Sysme:         00002 → ${m.product_id}`);
    console.log(`Sales existentes:       0`);
    console.log(`Lines existentes:       0`);
    console.log(`Stock ANTES:            ${p.stock}`);
    console.log(`Cursor ANTES:           ${cursorBefore}`);
    console.log();

    console.log('✓ Estado capturado - LISTO PARA SINCRONIZAR\n');

    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
    process.exit(1);
  }
}

captureBeforeState();
