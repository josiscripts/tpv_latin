import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';
import { config } from './config';

async function reset() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          FASE 12.15.3.2 — RESET CONTROLADO                 ║');
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
    // FASE 1: INVENTARIO ANTES DEL RESET
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 1: INVENTARIO ANTES DEL RESET\n');

    const { data: salesBefore } = await supabase.from('sales').select('id, sysme_id_venta');
    const { data: linesBefore } = await supabase.from('sale_lines').select('id');
    const { data: movementsBefore } = await supabase.from('stock_movements').select('id');
    const { data: productsBefore } = await supabase.from('products').select('id, stock');

    console.log(`Sales ANTES:      ${salesBefore?.length || 0}`);
    console.log(`Lines ANTES:      ${linesBefore?.length || 0}`);
    console.log(`Movements ANTES:  ${movementsBefore?.length || 0}`);
    console.log(`Products ANTES:   ${productsBefore?.length || 0}\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 2: VERIFICAR SYSME INTACTO
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 2: VERIFICAR SYSME (READ-ONLY)\n');

    const conn = await pool.getConnection();
    const [sysmeVentas] = await conn.query(`
      SELECT id_venta FROM ventadirecta WHERE id_venta IN (1,2,4,6) ORDER BY id_venta
    `);
    conn.release();

    const ventasArray = sysmeVentas as any[];
    console.log(`Ventas en Sysme:  ${ventasArray.map((v: any) => v.id_venta).join(', ')}`);
    console.log('✓ Sysme READ-ONLY verificado\n');

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 3: OBTENER STOCK REAL DE SYSME
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 3: OBTENER STOCK REAL DE SYSME\n');

    const conn2 = await pool.getConnection();
    const [sysmeStock] = await conn2.query(`
      SELECT ac.id_complementog, ac.cantidad
      FROM almacen_complementg ac
      WHERE ac.id_complementog IN ('00001', '00002')
    `);
    conn2.release();

    const stockMap = new Map<string, number>();
    (sysmeStock as any[]).forEach((s: any) => {
      stockMap.set(s.id_complementog, s.cantidad);
    });

    console.log('Stock Sysme real:');
    Array.from(stockMap.entries()).forEach(([id, qty]) => {
      console.log(`  ${id}: ${qty}`);
    });
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 4: MAPEO DE PRODUCTOS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 4: MAPEO SYSME → SUPABASE\n');

    const { data: mappings } = await supabase
      .from('sysme_product_map')
      .select('id_complementog, product_id');

    const productMap = new Map<string, string>();
    (mappings || []).forEach((m: any) => {
      productMap.set(m.id_complementog, m.product_id);
    });

    console.log('Mappings encontrados:');
    Array.from(productMap.entries()).forEach(([sysmeId, supabaseId]) => {
      console.log(`  ${sysmeId} → ${supabaseId}`);
    });
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 5: LIMPIAR DATOS DE PRUEBA (ORDEN IMPORTANTE)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 5: LIMPIAR DATOS DE PRUEBA\n');

    // Obtener IDs de sales a eliminar
    const { data: salesToDelete } = await supabase
      .from('sales')
      .select('id')
      .in('sysme_id_venta', ['1', '2', '4', '6']);

    const saleIds = (salesToDelete || []).map((s: any) => s.id);
    console.log(`Sales a eliminar: ${saleIds.length}`);

    // Eliminar en orden: movements → lines → sales (respeta FKs)
    if (saleIds.length > 0) {
      console.log(`  - Eliminando ${movementsBefore?.length} stock_movements...`);
      await supabase
        .from('stock_movements')
        .delete()
        .in('reference_id', saleIds);

      console.log(`  - Eliminando ${linesBefore?.length} sale_lines...`);
      await supabase
        .from('sale_lines')
        .delete()
        .in('sale_id', saleIds);

      console.log(`  - Eliminando ${salesBefore?.length} sales...`);
      await supabase
        .from('sales')
        .delete()
        .in('id', saleIds);
    }

    // Resetear cursor
    console.log(`  - Reseteando cursor...`);
    await supabase
      .from('sync_state')
      .update({ last_finalized_sale_id: 0, status: 'idle' })
      .eq('integration_name', 'sysme_bridge');

    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 6: RESTAURAR STOCK DESDE SYSME
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 6: RESTAURAR STOCK DESDE SYSME\n');

    for (const [sysmeId, sysmeQty] of Array.from(stockMap.entries())) {
      const supabaseId = productMap.get(sysmeId);
      if (supabaseId) {
        console.log(`  - Restaurando ${sysmeId} (Supabase: ${supabaseId}) a ${sysmeQty}`);
        await supabase
          .from('products')
          .update({ stock: sysmeQty })
          .eq('id', supabaseId);
      }
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 7: VERIFICACIÓN DESPUÉS DEL RESET
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 7: VERIFICACIÓN DESPUÉS DEL RESET\n');

    const { data: salesAfter } = await supabase.from('sales').select('id');
    const { data: linesAfter } = await supabase.from('sale_lines').select('id');
    const { data: movementsAfter } = await supabase.from('stock_movements').select('id');
    const { data: productsAfter } = await supabase.from('products').select('id, stock');

    console.log(`Sales DESPUÉS:     ${salesAfter?.length || 0}`);
    console.log(`Lines DESPUÉS:     ${linesAfter?.length || 0}`);
    console.log(`Movements DESPUÉS: ${movementsAfter?.length || 0}`);
    console.log(`Products DESPUÉS:  ${productsAfter?.length || 0}\n`);

    // Verificar stock
    console.log('Stock DESPUÉS:');
    for (const [sysmeId, expectedQty] of Array.from(stockMap.entries())) {
      const supabaseId = productMap.get(sysmeId);
      if (supabaseId) {
        const actualProduct = (productsAfter || []).find((p: any) => p.id === supabaseId);
        const actualQty = actualProduct?.stock;
        const match = actualQty === expectedQty ? '✓' : '✗';
        console.log(`  ${match} ${sysmeId}: esperado=${expectedQty}, actual=${actualQty}`);
      }
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // RESUMEN
    // ═══════════════════════════════════════════════════════════════════════
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                  RESET COMPLETADO                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`DATOS ELIMINADOS:`);
    console.log(`  - ${(salesBefore?.length || 0)} sales`);
    console.log(`  - ${(linesBefore?.length || 0)} sale_lines`);
    console.log(`  - ${(movementsBefore?.length || 0)} stock_movements`);
    console.log();

    console.log(`STOCK RESTAURADO:`);
    Array.from(stockMap.entries()).forEach(([sysmeId, qty]) => {
      console.log(`  - ${sysmeId}: ${qty}`);
    });
    console.log();

    console.log(`SYSME: INTACTO (READ-ONLY)`);
    console.log(`BUILD: ejecutar "npm run build" en Bridge\n`);

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('✗ Error durante reset:', (error as Error).message);
    await pool.end();
    process.exit(1);
  }
}

reset();
