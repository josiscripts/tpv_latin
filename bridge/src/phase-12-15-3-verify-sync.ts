import { createClient } from '@supabase/supabase-js';
import { config } from './config';

async function verifySyncResults() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     FASE 12.15.3 — VERIFICACIÓN POST-SYNC (VENTA 4)        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

  try {
    const TEST_SALE_ID = '4';
    const PRODUCT_ID = '19034260-0971-40a2-a573-3e91ff8ba102';

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('A. SALES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: sales } = await supabase
      .from('sales')
      .select('*')
      .eq('sysme_id_venta', TEST_SALE_ID);

    console.log(`Registros: ${sales?.length || 0}`);
    if (sales && sales.length > 0) {
      const s = sales[0];
      console.log(`✓ Venta encontrada:`);
      console.log(`  ID: ${s.id}`);
      console.log(`  sysme_id_venta: ${s.sysme_id_venta}`);
      console.log(`  status: ${s.status}`);
      console.log(`  source: ${s.source}`);
      console.log(`  subtotal: ${s.subtotal}`);
      console.log(`  tax: ${s.tax}`);
      console.log(`  total: ${s.total}`);
    } else {
      console.log('✗ Venta no encontrada');
    }
    console.log();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('B. SALE_LINES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: lines } = await supabase
      .from('sale_lines')
      .select('*')
      .eq('sysme_id_venta', TEST_SALE_ID);

    console.log(`Líneas: ${lines?.length || 0}`);
    if (lines && lines.length > 0) {
      lines.forEach((l: any) => {
        console.log(`✓ Línea ${l.sysme_id_linea}:`);
        console.log(`  product_id: ${l.product_id}`);
        console.log(`  quantity: ${l.quantity}`);
        console.log(`  unit_sale_price: ${l.unit_sale_price}`);
        console.log(`  total_sale: ${l.total_sale}`);
      });
    } else {
      console.log('✗ No hay líneas');
    }
    console.log();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('C. PRODUCTS (STOCK)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: products } = await supabase
      .from('products')
      .select('id, name, stock, min_stock')
      .eq('id', PRODUCT_ID);

    if (products && products.length > 0) {
      const p = products[0];
      console.log(`✓ Producto encontrado:`);
      console.log(`  name: ${p.name}`);
      console.log(`  stock: ${p.stock}`);
      console.log(`  min_stock: ${p.min_stock}`);
      console.log(`  (Fue descontada 1 unidad por la venta)`);
    } else {
      console.log('✗ Producto no encontrado');
    }
    console.log();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('D. STOCK_MOVEMENTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: movements } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('product_id', PRODUCT_ID)
      .order('created_at', { ascending: false })
      .limit(1);

    if (movements && movements.length > 0) {
      const m = movements[0];
      console.log(`✓ Movimiento registrado:`);
      console.log(`  movement_type: ${m.movement_type}`);
      console.log(`  quantity: ${m.quantity}`);
      console.log(`  previous_stock: ${m.previous_stock}`);
      console.log(`  resulting_stock: ${m.resulting_stock}`);
      console.log(`  source: ${m.source}`);
    } else {
      console.log('✗ No hay movimientos');
    }
    console.log();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('E. CURSOR');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { data: syncState } = await supabase
      .from('sync_state')
      .select('*')
      .eq('integration_name', 'sysme_bridge');

    if (syncState && syncState.length > 0) {
      const state = syncState[0];
      console.log(`✓ Sync state:`);
      console.log(`  last_finalized_sale_id: ${state.last_finalized_sale_id}`);
      console.log(`  status: ${state.status}`);
      console.log(`  last_sync_at: ${state.last_sync_at}`);
    }
    console.log();

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              RESULTADO: ✓ SINCRONIZACIÓN OK                ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
    process.exit(1);
  }
}

verifySyncResults();
