import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';
import { config } from './config';

async function testFinalIdempotence() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     FASE 12.16 — TEST IDEMPOTENCIA FINAL (VENTA 4)          ║');
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
    // 1. DATOS ANTES
    // ═══════════════════════════════════════════════════════════════════════
    console.log('1. DATOS ANTES DE REINTENTO\n');

    const { data: salesBefore } = await supabase
      .from('sales')
      .select('id')
      .eq('sysme_id_venta', '4');

    const { data: linesBefore } = await supabase
      .from('sale_lines')
      .select('id')
      .eq('sale_id', salesBefore?.[0]?.id || '');

    const { data: movementsBefore } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('reference_id', salesBefore?.[0]?.id || '');

    const { data: productBefore } = await supabase
      .from('products')
      .select('stock')
      .eq('id', '19034260-0971-40a2-a573-3e91ff8ba102');

    console.log(`Sales: ${salesBefore?.length || 0}`);
    console.log(`Lines: ${linesBefore?.length || 0}`);
    console.log(`Movements: ${movementsBefore?.length || 0}`);
    console.log(`Stock producto: ${productBefore?.[0]?.stock || 'N/A'}\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // 2. REINTENTO DE SINCRONIZACIÓN
    // ═══════════════════════════════════════════════════════════════════════
    console.log('2. REINTENTANDO SINCRONIZACIÓN DE VENTA 4\n');

    const conn = await pool.getConnection();
    const [ventaData] = await conn.query(`
      SELECT vd.id_venta, vd.serie, vd.id_tiquet, vd.fecha_venta
      FROM ventadirecta vd WHERE vd.id_venta = 4
    `);

    const venta = (ventaData as any[])[0];
    const [lineasData] = await conn.query(`
      SELECT id_linea, id_complementog, cantidad, PVPTiquet, precio_compra, avgiva
      FROM ventadir_comg WHERE id_venta = 4
    `);

    const lineas = lineasData as any[];

    // Mapeo
    const { data: mappings } = await supabase
      .from('sysme_product_map')
      .select('id_complementog, product_id');

    const productMap = new Map<string, string>();
    (mappings || []).forEach((m: any) => {
      productMap.set(m.id_complementog, m.product_id);
    });

    const payload = {
      sysme_id_venta: '4',
      sysme_serie: venta.serie || 'A',
      sysme_id_tiquet: venta.id_tiquet || '0001',
      sale_date: venta.fecha_venta,
      subtotal: lineas.reduce((sum: number, l: any) => sum + (l.cantidad * l.PVPTiquet * (1 - 0.21)), 0),
      tax: lineas.reduce((sum: number, l: any) => sum + (l.cantidad * l.PVPTiquet * 0.21), 0),
      total: lineas.reduce((sum: number, l: any) => sum + (l.cantidad * l.PVPTiquet), 0),
      lineas: lineas.map((l: any) => ({
        sysme_id_venta: '4',
        sysme_id_linea: String(l.id_linea),
        product_id: productMap.get(l.id_complementog),
        cantidad: l.cantidad,
        PVPTiquet: l.PVPTiquet,
        precio_compra: l.precio_compra,
        total: l.cantidad * l.PVPTiquet,
        avgiva: l.avgiva,
      })),
    };

    const response = await fetch(`${config.supabase.url}/functions/v1/sysme-bridge-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.supabase.serviceKey}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json() as any;
    console.log(`Response: ${response.status} ${response.statusText}`);
    console.log(`Success: ${result.success}\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // 3. DATOS DESPUÉS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('3. DATOS DESPUÉS DE REINTENTO\n');

    const { data: salesAfter } = await supabase
      .from('sales')
      .select('id')
      .eq('sysme_id_venta', '4');

    const { data: linesAfter } = await supabase
      .from('sale_lines')
      .select('id')
      .eq('sale_id', salesAfter?.[0]?.id || '');

    const { data: movementsAfter } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('reference_id', salesAfter?.[0]?.id || '');

    const { data: productAfter } = await supabase
      .from('products')
      .select('stock')
      .eq('id', '19034260-0971-40a2-a573-3e91ff8ba102');

    console.log(`Sales: ${salesAfter?.length || 0}`);
    console.log(`Lines: ${linesAfter?.length || 0}`);
    console.log(`Movements: ${movementsAfter?.length || 0}`);
    console.log(`Stock producto: ${productAfter?.[0]?.stock || 'N/A'}\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // 4. VALIDACIÓN
    // ═══════════════════════════════════════════════════════════════════════
    console.log('4. VALIDACIÓN DE IDEMPOTENCIA\n');

    const checks = {
      'Sales sin duplicado': salesBefore?.length === salesAfter?.length && salesBefore?.length === 1,
      'Lines sin cambio': linesBefore?.length === linesAfter?.length && linesBefore?.length === 1,
      'Movements sin duplicado': movementsBefore?.length === movementsAfter?.length,
      'Stock sin descuento': productBefore?.[0]?.stock === productAfter?.[0]?.stock,
    };

    Object.entries(checks).forEach(([check, pass]) => {
      console.log(`  ${pass ? '✓' : '✗'} ${check}`);
    });
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // RESUMEN
    // ═══════════════════════════════════════════════════════════════════════
    console.log('╔════════════════════════════════════════════════════════════╗');

    const allPass = Object.values(checks).every((v) => v);

    if (allPass) {
      console.log('║      ✓ IDEMPOTENCIA VALIDADA - TODO CORRECTO               ║');
    } else {
      console.log('║      ✗ PROBLEMAS DETECTADOS - REVISAR ARRIBA              ║');
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

testFinalIdempotence();
