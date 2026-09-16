import mysql from 'mysql2/promise';
import { config } from '../config';

export interface SysmeVenta {
  id_venta: number;
  id_linea?: string;
  id_empresa?: string;
  id_centro?: string;
  id_complementog?: string;
  cantidad: number;
  PVPTiquet: number;
  precio_compra: number;
  total: number;
  avgiva: number;
  fecha_venta: string;
}

export interface SysmeLineaCompleta extends SysmeVenta {
  id_linea: string;
  id_empresa: string;
  id_centro: string;
  id_tipo_comg: string;
  id_complementog: string;
}

let pool: mysql.Pool | null = null;

export async function initSysmeConnection(): Promise<void> {
  pool = await mysql.createPool({
    host: config.sysme.host,
    port: config.sysme.port,
    database: config.sysme.database,
    user: config.sysme.user,
    password: config.sysme.password,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  console.log('[SYSME] Connection pool initialized');
}

export async function testSysmeConnection(): Promise<boolean> {
  try {
    if (!pool) {
      await initSysmeConnection();
    }
    const connection = await pool!.getConnection();
    const [rows] = await connection.query('SELECT 1 as test');
    connection.release();
    console.log('[SYSME] ✓ Connection test successful');
    return true;
  } catch (error) {
    console.error('[SYSME] ✗ Connection test failed:', (error as Error).message);
    return false;
  }
}

export async function getFinalizedSalesAfterCursor(cursor: string | null, limit: number): Promise<number[]> {
  if (!pool) {
    await initSysmeConnection();
  }

  try {
    let query = `
      SELECT DISTINCT vd.id_venta
      FROM ventadirecta vd
      WHERE vd.cerrada = 'S'
    `;

    if (cursor) {
      query += ` AND vd.id_venta > ${mysql.escape(parseInt(cursor))}`;
    }

    query += ` ORDER BY vd.id_venta ASC LIMIT ${limit}`;

    const connection = await pool!.getConnection();
    const [rows] = await connection.query(query);
    connection.release();

    const saleIds = (rows as any[]).map(r => r.id_venta);
    console.log(`[SYSME] Found ${saleIds.length} finalized sales after cursor ${cursor}`);
    return saleIds;
  } catch (error) {
    console.error('[SYSME] Error fetching sales:', (error as Error).message);
    throw error;
  }
}

export async function getSaleDetail(idVenta: number): Promise<SysmeLineaCompleta[]> {
  if (!pool) {
    await initSysmeConnection();
  }

  try {
    const query = `
      SELECT
        vd.id_venta,
        vc.id_linea,
        vd.id_empresa,
        vd.id_centro,
        '01' as id_tipo_comg,
        vc.id_complementog,
        vc.cantidad,
        vc.precio,
        COALESCE(vc.precio_compra, 0) as precio_compra,
        vc.PVPTiquet,
        vc.total,
        COALESCE(vc.avgiva, 0) as avgiva,
        vd.fecha_venta as fecha_venta
      FROM ventadirecta vd
      LEFT JOIN ventadir_comg vc ON vd.id_venta = vc.id_venta
      WHERE vd.id_venta = ${mysql.escape(idVenta)}
        AND vd.cerrada = 'S'
      ORDER BY vc.id_linea ASC
    `;

    const connection = await pool!.getConnection();
    const [rows] = await connection.query(query);
    connection.release();

    console.log(`[SYSME] Fetched ${(rows as any[]).length} lines for sale ${idVenta}`);
    return rows as SysmeLineaCompleta[];
  } catch (error) {
    console.error(`[SYSME] Error fetching sale detail for ${idVenta}:`, (error as Error).message);
    throw error;
  }
}

export interface SysmeProducto {
  id_complementog: string;
  nombre: string;
  precio: number;
  coste: number;
  cantidad: number;
  id_tipo_comg: string;
}

export async function getAllMappedProducts(): Promise<SysmeProducto[]> {
  if (!pool) {
    await initSysmeConnection();
  }

  try {
    const query = `
      SELECT DISTINCT
        c.id_complementog,
        c.nombre,
        COALESCE(c.pvp, 0) as precio,
        COALESCE(c.coste, 0) as coste,
        COALESCE(ac.cantidad, 0) as cantidad,
        COALESCE(c.id_tipo_comg, '01') as id_tipo_comg
      FROM complementog c
      LEFT JOIN almacen_complementg ac ON c.id_complementog = ac.id_complementog
      WHERE c.id_complementog IN (
        SELECT DISTINCT id_complementog FROM ventadir_comg
      )
      ORDER BY c.id_complementog ASC
    `;

    const connection = await pool!.getConnection();
    const [rows] = await connection.query(query);
    connection.release();

    console.log(`[SYSME] Fetched ${(rows as any[]).length} mapped products`);
    return rows as SysmeProducto[];
  } catch (error) {
    console.error('[SYSME] Error fetching products:', (error as Error).message);
    throw error;
  }
}

export async function getProductStock(idComplementog: string): Promise<number> {
  if (!pool) {
    await initSysmeConnection();
  }

  try {
    const query = `
      SELECT COALESCE(cantidad, 0) as cantidad
      FROM almacen_complementg
      WHERE id_complementog = ${mysql.escape(idComplementog)}
    `;

    const connection = await pool!.getConnection();
    const [rows] = await connection.query(query);
    connection.release();

    const stock = (rows as any[])[0]?.cantidad || 0;
    console.log(`[SYSME] Stock for ${idComplementog}: ${stock}`);
    return stock;
  } catch (error) {
    console.error(`[SYSME] Error fetching stock for ${idComplementog}:`, (error as Error).message);
    throw error;
  }
}

export async function closeSysmeConnection(): Promise<void> {
  if (pool) {
    await pool.end();
    console.log('[SYSME] Connection pool closed');
  }
}
