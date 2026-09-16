import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';
import { config } from './config';

async function testIdempotence() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          FASE 12.15.3.2 — TEST DE IDEMPOTENCIA             ║');
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
    // FASE 1: OBTENER DATOS DE VENTA SYSME 4
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 1: OBTENER DATOS DE VENTA SYSME 4 DESDE SYSME\n');

    const conn = await pool.getConnection();
    const [ventaRows] = await conn.query(`
      SELECT vd.id_venta, vd.fecha_venta, vd.cerrada, SUM(vc.cantidad) as total_cantidad
      FROM ventadirecta vd
      LEFT JOIN ventadir_comg vc ON vd.id_venta = vc.id_venta
      WHERE vd.id_venta = 4
      GROUP BY vd.id_venta
    `);

    const venta = (ventaRows as any[])[0];
    if (!venta) {
      console.log('✗ Venta 4 no existe en Sysme');
      process.exit(1);
    }

    console.log(`✓ Venta 4 en Sysme:`);
    console.log(`  ID: ${venta.id_venta}`);
    console.log(`  Cerrada: ${venta.cerrada}`);
    console.log(`  Cantidad total: ${venta.total_cantidad}\n`);

    // Obtener líneas
    const [lineasRows] = await conn.query(`
      SELECT id_linea, id_complementog, cantidad, PVPTiquet, precio_compra, avgiva
      FROM ventadir_comg
      WHERE id_venta = 4
    `);

    const lineas = lineasRows as any[];
    console.log(`Líneas en Sysme (${lineas.length}):`);
    lineas.forEach((l: any) => {
      console.log(`  - Línea ${l.id_linea}: Producto ${l.id_complementog}, Qty ${l.cantidad}, Precio ${l.PVPTiquet}`);
    });
    console.log();

    // Obtener mapping de productos
    const { data: mappings } = await supabase
      .from('sysme_product_map')
      .select('id_complementog, product_id');

    const productMap = new Map<string, string>();
    (mappings || []).forEach((m: any) => {
      productMap.set(m.id_complementog, m.product_id);
    });

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 2: STOCK ANTES DE SYNC
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 2: STOCK ANTES DE SYNC\n');

    const { data: productsBeforeSync } = await supabase
      .from('products')
      .select('id, name, stock')
      .in('id', lineas.map(l => productMap.get(l.id_complementog)).filter(Boolean) as string[]);

    console.log('Stock ANTES:');
    const stockBefore = new Map<string, number>();
    (productsBeforeSync || []).forEach((p: any) => {
      stockBefore.set(p.id, p.stock);
      const sysmeId = Array.from(productMap.entries()).find(([_, supId]) => supId === p.id)?.[0];
      console.log(`  ${sysmeId}: ${p.stock} (${p.name})`);
    });
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 3: PRIMER SYNC
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 3: PRIMER SYNC\n');

    // Construir payload
    const [ventaDtRows] = await conn.query(`
      SELECT vd.id_venta, vd.serie, vd.id_tiquet, vd.fecha_venta
      FROM ventadirecta vd
      WHERE vd.id_venta = 4
    `);

    const ventaDt = (ventaDtRows as any[])[0];
    const salePayload = {
      sysme_id_venta: '4',
      sysme_serie: ventaDt.serie || 'A',
      sysme_id_tiquet: ventaDt.id_tiquet || '0001',
      sale_date: ventaDt.fecha_venta || new Date().toISOString().split('T')[0],
      subtotal: lineas.reduce((sum: number, l: any) => sum + (l.cantidad * l.PVPTiquet * (1 - 0.21)), 0),
      tax: lineas.reduce((sum: number, l: any) => sum + (l.cantidad * l.PVPTiquet * 0.21), 0),
      total: lineas.reduce((sum: number, l: any) => sum + (l.cantidad * l.PVPTiquet), 0),
      lineas: lineas.map((l: any) => ({
        sysme_id_venta: '4',
        sysme_id_linea: l.id_linea,
        product_id: productMap.get(l.id_complementog),
        cantidad: l.cantidad,
        PVPTiquet: l.PVPTiquet,
        precio_compra: l.precio_compra,
        total: l.cantidad * l.PVPTiquet,
        avgiva: l.avgiva,
      })),
    };

    const response1 = await fetch(`${config.supabase.url}/functions/v1/sysme-bridge-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.supabase.serviceKey}`,
      },
      body: JSON.stringify(salePayload),
    });

    const result1 = await response1.json() as any;
    console.log(`Primer sync: ${response1.status} ${response1.statusText}`);
    console.log(JSON.stringify(result1, null, 2));
    console.log();

    if (!result1.success) {
      console.error('✗ Primer sync falló');
      process.exit(1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 4: STOCK DESPUÉS DEL PRIMER SYNC
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 4: STOCK DESPUÉS DEL PRIMER SYNC\n');

    const { data: productsAfterSync1 } = await supabase
      .from('products')
      .select('id, name, stock')
      .in('id', lineas.map(l => productMap.get(l.id_complementog)).filter(Boolean) as string[]);

    console.log('Stock DESPUÉS:');
    const stockAfter1 = new Map<string, number>();
    const descuentos1 = new Map<string, number>();
    (productsAfterSync1 || []).forEach((p: any) => {
      stockAfter1.set(p.id, p.stock);
      const sysmeId = Array.from(productMap.entries()).find(([_, supId]) => supId === p.id)?.[0];
      const descuento = (stockBefore.get(p.id) || 0) - p.stock;
      descuentos1.set(p.id, descuento);
      console.log(`  ${sysmeId}: ${p.stock} (descuento: -${descuento})`);
    });
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 5: VERIFICAR MOVIMIENTOS DESPUÉS DEL PRIMER SYNC
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 5: VERIFICAR MOVIMIENTOS DESPUÉS DEL PRIMER SYNC\n');

    const { data: sales } = await supabase
      .from('sales')
      .select('id')
      .eq('sysme_id_venta', '4');

    const saleId = sales?.[0]?.id;
    const { data: movements1 } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('reference_id', saleId)
      .order('created_at', { ascending: true });

    console.log(`Movimientos después primer sync: ${movements1?.length || 0}`);
    (movements1 || []).forEach((m: any, i: number) => {
      const sysmeId = Array.from(productMap.entries()).find(([_, supId]) => supId === m.product_id)?.[0];
      console.log(`  Mov ${i + 1}: Producto ${sysmeId}, Qty ${m.quantity}, ${m.previous_stock} → ${m.resulting_stock}`);
    });
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 6: SEGUNDO SYNC (IDEMPOTENCIA)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 6: SEGUNDO SYNC (PRUEBA DE IDEMPOTENCIA)\n');

    const response2 = await fetch(`${config.supabase.url}/functions/v1/sysme-bridge-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.supabase.serviceKey}`,
      },
      body: JSON.stringify(salePayload),
    });

    const result2 = await response2.json() as any;
    console.log(`Segundo sync: ${response2.status} ${response2.statusText}`);
    console.log(JSON.stringify(result2, null, 2));
    console.log();

    if (!result2.success) {
      console.error('✗ Segundo sync falló');
      process.exit(1);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 7: STOCK DESPUÉS DEL SEGUNDO SYNC
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 7: STOCK DESPUÉS DEL SEGUNDO SYNC\n');

    const { data: productsAfterSync2 } = await supabase
      .from('products')
      .select('id, name, stock')
      .in('id', lineas.map(l => productMap.get(l.id_complementog)).filter(Boolean) as string[]);

    console.log('Stock DESPUÉS:');
    let allIdempotent = true;
    (productsAfterSync2 || []).forEach((p: any) => {
      const sysmeId = Array.from(productMap.entries()).find(([_, supId]) => supId === p.id)?.[0];
      const stock1 = stockAfter1.get(p.id);
      const igual = stock1 === p.stock ? '✓' : '✗';
      console.log(`  ${igual} ${sysmeId}: ${p.stock} (mismo que primer sync: ${stock1 === p.stock})`);
      if (stock1 !== p.stock) allIdempotent = false;
    });
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // FASE 8: VERIFICAR MOVIMIENTOS DESPUÉS DEL SEGUNDO SYNC
    // ═══════════════════════════════════════════════════════════════════════
    console.log('FASE 8: VERIFICAR MOVIMIENTOS DESPUÉS DEL SEGUNDO SYNC\n');

    const { data: movements2 } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('reference_id', saleId)
      .order('created_at', { ascending: true });

    console.log(`Movimientos después segundo sync: ${movements2?.length || 0}`);
    (movements2 || []).forEach((m: any, i: number) => {
      const sysmeId = Array.from(productMap.entries()).find(([_, supId]) => supId === m.product_id)?.[0];
      console.log(`  Mov ${i + 1}: Producto ${sysmeId}, Qty ${m.quantity}, ${m.previous_stock} → ${m.resulting_stock}`);
    });

    if (movements1?.length === movements2?.length) {
      console.log(`✓ Movimientos NO duplicados (${movements1?.length} = ${movements2?.length})`);
    } else {
      console.log(`✗ Movimientos DUPLICADOS (${movements1?.length} != ${movements2?.length})`);
      allIdempotent = false;
    }
    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // RESUMEN
    // ═══════════════════════════════════════════════════════════════════════
    console.log('╔════════════════════════════════════════════════════════════╗');
    if (allIdempotent && movements1?.length === movements2?.length) {
      console.log('║        ✓ IDEMPOTENCIA VALIDADA - LISTO PARA FASE 12.16    ║');
    } else {
      console.log('║        ✗ IDEMPOTENCIA FALLÓ - REVISAR ARRIBA             ║');
    }
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    conn.release();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
    await pool.end();
    process.exit(1);
  }
}

testIdempotence();
