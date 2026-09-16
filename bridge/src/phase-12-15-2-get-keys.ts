import mysql from 'mysql2/promise';
import { config } from './config';

async function getProductKeys() {
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

    const conn = await pool.getConnection();
    const [products] = await conn.query(`
      SELECT id_empresa, id_centro, id_tipo_comg, id_complementog
      FROM complementog
      WHERE id_complementog = '00001'
    `);
    conn.release();

    const productArray = products as any[];
    if (productArray.length > 0) {
      const p = productArray[0];
      console.log(`id_empresa: ${p.id_empresa}`);
      console.log(`id_centro: ${p.id_centro}`);
      console.log(`id_tipo_comg: ${p.id_tipo_comg}`);
      console.log(`id_complementog: ${p.id_complementog}`);
    }

    await pool.end();
  } catch (error) {
    console.error('Error:', (error as Error).message);
  }
}

getProductKeys();
