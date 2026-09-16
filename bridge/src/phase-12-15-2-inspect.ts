import mysql from 'mysql2/promise';
import { config } from './config';

async function inspect() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          FASE 12.15.2 — INSPECTION DE VENTAS              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
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

    // STEP 1: Inspeccionar todas las ventas cerradas
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 1: VENTAS CERRADAS EN SYSME');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const conn1 = await pool.getConnection();
    const [sales] = await conn1.query(`
      SELECT id_venta, fecha_venta, cerrada
      FROM ventadirecta
      WHERE cerrada = 'S'
      ORDER BY id_venta ASC
    `);
    conn1.release();

    const salesArray = sales as any[];
    console.log(`Ventas cerradas encontradas: ${salesArray.length}\n`);

    salesArray.forEach((s) => {
      console.log(`  ID ${s.id_venta} | Fecha: ${s.fecha_venta} | Cerrada: ${s.cerrada}`);
    });
    console.log();

    // STEP 2: Para cada venta, obtener líneas
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 2: ANÁLISIS DE LÍNEAS POR VENTA');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const sale of salesArray) {
      const conn2 = await pool.getConnection();
      const [lines] = await conn2.query(`
        SELECT id_linea, id_complementog, cantidad, PVPTiquet, total
        FROM ventadir_comg
        WHERE id_venta = ${mysql.escape(sale.id_venta)}
        ORDER BY id_linea ASC
      `);
      conn2.release();

      const linesArray = lines as any[];
      console.log(`Venta ID ${sale.id_venta}:`);
      console.log(`  Líneas: ${linesArray.length}`);

      if (linesArray.length > 0) {
        linesArray.forEach((line) => {
          console.log(`    - Línea ${line.id_linea}: Producto ${line.id_complementog} | Qty ${line.cantidad} | Total ${line.total}`);
        });
      }
      console.log();
    }

    // STEP 3: Seleccionar candidata
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 3: VENTA CANDIDATA PARA PRUEBA');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Preferencia: venta con menos líneas
    const candidates = [];
    for (const sale of salesArray) {
      const conn3 = await pool.getConnection();
      const [count] = await conn3.query(`
        SELECT COUNT(*) as lineCount FROM ventadir_comg WHERE id_venta = ${mysql.escape(sale.id_venta)}
      `);
      conn3.release();

      const lineCount = (count as any[])[0].lineCount;
      candidates.push({ id_venta: sale.id_venta, fecha: sale.fecha_venta, lineCount });
    }

    candidates.sort((a, b) => a.lineCount - b.lineCount);
    const candidate = candidates[0];

    console.log(`Venta candidata seleccionada: ID ${candidate.id_venta}`);
    console.log(`  Fecha: ${candidate.fecha}`);
    console.log(`  Líneas: ${candidate.lineCount}`);
    console.log();

    // STEP 4: Inspeccionar candidata en detalle
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`STEP 4: DETALLE COMPLETO VENTA ${candidate.id_venta}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const conn4 = await pool.getConnection();
    const [candidateLines] = await conn4.query(`
      SELECT id_linea, id_complementog, cantidad, PVPTiquet, total
      FROM ventadir_comg
      WHERE id_venta = ${mysql.escape(candidate.id_venta)}
      ORDER BY id_linea ASC
    `);
    conn4.release();

    const candidateLinesArray = candidateLines as any[];
    console.log(`Líneas encontradas: ${candidateLinesArray.length}\n`);

    for (const line of candidateLinesArray) {
      console.log(`Línea ${line.id_linea}:`);
      console.log(`  Producto ID (Sysme): ${line.id_complementog}`);
      console.log(`  Cantidad: ${line.cantidad}`);
      console.log(`  Precio (PVPTiquet): ${line.PVPTiquet}`);
      console.log(`  Total: ${line.total}`);
      console.log();
    }

    // STEP 5: Obtener datos del producto en Sysme
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 5: DATOS DEL PRODUCTO EN SYSME');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const line of candidateLinesArray) {
      const conn5 = await pool.getConnection();
      const [product] = await conn5.query(`
        SELECT id_complementog, complementog, codbarras, precio, precio_coste, avgiva
        FROM complementog
        WHERE id_complementog = ${mysql.escape(line.id_complementog)}
      `);
      conn5.release();

      const productArray = product as any[];
      if (productArray.length > 0) {
        const p = productArray[0];
        console.log(`Producto ${p.id_complementog}:`);
        console.log(`  Nombre: ${p.complementog}`);
        console.log(`  Código Barras: ${p.codbarras}`);
        console.log(`  Precio: ${p.precio}`);
        console.log(`  Costo: ${p.precio_coste}`);
        console.log(`  IVA: ${p.avgiva}`);
        console.log();
      }
    }

    await pool.end();
    console.log('✓ Inspection completada\n');
    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', (error as Error).message);
    process.exit(1);
  }
}

inspect();
