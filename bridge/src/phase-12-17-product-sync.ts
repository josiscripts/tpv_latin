import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';
import { config } from './config';

async function syncProducts() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     FASE 12.17 — SINCRONIZACIÓN DE PRODUCTOS + STOCK        ║');
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
    // 1. OBTENER MAPEOS DE PRODUCTOS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('1. OBTENER MAPEOS DE PRODUCTOS\n');

    const { data: mappings } = await supabase
      .from('sysme_product_map')
      .select('id_complementog, product_id');

    const productMap = new Map<string, string>();
    (mappings || []).forEach((m: any) => {
      productMap.set(m.id_complementog, m.product_id);
    });

    console.log(`Productos mapeados: ${productMap.size}\n`);

    // ═══════════════════════════════════════════════════════════════════════
    // 2. OBTENER PRODUCTOS DE SYSME
    // ═══════════════════════════════════════════════════════════════════════
    console.log('2. OBTENER PRODUCTOS REALES DE SYSME\n');

    const conn = await pool.getConnection();
    const [productosRows] = await conn.query(`
      SELECT DISTINCT
        c.id_complementog,
        c.complementog,
        COALESCE(c.PVP, c.precio, 0) as precio,
        COALESCE(c.precio_coste, 0) as coste,
        COALESCE(ac.cantidad, 0) as cantidad,
        COALESCE(c.id_tipo_comg, '01') as id_tipo_comg,
        COALESCE(c.descatalogado, 'N') as descatalogado
      FROM complementog c
      LEFT JOIN almacen_complementg ac ON c.id_complementog = ac.id_complementog AND c.id_empresa = ac.id_empresa AND c.id_centro = ac.id_centro
      WHERE c.id_complementog IN (${Array.from(productMap.keys()).map((id) => `'${id}'`).join(',')})
      ORDER BY c.id_complementog ASC
    `);

    const productos = (productosRows as any[]);
    console.log(`Productos leídos de Sysme: ${productos.length}\n`);

    if (productos.length === 0) {
      console.log('✗ No hay productos para sincronizar\n');
      conn.release();
      await pool.end();
      process.exit(0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. SINCRONIZAR CADA PRODUCTO
    // ═══════════════════════════════════════════════════════════════════════
    console.log('3. SINCRONIZAR PRODUCTOS A SUPABASE\n');

    const syncResults: Array<{
      sysmeId: string;
      supabaseId: string;
      success: boolean;
      message: string;
    }> = [];

    for (const producto of productos) {
      try {
        const supabaseId = productMap.get(producto.id_complementog);
        if (!supabaseId) {
          syncResults.push({
            sysmeId: producto.id_complementog,
            supabaseId: '',
            success: false,
            message: 'No mapped to Supabase',
          });
          continue;
        }

        console.log(`  Sincronizando ${producto.id_complementog}...`);

        // UPSERT para idempotencia
        const { error } = await supabase
          .from('products')
          .update({
            name: producto.complementog,
            cost_price: producto.coste,
            sale_price: producto.precio,
            stock: producto.cantidad,
          })
          .eq('id', supabaseId);

        if (error) {
          throw new Error(error.message);
        }

        console.log(`    ✓ ${producto.id_complementog}: stock=${producto.cantidad}`);
        syncResults.push({
          sysmeId: producto.id_complementog,
          supabaseId,
          success: true,
          message: `Updated (stock=${producto.cantidad})`,
        });
      } catch (error) {
        console.log(`    ✗ Error: ${(error as Error).message}`);
        syncResults.push({
          sysmeId: producto.id_complementog,
          supabaseId: productMap.get(producto.id_complementog) || '',
          success: false,
          message: (error as Error).message,
        });
      }
    }

    console.log();

    // ═══════════════════════════════════════════════════════════════════════
    // 4. VALIDAR SINCRONIZACIÓN
    // ═══════════════════════════════════════════════════════════════════════
    console.log('4. VALIDAR SINCRONIZACIÓN\n');

    const successful = syncResults.filter((r) => r.success).length;
    const failed = syncResults.filter((r) => !r.success).length;

    console.log(`Procesados: ${syncResults.length}`);
    console.log(`Exitosos: ${successful}`);
    console.log(`Fallidos: ${failed}\n`);

    if (failed > 0) {
      console.log('Errores:');
      syncResults.filter((r) => !r.success).forEach((r) => {
        console.log(`  - ${r.sysmeId}: ${r.message}`);
      });
      console.log();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. COMPARAR DATOS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('5. COMPARAR DATOS SYSME vs SUPABASE\n');

    for (const producto of productos.slice(0, 3)) {
      const supabaseId = productMap.get(producto.id_complementog);
      if (!supabaseId) continue;

      const { data: supabaseProduct } = await supabase
        .from('products')
        .select('name, cost_price, sale_price, stock')
        .eq('id', supabaseId);

      if (supabaseProduct && supabaseProduct.length > 0) {
        const sp = supabaseProduct[0];
        const match =
          sp.name === producto.complementog &&
          sp.cost_price === producto.coste &&
          sp.sale_price === producto.precio &&
          sp.stock === producto.cantidad;

        console.log(`  ${producto.id_complementog}:`);
        console.log(`    Sysme:    ${producto.complementog} (${producto.cantidad} stock)`);
        console.log(`    Supabase: ${sp.name} (${sp.stock} stock)`);
        console.log(`    Coincide: ${match ? '✓' : '✗'}\n`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 6. RESUMEN
    // ═══════════════════════════════════════════════════════════════════════
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           RESUMEN DE SINCRONIZACIÓN                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`Productos Sysme leídos: ${productos.length}`);
    console.log(`Productos mapeados: ${productMap.size}`);
    console.log(`Productos sincronizados: ${successful}`);
    console.log(`Errores: ${failed}\n`);

    conn.release();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Error:', (error as Error).message);
    await pool.end();
    process.exit(1);
  }
}

syncProducts();
