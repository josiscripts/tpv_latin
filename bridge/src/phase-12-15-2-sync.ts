import mysql from 'mysql2/promise';
import axios from 'axios';
import { config } from './config';

interface SaleLinePayload {
  sysme_id_venta: string;
  sysme_id_linea: string;
  product_id: string;
  cantidad: number;
  PVPTiquet: number;
  precio_compra: number;
  total: number;
  avgiva: number;
}

interface SalesPayload {
  sysme_id_venta: string;
  sysme_serie: string;
  sysme_id_tiquet: string;
  sale_date: string;
  subtotal: number;
  tax: number;
  total: number;
  lineas: SaleLinePayload[];
}

async function syncSale() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║       FASE 12.15.2 — PRIMERA SINCRONIZACIÓN REAL          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    const TEST_SALE_ID = '4'; // Venta 4 - FIRST SYNC WITH FIXED EDGE FUNCTION

    // STEP 1: Leer venta de Sysme
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 1: LEER VENTA DE SYSME');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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

    // Leer venta principal
    const conn1 = await pool.getConnection();
    const [saleData] = await conn1.query(`
      SELECT id_venta, fecha_venta, cerrada
      FROM ventadirecta
      WHERE id_venta = ${mysql.escape(TEST_SALE_ID)}
    `);
    conn1.release();

    const saleArray = saleData as any[];
    if (saleArray.length === 0) {
      console.error('✗ Venta no encontrada en Sysme');
      process.exit(1);
    }

    const sale = saleArray[0];
    console.log(`✓ Venta encontrada:`);
    console.log(`  ID: ${sale.id_venta}`);
    console.log(`  Fecha: ${sale.fecha_venta}`);
    console.log(`  Cerrada: ${sale.cerrada}`);
    console.log();

    // Leer líneas
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 2: LEER LÍNEAS DE VENTA');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const conn2 = await pool.getConnection();
    const [lineData] = await conn2.query(`
      SELECT id_linea, id_complementog, cantidad, PVPTiquet, total
      FROM ventadir_comg
      WHERE id_venta = ${mysql.escape(TEST_SALE_ID)}
    `);
    conn2.release();

    const linesArray = lineData as any[];
    console.log(`✓ Líneas encontradas: ${linesArray.length}\n`);

    linesArray.forEach((l: any) => {
      console.log(`  Línea ${l.id_linea}: Producto ${l.id_complementog} | Qty ${l.cantidad} | Total ${l.total}`);
    });
    console.log();

    // STEP 3: Obtener mappings
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 3: RESOLVER MAPPINGS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Suponemos que los productos tienen IDs empresa/centro/tipo estándar
    const linePayloads: SaleLinePayload[] = [];

    for (const line of linesArray) {
      const conn3 = await pool.getConnection();
      const [productData] = await conn3.query(`
        SELECT id_empresa, id_centro, id_tipo_comg, id_complementog, precio_coste, avgiva
        FROM complementog
        WHERE id_complementog = ${mysql.escape(line.id_complementog)}
      `);
      conn3.release();

      const product = (productData as any[])[0];
      if (!product) {
        console.error(`✗ Producto ${line.id_complementog} no existe`);
        process.exit(1);
      }

      // Buscar mapping en Supabase (usando API)
      let mappingQuery = `id_empresa=eq.${product.id_empresa}&id_centro=eq.${product.id_centro}&id_tipo_comg=eq.${product.id_tipo_comg}&id_complementog=eq.${product.id_complementog}&select=product_id`;

      let productId = null;
      try {
        let mappingResponse = await axios.get(
          `${config.supabase.url}/rest/v1/sysme_product_map?${mappingQuery}`,
          {
            headers: {
              'apikey': config.supabase.serviceKey,
              'Content-Type': 'application/json',
            },
          }
        );

        if (mappingResponse.data.length === 0) {
          // Si no funciona, intentar solo con id_complementog
          console.log(`  ⚠ No encontrado con empresa/centro/tipo, buscando solo por id_complementog...`);
          mappingQuery = `id_complementog=eq.${product.id_complementog}&select=product_id`;
          mappingResponse = await axios.get(
            `${config.supabase.url}/rest/v1/sysme_product_map?${mappingQuery}`,
            {
              headers: {
                'apikey': config.supabase.serviceKey,
                'Content-Type': 'application/json',
              },
            }
          );
        }

        if (mappingResponse.data.length > 0) {
          productId = mappingResponse.data[0].product_id;
          console.log(`✓ Línea ${line.id_linea}: Sysme ${line.id_complementog} → Supabase ${productId}`);
        } else {
          console.error(`✗ No existe mapping para ${line.id_complementog}`);
          process.exit(1);
        }
      } catch (error) {
        console.error(`✗ Error obteniendo mapping:`, (error as Error).message);
        process.exit(1);
      }

      linePayloads.push({
        sysme_id_venta: TEST_SALE_ID,
        sysme_id_linea: line.id_linea,
        product_id: productId,
        cantidad: line.cantidad,
        PVPTiquet: line.PVPTiquet,
        precio_compra: product.precio_coste || 0,
        total: line.total,
        avgiva: product.avgiva || 21,
      });
    }
    console.log();

    // STEP 4: Construir payload
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 4: CONSTRUIR PAYLOAD');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const totalSale = linePayloads.reduce((sum, l) => sum + l.total, 0);
    const taxTotal = linePayloads.reduce((sum, l) => sum + (l.total * l.avgiva / 100), 0);

    const payload: SalesPayload = {
      sysme_id_venta: TEST_SALE_ID,
      sysme_serie: '001',
      sysme_id_tiquet: TEST_SALE_ID,
      sale_date: new Date().toISOString().split('T')[0],
      subtotal: totalSale,
      tax: taxTotal,
      total: totalSale + taxTotal,
      lineas: linePayloads,
    };

    console.log(`✓ Payload construido:`);
    console.log(JSON.stringify(payload, null, 2));
    console.log();

    // STEP 5: Enviar a Edge Function
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 5: INVOCAR EDGE FUNCTION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const edgeFunctionUrl = `${config.supabase.url}/functions/v1/sysme-bridge-sync`;

    console.log(`URL: ${edgeFunctionUrl}`);
    console.log(`Método: POST`);
    console.log(`Authorization: Bearer [SERVICE_KEY]`);
    console.log();

    const response = await axios.post(
      edgeFunctionUrl,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${config.supabase.serviceKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(response.data, null, 2));
    console.log();

    if (!response.data.success) {
      console.error('✗ Edge Function returned error');
      process.exit(1);
    }

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║          ✓ SINCRONIZACIÓN EXITOSA - VENTA 1               ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
    if (error instanceof Error && 'response' in error) {
      console.error('Response:', (error as any).response?.data);
    }
    process.exit(1);
  }
}

syncSale();
