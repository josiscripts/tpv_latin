import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';
import { config } from './config';

async function fullSync() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     FASE 12.16 — SINCRONIZACIÓN COMPLETA                    ║');
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
    // 1. OBTENER CURSOR ACTUAL
    // ═══════════════════════════════════════════════════════════════════════
    const { data: syncState } = await supabase
      .from('sync_state')
      .select('*')
      .eq('integration_name', 'sysme_bridge');

    const cursor = (syncState?.[0]?.last_finalized_sale_id) || 0;
    console.log(`Cursor actual: ${cursor}\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // 2. OBTENER VENTAS CERRADAS PENDIENTES DE SYSME
    // ═══════════════════════════════════════════════════════════════════════
    const conn = await pool.getConnection();
    const [ventasRows] = await conn.query(`
      SELECT DISTINCT vd.id_venta
      FROM ventadirecta vd
      WHERE vd.cerrada = 'S' AND vd.id_venta > ?
      ORDER BY vd.id_venta
    `, [cursor]);

    const ventaIds = (ventasRows as any[]).map((v: any) => v.id_venta);
    console.log(`Ventas cerradas pendientes: ${ventaIds.join(', ') || 'NINGUNA'}\n`);

    if (ventaIds.length === 0) {
      console.log('✓ No hay ventas pendientes de sincronizar\n');
      await pool.end();
      process.exit(0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. OBTENER MAPEO DE PRODUCTOS
    // ═══════════════════════════════════════════════════════════════════════
    const { data: mappings } = await supabase
      .from('sysme_product_map')
      .select('id_complementog, product_id');

    const productMap = new Map<string, string>();
    (mappings || []).forEach((m: any) => {
      productMap.set(m.id_complementog, m.product_id);
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 4. SINCRONIZAR CADA VENTA
    // ═══════════════════════════════════════════════════════════════════════
    const syncResults: Array<{
      ventaId: number;
      success: boolean;
      message: string;
    }> = [];

    for (const ventaId of ventaIds) {
      console.log(`\nSincronizando venta ${ventaId}...`);

      try {
        // Obtener datos de la venta
        const [ventaData] = await conn.query(`
          SELECT vd.id_venta, vd.serie, vd.id_tiquet, vd.fecha_venta
          FROM ventadirecta vd
          WHERE vd.id_venta = ?
        `, [ventaId]);

        const venta = (ventaData as any[])[0];
        if (!venta) {
          throw new Error(`Venta ${ventaId} no encontrada`);
        }

        // Obtener líneas
        const [lineasData] = await conn.query(`
          SELECT id_linea, id_complementog, cantidad, PVPTiquet, precio_compra, avgiva
          FROM ventadir_comg
          WHERE id_venta = ?
        `, [ventaId]);

        const lineas = (lineasData as any[]);
        if (lineas.length === 0) {
          throw new Error(`Venta ${ventaId} sin líneas`);
        }

        // Construir payload
        const subtotal = lineas.reduce((sum: number, l: any) => sum + (l.cantidad * l.PVPTiquet * (1 - 0.21)), 0);
        const tax = lineas.reduce((sum: number, l: any) => sum + (l.cantidad * l.PVPTiquet * 0.21), 0);
        const total = lineas.reduce((sum: number, l: any) => sum + (l.cantidad * l.PVPTiquet), 0);

        const payload = {
          sysme_id_venta: String(ventaId),
          sysme_serie: venta.serie || 'A',
          sysme_id_tiquet: venta.id_tiquet || '0001',
          sale_date: venta.fecha_venta || new Date().toISOString().split('T')[0],
          subtotal,
          tax,
          total,
          lineas: lineas.map((l: any) => ({
            sysme_id_venta: String(ventaId),
            sysme_id_linea: String(l.id_linea),
            product_id: productMap.get(l.id_complementog),
            cantidad: l.cantidad,
            PVPTiquet: l.PVPTiquet,
            precio_compra: l.precio_compra,
            total: l.cantidad * l.PVPTiquet,
            avgiva: l.avgiva,
          })),
        };

        // Enviar a Edge Function
        const response = await fetch(`${config.supabase.url}/functions/v1/sysme-bridge-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.supabase.serviceKey}`,
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json() as any;

        if (result.success) {
          console.log(`  ✓ Venta ${ventaId} sincronizada (${lineas.length} líneas)`);
          syncResults.push({
            ventaId,
            success: true,
            message: `Sincronizada (${lineas.length} líneas)`,
          });
        } else {
          console.log(`  ✗ Error: ${result.error}`);
          syncResults.push({
            ventaId,
            success: false,
            message: result.error || 'Error desconocido',
          });
        }
      } catch (error) {
        console.log(`  ✗ Error: ${(error as Error).message}`);
        syncResults.push({
          ventaId,
          success: false,
          message: (error as Error).message,
        });
      }
    }

    conn.release();

    // ═══════════════════════════════════════════════════════════════════════
    // 5. RESUMEN
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                   RESUMEN DE SINCRONIZACIÓN                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const successful = syncResults.filter((r) => r.success);
    const failed = syncResults.filter((r) => !r.success);

    console.log(`Intentadas:  ${syncResults.length}`);
    console.log(`Exitosas:    ${successful.length}`);
    console.log(`Fallidas:    ${failed.length}\n`);

    if (failed.length > 0) {
      console.log('Fallidas:');
      failed.forEach((r) => {
        console.log(`  - Venta ${r.ventaId}: ${r.message}`);
      });
      console.log();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. OBTENER NUEVO CURSOR
    // ═══════════════════════════════════════════════════════════════════════
    const { data: newSyncState } = await supabase
      .from('sync_state')
      .select('last_finalized_sale_id')
      .eq('integration_name', 'sysme_bridge');

    const newCursor = newSyncState?.[0]?.last_finalized_sale_id || cursor;
    console.log(`Cursor nuevo: ${newCursor}\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // 7. VENTAS TOTALES EN SUPABASE
    // ═══════════════════════════════════════════════════════════════════════
    const { data: allSales } = await supabase
      .from('sales')
      .select('sysme_id_venta')
      .order('sysme_id_venta', { ascending: true });

    console.log(`Total ventas en Supabase: ${allSales?.length || 0}`);
    if (allSales) {
      console.log(`  IDs: ${allSales.map((s: any) => s.sysme_id_venta).join(', ')}\n`);
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Error:', (error as Error).message);
    await pool.end();
    process.exit(1);
  }
}

fullSync();
