import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';
import { config } from './config';

async function validate() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     FASE 12.16 — VALIDACIÓN DE DATOS                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);
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

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // 1. VENTAS EN SYSME vs SUPABASE
    // ═══════════════════════════════════════════════════════════════════════
    console.log('1. VENTAS EN SYSME vs SUPABASE\n');

    const conn = await pool.getConnection();
    const [sysmeVentas] = await conn.query(`
      SELECT id_venta FROM ventadirecta WHERE cerrada = 'S' ORDER BY id_venta
    `);

    const sysmeIds = (sysmeVentas as any[]).map((v: any) => v.id_venta);
    console.log(`Sysme (cerradas): ${sysmeIds.join(', ')}`);

    const { data: supaSales } = await supabase
      .from('sales')
      .select('sysme_id_venta')
      .order('sysme_id_venta', { ascending: true });

    const supaIds = (supaSales || []).map((s: any) => s.sysme_id_venta);
    console.log(`Supabase:        ${supaIds.join(', ')}\n`);

    const missing = sysmeIds.filter((id) => !supaIds.includes(String(id)));
    if (missing.length > 0) {
      console.log(`⚠ Ventas sin sincronizar: ${missing.join(', ')}`);
      console.log('(Posiblemente fuera del cursor)\n');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. SALES SIN DUPLICADOS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('2. SALES SIN DUPLICADOS\n');

    const { data: allSales } = await supabase
      .from('sales')
      .select('id, sysme_id_venta');

    const duplicates = new Map<string, number>();
    (allSales || []).forEach((s: any) => {
      duplicates.set(s.sysme_id_venta, (duplicates.get(s.sysme_id_venta) || 0) + 1);
    });

    let hasDuplicates = false;
    duplicates.forEach((count, ventaId) => {
      if (count > 1) {
        console.log(`  ✗ Venta ${ventaId}: ${count} registros`);
        hasDuplicates = true;
      }
    });

    if (!hasDuplicates) {
      console.log('  ✓ Sin duplicados\n');
    } else {
      console.log();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. SALE_LINES POR VENTA
    // ═══════════════════════════════════════════════════════════════════════
    console.log('3. SALE_LINES Y COMPARACIÓN CON SYSME\n');

    let linesDuplicated = false;
    for (const ventaId of supaIds) {
      // Líneas en Sysme
      const [sysmeLines] = await conn.query(`
        SELECT id_linea, id_complementog, cantidad FROM ventadir_comg WHERE id_venta = ?
      `, [parseInt(ventaId)]);

      const sysmeLineCount = (sysmeLines as any[]).length;

      // Líneas en Supabase
      const { data: supaLines } = await supabase
        .from('sale_lines')
        .select('*')
        .eq('sysme_id_venta', ventaId);

      const supaLineCount = (supaLines || []).length;

      if (sysmeLineCount === supaLineCount) {
        console.log(`  ✓ Venta ${ventaId}: ${supaLineCount} línea(s) OK`);
      } else {
        console.log(`  ✗ Venta ${ventaId}: Sysme=${sysmeLineCount}, Supabase=${supaLineCount}`);
        linesDuplicated = true;
      }
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // 4. STOCK AFECTADO
    // ═══════════════════════════════════════════════════════════════════════
    console.log('4. STOCK AFECTADO\n');

    const { data: movements } = await supabase
      .from('stock_movements')
      .select('product_id, quantity, reference_id')
      .eq('movement_type', 'sale');

    const affectedProducts = new Set((movements || []).map((m: any) => m.product_id));
    console.log(`Productos afectados: ${affectedProducts.size}`);

    const { data: products } = await supabase
      .from('products')
      .select('id, name, stock')
      .in('id', Array.from(affectedProducts));

    (products || []).forEach((p: any) => {
      const totalQty = (movements || [])
        .filter((m: any) => m.product_id === p.id)
        .reduce((sum: number, m: any) => sum + Math.abs(m.quantity), 0);

      console.log(`  ${p.name}: stock=${p.stock} (descuentos totales: ${totalQty})`);
    });
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // 5. STOCK_MOVEMENTS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('5. STOCK_MOVEMENTS\n');

    const movementsByRef = new Map<string, number>();
    (movements || []).forEach((m: any) => {
      const key = m.reference_id;
      movementsByRef.set(key, (movementsByRef.get(key) || 0) + 1);
    });

    console.log(`Total movimientos: ${movements?.length || 0}`);
    console.log(`Total referencias: ${movementsByRef.size}`);

    let movementsDuplicated = false;
    movementsByRef.forEach((count, refId) => {
      const sales = (allSales || []).find((s: any) => s.id === refId);
      const ventaId = sales?.sysme_id_venta || refId;

      if (count > 1) {
        console.log(`  ⚠ Venta ${ventaId}: ${count} movimientos`);
        movementsDuplicated = true;
      }
    });

    if (!movementsDuplicated && movementsByRef.size > 0) {
      console.log('  ✓ Sin duplicados\n');
    } else {
      console.log();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. SYNC_STATE
    // ═══════════════════════════════════════════════════════════════════════
    console.log('6. SYNC_STATE\n');

    const { data: syncState } = await supabase
      .from('sync_state')
      .select('*')
      .eq('integration_name', 'sysme_bridge');

    if (syncState && syncState.length > 0) {
      const state = syncState[0];
      console.log(`  Cursor:    ${state.last_finalized_sale_id}`);
      console.log(`  Status:    ${state.status}`);
      console.log(`  Last sync: ${state.last_sync_at}\n`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 7. RESUMEN
    // ═══════════════════════════════════════════════════════════════════════
    console.log('╔════════════════════════════════════════════════════════════╗');

    const dataOk =
      supaIds.length > 0 &&
      !hasDuplicates &&
      !linesDuplicated &&
      !movementsDuplicated;

    if (dataOk) {
      console.log('║        ✓ DATOS VALIDADOS - OK                             ║');
    } else {
      console.log('║        ✗ PROBLEMAS DETECTADOS - REVISAR ARRIBA            ║');
    }
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    conn.release();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Error:', (error as Error).message);
    await pool.end();
    process.exit(1);
  }
}

validate();
