import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';
import { config, validateConfig } from './config';

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
    // Validar configuración
    const errors = validateConfig();
    if (errors.length > 0) {
      console.error('[BRIDGE] Configuration errors:');
      errors.forEach(e => console.error(`  - ${e}`));
      process.exit(1);
    }

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

    // Test Sysme connection
    try {
      const testConn = await this.pool.getConnection();
      await testConn.query('SELECT 1');
      testConn.release();
      console.log('[BRIDGE] ✓ Sysme MySQL: OK');
    } catch (error) {
      console.error('[BRIDGE] ✗ Cannot connect to Sysme:', (error as Error).message);
      process.exit(1);
    }

    // Test Supabase connection
    try {
      await this.supabase.from('sync_state').select('*').limit(1);
      console.log('[BRIDGE] ✓ Supabase: OK');
    } catch (error) {
      console.error('[BRIDGE] ✗ Cannot connect to Supabase:', (error as Error).message);
      process.exit(1);
    }

    console.log(`[BRIDGE] Intervalo: ${this.syncInterval}ms`);
    console.log(`[BRIDGE] Sysme: ${config.sysme.host}:${config.sysme.port}/${config.sysme.database}\n`);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[BRIDGE] ✗ Ya está ejecutándose');
      return;
    }

    this.isRunning = true;
    console.log('[BRIDGE] ✓ Iniciando loop continuo...\n');

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
      const { data: syncState } = await this.supabase
        .from('sync_state')
        .select('*')
        .eq('integration_name', 'sysme_bridge');

      const cursor = (syncState?.[0]?.last_finalized_sale_id) || 0;
      cycle.cursorBefore = cursor;

      try {
        const productCount = await this.syncProducts();
        cycle.productsSynced = productCount;
      } catch (error) {
        cycle.errors.push(`Productos: ${(error as Error).message}`);
      }

      try {
        const saleCount = await this.syncSales(cursor);
        cycle.salesSynced = saleCount;
      } catch (error) {
        cycle.errors.push(`Ventas: ${(error as Error).message}`);
      }

      const { data: syncStateAfter } = await this.supabase
        .from('sync_state')
        .select('*')
        .eq('integration_name', 'sysme_bridge');

      cycle.cursorAfter = (syncStateAfter?.[0]?.last_finalized_sale_id) || cursor;

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
    // Obtener mappings existentes (completos, con 4-tupla)
    const { data: mappings } = await this.supabase
      .from('sysme_product_map')
      .select('id_empresa, id_centro, id_tipo_comg, id_complementog, product_id');

    // Construir mapa por 4-tupla para búsqueda rápida
    const mappingMap = new Map<string, { product_id: string }>();
    (mappings || []).forEach((m: any) => {
      const key = `${m.id_empresa}|${m.id_centro}|${m.id_tipo_comg}|${m.id_complementog}`;
      mappingMap.set(key, { product_id: m.product_id });
    });

    const conn = await this.pool!.getConnection();
    let updatedCount = 0;
    let createdCount = 0;
    let deactivatedCount = 0;

    try {
      // PASO 2.5: FASE 3D - Detectar y desactivar productos eliminados de Sysme
      try {
        // Obtener productos existentes en Supabase con mapping
        const { data: mappedProducts } = await this.supabase
          .from('sysme_product_map')
          .select('product_id, id_empresa, id_centro, id_tipo_comg, id_complementog');

        if (mappedProducts && mappedProducts.length > 0) {
          // Obtener lista de productos existentes en Sysme
          const [sysmeRows] = await conn.query(`
            SELECT DISTINCT
              id_empresa,
              id_centro,
              id_tipo_comg,
              id_complementog
            FROM complementog
          `);

          // Validación de seguridad: Sysme devolvió 0 productos
          if (!sysmeRows || (sysmeRows as any[]).length === 0) {
            console.log('[DEACTIVATION] Safety abort: Sysme returned 0 products (connection error suspected)');
          } else {
            // Construir set de claves Sysme (4-tupla completa)
            const sysmeKeys = new Set<string>();
            (sysmeRows as any[]).forEach(row => {
              const key = `${row.id_empresa}|${row.id_centro}|${row.id_tipo_comg}|${row.id_complementog}`;
              sysmeKeys.add(key);
            });

            // Detectar productos eliminados (en Supabase pero NO en Sysme)
            const eliminados: Array<{ product_id: string; key: string }> = [];
            for (const mapped of mappedProducts) {
              const key = `${mapped.id_empresa}|${mapped.id_centro}|${mapped.id_tipo_comg}|${mapped.id_complementog}`;
              if (!sysmeKeys.has(key)) {
                eliminados.push({ product_id: mapped.product_id, key });
              }
            }

            // Validación de seguridad: Demasiados eliminados (>50%)
            if (eliminados.length > mappedProducts.length * 0.5) {
              console.log(
                `[DEACTIVATION] Safety abort: Attempting to deactivate ${eliminados.length}/${mappedProducts.length} products (>50%)`
              );
            } else if (eliminados.length > 0) {
              // Desactivar productos eliminados
              for (const deleted of eliminados) {
                try {
                  const { error } = await this.supabase
                    .from('products')
                    .update({ active: false })
                    .eq('id', deleted.product_id);

                  if (!error) {
                    deactivatedCount++;
                    console.log(`[PRODUCT_DEACTIVATED] ${deleted.key} → ${deleted.product_id}`);
                  } else {
                    console.log(`[PRODUCT_DEACTIVATION_ERROR] ${deleted.key}: ${error.message}`);
                  }
                } catch (error) {
                  console.log(`[PRODUCT_DEACTIVATION_EXCEPTION] ${deleted.key}: ${(error as Error).message}`);
                }
              }
            }
          }
        }
      } catch (error) {
        console.log(`[DEACTIVATION_PROCESS_ERROR] ${(error as Error).message}`);
      }

      // CAMBIO CRÍTICO: Obtener TODOS los productos de Sysme, no filtrados por mapping
      const [productosRows] = await conn.query(`
        SELECT DISTINCT
          c.id_empresa,
          c.id_centro,
          c.id_tipo_comg,
          c.id_complementog,
          c.complementog,
          COALESCE(c.PVP, c.precio, 0) as precio,
          c.precio_coste as coste,
          COALESCE(ac.cantidad, 0) as cantidad,
          COALESCE(c.avgiva, 21.00) as tax_rate,
          c.peso as weight_kg,
          c.codbarras as barcode,
          c.descatalogado,
          c.venta
        FROM complementog c
        LEFT JOIN almacen_complementg ac ON c.id_complementog = ac.id_complementog
          AND c.id_empresa = ac.id_empresa AND c.id_centro = ac.id_centro
        ORDER BY c.id_complementog ASC
      `);

      const productos = (productosRows as any[]);

      for (const producto of productos) {
        const mapKey = `${producto.id_empresa}|${producto.id_centro}|${producto.id_tipo_comg}|${producto.id_complementog}`;
        const existingMapping = mappingMap.get(mapKey);

        if (existingMapping) {
          // CASO 1: Mapping existe → UPDATE producto
          const { error } = await this.supabase
            .from('products')
            .update({
              name: producto.complementog,
              cost_price: producto.coste,
              sale_price: producto.precio,
              stock: producto.cantidad,
              tax_rate: producto.tax_rate,
              weight_kg: producto.weight_kg,
              barcode: producto.barcode,
              active: producto.venta === 'S' && producto.descatalogado !== 'S',
            })
            .eq('id', existingMapping.product_id);

          if (!error) {
            updatedCount++;
          }
        } else {
          // CASO 2: Mapping NO existe → CREATE producto + CREATE mapping
          try {
            // Determinar active: venta='S' && descatalogado!='S' → true, else → false
            const isActive = producto.venta === 'S' && producto.descatalogado !== 'S';

            // Crear producto en Supabase
            const { data: newProduct, error: createError } = await this.supabase
              .from('products')
              .insert({
                name: producto.complementog,
                cost_price: producto.coste,
                sale_price: producto.precio,
                stock: producto.cantidad,
                tax_rate: producto.tax_rate,
                weight_kg: producto.weight_kg,
                barcode: producto.barcode,
                active: isActive,
              })
              .select()
              .single();

            if (createError || !newProduct) {
              console.log(
                `[PRODUCT_CREATE_ERROR] ${mapKey}: ${createError?.message || 'Unknown error'}`
              );
              continue;
            }

            // Crear mapping en sysme_product_map
            const { error: mappingError } = await this.supabase
              .from('sysme_product_map')
              .insert({
                product_id: newProduct.id,
                id_empresa: producto.id_empresa,
                id_centro: producto.id_centro,
                id_tipo_comg: producto.id_tipo_comg,
                id_complementog: producto.id_complementog,
              });

            if (mappingError) {
              console.log(
                `[MAPPING_CREATE_ERROR] ${mapKey}: ${mappingError.message}`
              );
              // Intentar limpiar el producto creado (best effort)
              await this.supabase
                .from('products')
                .delete()
                .eq('id', newProduct.id);
              continue;
            }

            createdCount++;
            console.log(
              `[PRODUCT_CREATED] ${mapKey} → ${newProduct.id}`
            );
          } catch (error) {
            console.log(
              `[PRODUCT_CREATE_EXCEPTION] ${mapKey}: ${(error as Error).message}`
            );
            continue;
          }
        }
      }

      return updatedCount + createdCount + deactivatedCount;
    } finally {
      conn.release();
    }
  }

  private async syncSales(cursor: number): Promise<number> {
    const conn = await this.pool!.getConnection();

    try {
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
