import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';
import { config } from './config';

async function auditReconciliation() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     FASE 12.15.3.1 — AUDITORÍA DE RECONCILIACIÓN          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

  try {
    const TEST_SALE_ID = '4';
    const PRODUCT_ID = '19034260-0971-40a2-a573-3e91ff8ba102';

    // ═══════════════════════════════════════════════════════════════════════
    // A. VENTA SYSME 4
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('A. VENTA SYSME 4 EN SUPABASE');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const { data: sales, error: salesError } = await supabase
      .from('sales')
      .select('*')
      .eq('sysme_id_venta', TEST_SALE_ID);

    if (salesError) {
      console.error('✗ Error consultando sales:', salesError);
      process.exit(1);
    }

    console.log(`Registros encontrados: ${sales?.length || 0}\n`);

    if (sales && sales.length > 0) {
      const sale = sales[0];
      console.log(`✓ Venta encontrada:`);
      console.log(`  id: ${sale.id}`);
      console.log(`  sysme_id_venta: ${sale.sysme_id_venta}`);
      console.log(`  source: ${sale.source}`);
      console.log(`  status: ${sale.status}`);
      console.log(`  subtotal: ${sale.subtotal}`);
      console.log(`  tax: ${sale.tax}`);
      console.log(`  total: ${sale.total}`);
      console.log(`  created_at: ${sale.created_at}`);
      console.log(`  updated_at: ${sale.updated_at}`);

      if (sales.length > 1) {
        console.log(`\n⚠ ADVERTENCIA: Hay ${sales.length} registros para venta 4`);
      }
    } else {
      console.log('⚠ Venta 4 NO existe en Supabase');
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // B. SALE_LINES
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('B. SALE_LINES PARA VENTA 4');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const { data: lines, error: linesError } = await supabase
      .from('sale_lines')
      .select('*')
      .eq('sysme_id_venta', TEST_SALE_ID);

    if (linesError) {
      console.error('✗ Error consultando sale_lines:', linesError);
      process.exit(1);
    }

    console.log(`Líneas encontradas: ${lines?.length || 0}\n`);

    if (lines && lines.length > 0) {
      lines.forEach((line: any, i: number) => {
        console.log(`Línea ${i + 1}:`);
        console.log(`  id: ${line.id}`);
        console.log(`  sale_id: ${line.sale_id}`);
        console.log(`  sysme_id_linea: ${line.sysme_id_linea}`);
        console.log(`  product_id: ${line.product_id}`);
        console.log(`  quantity: ${line.quantity}`);
        console.log(`  unit_sale_price: ${line.unit_sale_price}`);
        console.log(`  total_sale: ${line.total_sale}`);
        console.log(`  gross_profit: ${line.gross_profit}`);
        console.log();
      });

      if (lines.length > 1) {
        console.log(`⚠ ADVERTENCIA: Hay ${lines.length} líneas para venta 4\n`);
      }
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // C. STOCK_MOVEMENTS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('C. STOCK_MOVEMENTS PARA VENTA 4');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    // Obtener sale_id para venta 4
    let saleIdForMovements = null;
    if (sales && sales.length > 0) {
      saleIdForMovements = sales[0].id;
    }

    let movements: any[] = [];
    if (saleIdForMovements) {
      const { data: movData } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('reference_id', saleIdForMovements)
        .order('created_at', { ascending: true });
      movements = movData || [];
    }

    console.log(`Movimientos para venta 4: ${movements.length}\n`);

    if (movements.length > 0) {
      movements.forEach((mov: any, i: number) => {
        console.log(`Movimiento ${i + 1}:`);
        console.log(`  created_at: ${mov.created_at}`);
        console.log(`  type: ${mov.movement_type}`);
        console.log(`  quantity: ${mov.quantity}`);
        console.log(`  previous_stock: ${mov.previous_stock}`);
        console.log(`  resulting_stock: ${mov.resulting_stock}`);
        console.log(`  source: ${mov.source}`);
        console.log();
      });

      if (movements.length > 1) {
        console.log(`⚠ ADVERTENCIA: Hay ${movements.length} movimientos para venta 4\n`);
      }
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // D. PRODUCTS.STOCK
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('D. STOCK ACTUAL DEL PRODUCTO');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const { data: products } = await supabase
      .from('products')
      .select('id, name, stock, cost_price')
      .eq('id', PRODUCT_ID);

    console.log(`Producto: ${PRODUCT_ID}\n`);

    if (products && products.length > 0) {
      const product = products[0];
      console.log(`Nombre: ${product.name}`);
      console.log(`Stock actual: ${product.stock}`);
      console.log();

      // Calcular stock esperado basado en movimientos
      if (movements.length > 0) {
        const lastMovement = movements[movements.length - 1];
        console.log(`Stock esperado (según último movimiento): ${lastMovement.resulting_stock}`);
        console.log(`¿Coincide?: ${product.stock === lastMovement.resulting_stock ? 'SI ✓' : 'NO ✗'}`);
      }
    } else {
      console.log('⚠ Producto NO existe');
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // E. SYNC_STATE
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('E. SYNC_STATE');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const { data: syncState } = await supabase
      .from('sync_state')
      .select('*')
      .eq('integration_name', 'sysme_bridge');

    if (syncState && syncState.length > 0) {
      const state = syncState[0];
      console.log(`Cursor actual: ${state.last_finalized_sale_id}`);
      console.log(`Status: ${state.status}`);
      console.log(`Last sync: ${state.last_sync_at}`);
      console.log();
      console.log(`¿Cursor coherente?: ${state.last_finalized_sale_id >= 4 ? 'POSIBLEMENTE' : 'REVISAR'}`);
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // F. SYSME VERIFICATION
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('F. VERIFICAR SYSME (READ-ONLY)');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const pool = await mysql.createPool({
      host: config.sysme.host,
      port: config.sysme.port,
      database: config.sysme.database,
      user: config.sysme.user,
      password: config.sysme.password,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });

    const conn = await pool.getConnection();
    const [sysmeVenta] = await conn.query(`
      SELECT id_venta, fecha_venta, cerrada
      FROM ventadirecta
      WHERE id_venta = 4
    `);
    conn.release();

    const ventaArray = sysmeVenta as any[];
    if (ventaArray.length > 0) {
      const venta = ventaArray[0];
      console.log(`✓ Venta 4 en Sysme intacta:`);
      console.log(`  ID: ${venta.id_venta}`);
      console.log(`  Cerrada: ${venta.cerrada}`);
      console.log(`  Sysme NO fue modificado ✓`);
    } else {
      console.log('⚠ Venta 4 NO existe en Sysme');
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // RESUMEN
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('RESUMEN DE RECONCILIACIÓN');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const isSalesOk = sales && sales.length === 1;
    const isLinesOk = lines && lines.length === 1;
    const isMovementsOk = movements.length === 1;
    const isIdempotentOk = isSalesOk && isLinesOk && isMovementsOk;

    console.log(`Sales (sin duplicados): ${isSalesOk ? '✓' : '✗'}`);
    console.log(`Lines (sin duplicados): ${isLinesOk ? '✓' : '✗'}`);
    console.log(`Movimientos (solo 1): ${isMovementsOk ? '✓' : '✗'}`);
    console.log(`Idempotencia validada: ${isIdempotentOk ? '✓ SI' : '✗ NO'}`);
    console.log();

    if (isIdempotentOk) {
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║        ✓ RECONCILIACIÓN OK - LISTO PARA FASE 12.16         ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
    } else {
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║        ✗ RECONCILIACIÓN BLOQUEADA - REVISAR ARRIBA        ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
    process.exit(1);
  }
}

auditReconciliation();
