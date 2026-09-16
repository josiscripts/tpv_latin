import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';
import { config } from './config';

interface SyncCycle {
  timestamp: Date;
  salesSynced: number;
  productsSynced: number;
  errors: string[];
  cursorBefore: number | null;
  cursorAfter: number | null;
}

class BridgeContinuous {
  private supabase: any;
  private pool: mysql.Pool | null = null;
  private isRunning = false;
  private cycles: SyncCycle[] = [];
  private syncInterval: number;

  constructor() {
    this.supabase = createClient(config.supabase.url, config.supabase.serviceKey);
    this.syncInterval = parseInt(process.env.SYNC_INTERVAL_MS || '30000');
  }

  async initialize(): Promise<void> {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║        BRIDGE CONTINUO AUTOMÁTICO                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    this.pool = await mysql.createPool({
      host: config.sysme.host,
      port: config.sysme.port,
      database: config.sysme.database,
      user: config.sysme.user,
      password: config.sysme.password,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });

    console.log(`[BRIDGE] Inicializado`);
    console.log(`[BRIDGE] Intervalo: ${this.syncInterval}ms`);
    console.log(`[BRIDGE] Sysme: ${config.sysme.host}:${config.sysme.port}`);
    console.log(`[BRIDGE] Supabase: ${config.supabase.url}\n`);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[BRIDGE] ✗ Ya está ejecutándose');
      return;
    }

    this.isRunning = true;
    console.log('[BRIDGE] ✓ Iniciando loop continuo...\n');

    // Graceful shutdown
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('SIGTERM', () => this.gracefulShutdown());

    while (this.isRunning) {
      await this.executeCycle();
      await this.delay(this.syncInterval);
    }
  }

  private async executeCycle(): Promise<void> {
    const cycleStart = Date.now();
    const cycle: SyncCycle = {
      timestamp: new Date(),
      salesSynced: 0,
      productsSynced: 0,
      errors: [],
      cursorBefore: null,
      cursorAfter: null,
    };

    try {
      // Obtener cursor actual
      const { data: syncState } = await this.supabase
        .from('sync_state')
        .select('*')
        .eq('integration_name', 'sysme_bridge');

      const cursor = (syncState?.[0]?.last_finalized_sale_id) || 0;
      cycle.cursorBefore = cursor;

      // PASO 1: SINCRONIZAR PRODUCTOS
      try {
        const productCount = await this.syncProducts();
        cycle.productsSynced = productCount;
      } catch (error) {
        cycle.errors.push(`Productos: ${(error as Error).message}`);
      }

      // PASO 2: SINCRONIZAR VENTAS
      try {
        const saleCount = await this.syncSales(cursor);
        cycle.salesSynced = saleCount;
      } catch (error) {
        cycle.errors.push(`Ventas: ${(error as Error).message}`);
      }

      // Obtener cursor después
      const { data: syncStateAfter } = await this.supabase
        .from('sync_state')
        .select('*')
        .eq('integration_name', 'sysme_bridge');

      cycle.cursorAfter = (syncStateAfter?.[0]?.last_finalized_sale_id) || cursor;

      // Log del ciclo
      const duration = Date.now() - cycleStart;
      const timestamp = new Date().toLocaleTimeString('es-ES');

      if (cycle.salesSynced > 0 || cycle.productsSynced > 0) {
        console.log(
          `[${timestamp}] Ciclo: ${cycle.salesSynced} ventas, ${cycle.productsSynced} productos ` +
            `(cursor: ${cycle.cursorBefore} → ${cycle.cursorAfter}) [${duration}ms]`
        );
      } else if (cycle.errors.length === 0) {
        console.log(
          `[${timestamp}] Sin cambios (cursor: ${cycle.cursorBefore}) [${duration}ms]`
        );
      }

      if (cycle.errors.length > 0) {
        console.log(`[${timestamp}] ✗ Errores:`);
        cycle.errors.forEach((e) => console.log(`    - ${e}`));
      }

      this.cycles.push(cycle);

      // Mantener últimos 100 ciclos
      if (this.cycles.length > 100) {
        this.cycles = this.cycles.slice(-100);
      }
    } catch (error) {
      console.error(`[CICLO] Error fatal: ${(error as Error).message}`);
      cycle.errors.push(`Fatal: ${(error as Error).message}`);
      this.cycles.push(cycle);
    }
  }

  private async syncProducts(): Promise<number> {
    const { data: mappings } = await this.supabase
      .from('sysme_product_map')
      .select('id_complementog, product_id');

    if (!mappings || mappings.length === 0) {
      return 0;
    }

    const productMap = new Map<string, string>();
    mappings.forEach((m: any) => {
      productMap.set(m.id_complementog, m.product_id);
    });

    const conn = await this.pool!.getConnection();

    try {
      const [productosRows] = await conn.query(`
        SELECT DISTINCT
          c.id_complementog,
          c.complementog,
          COALESCE(c.PVP, c.precio, 0) as precio,
          COALESCE(c.precio_coste, 0) as coste,
          COALESCE(ac.cantidad, 0) as cantidad
        FROM complementog c
        LEFT JOIN almacen_complementg ac ON c.id_complementog = ac.id_complementog
          AND c.id_empresa = ac.id_empresa AND c.id_centro = ac.id_centro
        WHERE c.id_complementog IN (${Array.from(productMap.keys()).map((id) => `'${id}'`).join(',')})
        ORDER BY c.id_complementog ASC
      `);

      const productos = (productosRows as any[]);
      let updatedCount = 0;

      for (const producto of productos) {
        const supabaseId = productMap.get(producto.id_complementog);
        if (!supabaseId) continue;

        const { error } = await this.supabase
          .from('products')
          .update({
            name: producto.complementog,
            cost_price: producto.coste,
            sale_price: producto.precio,
            stock: producto.cantidad,
          })
          .eq('id', supabaseId);

        if (!error) {
          updatedCount++;
        }
      }

      return updatedCount;
    } finally {
      conn.release();
    }
  }

  private async syncSales(cursor: number): Promise<number> {
    const conn = await this.pool!.getConnection();

    try {
      // Obtener ventas cerradas pendientes
      const [ventasRows] = await conn.query(`
        SELECT DISTINCT vd.id_venta
        FROM ventadirecta vd
        WHERE vd.cerrada = 'S' AND vd.id_venta > ?
        ORDER BY vd.id_venta ASC
        LIMIT 10
      `, [cursor]);

      const ventaIds = (ventasRows as any[]).map((v: any) => v.id_venta);

      if (ventaIds.length === 0) {
        return 0;
      }

      // Obtener mapeo de productos
      const { data: mappings } = await this.supabase
        .from('sysme_product_map')
        .select('id_complementog, product_id');

      const productMap = new Map<string, string>();
      (mappings || []).forEach((m: any) => {
        productMap.set(m.id_complementog, m.product_id);
      });

      let successCount = 0;

      for (const ventaId of ventaIds) {
        try {
          // Obtener datos de venta
          const [ventaData] = await conn.query(`
            SELECT vd.id_venta, vd.serie, vd.id_tiquet, vd.fecha_venta
            FROM ventadirecta vd WHERE vd.id_venta = ?
          `, [ventaId]);

          const venta = (ventaData as any[])[0];
          if (!venta) continue;

          const [lineasData] = await conn.query(`
            SELECT id_linea, id_complementog, cantidad, PVPTiquet, precio_compra, avgiva
            FROM ventadir_comg WHERE id_venta = ?
          `, [ventaId]);

          const lineas = lineasData as any[];
          if (lineas.length === 0) continue;

          // Construir payload
          const payload = {
            sysme_id_venta: String(ventaId),
            sysme_serie: venta.serie || 'A',
            sysme_id_tiquet: venta.id_tiquet || '0001',
            sale_date: venta.fecha_venta,
            subtotal: lineas.reduce((sum: number, l: any) => sum + (l.cantidad * l.PVPTiquet * (1 - 0.21)), 0),
            tax: lineas.reduce((sum: number, l: any) => sum + (l.cantidad * l.PVPTiquet * 0.21), 0),
            total: lineas.reduce((sum: number, l: any) => sum + (l.cantidad * l.PVPTiquet), 0),
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
            successCount++;
          }
        } catch (error) {
          console.error(`[VENTA ${ventaId}] Error: ${(error as Error).message}`);
          // Continuar con la siguiente venta, no avanzar cursor
          continue;
        }
      }

      return successCount;
    } finally {
      conn.release();
    }
  }

  private async gracefulShutdown(): Promise<void> {
    console.log('\n\n[BRIDGE] Cerrando...');
    this.isRunning = false;

    if (this.pool) {
      await this.pool.end();
      console.log('[BRIDGE] Pool MySQL cerrado');
    }

    // Resumen de ciclos
    if (this.cycles.length > 0) {
      const totalSales = this.cycles.reduce((sum, c) => sum + c.salesSynced, 0);
      const totalProducts = this.cycles.reduce((sum, c) => sum + c.productsSynced, 0);
      const totalErrors = this.cycles.reduce((sum, c) => sum + c.errors.length, 0);

      console.log('\n[BRIDGE] Resumen de sesión:');
      console.log(`  Ciclos: ${this.cycles.length}`);
      console.log(`  Ventas sincronizadas: ${totalSales}`);
      console.log(`  Productos sincronizados: ${totalProducts}`);
      console.log(`  Errores: ${totalErrors}`);
    }

    console.log('[BRIDGE] ✓ Cerrado\n');
    process.exit(0);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

async function main() {
  const bridge = new BridgeContinuous();
  await bridge.initialize();
  await bridge.start();
}

main().catch(console.error);
