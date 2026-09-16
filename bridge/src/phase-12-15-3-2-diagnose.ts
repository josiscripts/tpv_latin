import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';
import { config } from './config';

async function diagnose() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     FASE 12.15.3.2 — DIAGNÓSTICO ANTES DE REPARACIÓN      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // 1. ESTRUCTURA DE STOCK_MOVEMENTS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('1. ESTRUCTURA DE STOCK_MOVEMENTS');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const { data: sampleMovement } = await supabase
      .from('stock_movements')
      .select('*')
      .limit(1);

    if (sampleMovement && sampleMovement.length > 0) {
      console.log('Columnas disponibles en stock_movements:\n');
      Object.keys(sampleMovement[0]).forEach(col => {
        console.log(`  - ${col}`);
      });
      console.log();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. MOVIMIENTOS PARA VENTAS SYSME 1,2,4,6
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('2. MOVIMIENTOS PARA VENTAS 1,2,4,6');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    for (const ventaId of ['1', '2', '4', '6']) {
      // Obtener sale_id para esta venta
      const { data: sales } = await supabase
        .from('sales')
        .select('id')
        .eq('sysme_id_venta', ventaId);

      if (sales && sales.length > 0) {
        const saleId = sales[0].id;

        // Obtener movimientos para esta sale
        const { data: movements } = await supabase
          .from('stock_movements')
          .select('*')
          .eq('reference_id', saleId)
          .order('created_at', { ascending: true });

        console.log(`Venta Sysme ${ventaId} (sale_id: ${saleId}):`);
        console.log(`  Movimientos: ${movements?.length || 0}\n`);

        if (movements && movements.length > 0) {
          movements.forEach((m: any, i: number) => {
            console.log(`  Movimiento ${i + 1}:`);
            console.log(`    product_id: ${m.product_id}`);
            console.log(`    reference_id: ${m.reference_id}`);
            console.log(`    quantity: ${m.quantity}`);
            console.log(`    movement_type: ${m.movement_type}`);
            console.log(`    source: ${m.source}`);
            console.log(`    created_at: ${m.created_at}`);
            console.log(`    reason: ${m.reason}`);

            // Buscar campos que identifiquen la venta Sysme
            if ('sysme_id_venta' in m) console.log(`    sysme_id_venta: ${m.sysme_id_venta}`);
            if ('sysme_id_linea' in m) console.log(`    sysme_id_linea: ${m.sysme_id_linea}`);
            console.log();
          });
        }
      } else {
        console.log(`Venta Sysme ${ventaId}: NO existe en Supabase\n`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. STOCK ACTUAL DE PRODUCTOS AFECTADOS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('3. STOCK ACTUAL DE PRODUCTOS AFECTADOS');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const { data: products } = await supabase
      .from('products')
      .select('id, name, stock')
      .in('id', [
        '19034260-0971-40a2-a573-3e91ff8ba102', // producto 00001
        '33dae649-b268-46f5-9749-e059ab7d2ba5'  // producto 00002
      ]);

    if (products) {
      products.forEach(p => {
        console.log(`Producto ${p.id}:`);
        console.log(`  Nombre: ${p.name}`);
        console.log(`  Stock actual: ${p.stock}\n`);
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. SYSME - VENTAS Y CANTIDADES
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('4. VENTAS EN SYSME (READ-ONLY)');
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
    const [ventas] = await conn.query(`
      SELECT id_venta, cerrada
      FROM ventadirecta
      WHERE id_venta IN (1,2,4,6)
      ORDER BY id_venta
    `);

    const ventasArray = ventas as any[];
    for (const venta of ventasArray) {
      const [lineas] = await conn.query(`
        SELECT id_linea, id_complementog, cantidad
        FROM ventadir_comg
        WHERE id_venta = ?
      `, [venta.id_venta]);

      const lineasArray = lineas as any[];
      console.log(`Venta Sysme ${venta.id_venta} (cerrada: ${venta.cerrada}):`);
      console.log(`  Líneas: ${lineasArray.length}`);
      lineasArray.forEach((l: any) => {
        console.log(`    - Línea ${l.id_linea}: Producto ${l.id_complementog}, Qty ${l.cantidad}`);
      });
      console.log();
    }

    conn.release();

    // ═══════════════════════════════════════════════════════════════════════
    // 5. CLAVE DE IDEMPOTENCIA
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('5. PROPUESTA DE CLAVE DE IDEMPOTENCIA');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    console.log('Para identificar si un movimiento ya fue procesado:\n');
    console.log('Opción 1: reference_id + product_id + movement_type');
    console.log('  Ventaja: Usa campos existentes');
    console.log('  Riesgo: ¿Pueden existir múltiples movimientos del mismo tipo para mismo producto/sale?\n');

    console.log('Opción 2: Guardar signature (sysme_id_venta + sysme_id_linea + product_id)');
    console.log('  Ventaja: Identificación completa de la línea Sysme');
    console.log('  Riesgo: Necesita migración si campos no existen en stock_movements\n');

    // ═══════════════════════════════════════════════════════════════════════
    // 6. SYNC_STATE
    // ═══════════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('6. SYNC_STATE');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    const { data: syncState } = await supabase
      .from('sync_state')
      .select('*')
      .eq('integration_name', 'sysme_bridge');

    if (syncState && syncState.length > 0) {
      const state = syncState[0];
      console.log(`Cursor: ${state.last_finalized_sale_id}`);
      console.log(`Status: ${state.status}`);
      console.log(`Last sync: ${state.last_sync_at}\n`);
    }

    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log('DIAGNÓSTICO COMPLETADO - ESPERANDO ANÁLISIS');
    console.log('═══════════════════════════════════════════════════════════════════════\n');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
    process.exit(1);
  }
}

diagnose();
