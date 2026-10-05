import { createClient } from '@supabase/supabase-js';
import mysql from 'mysql2/promise';
import { config, validateConfig } from './config';
import { syncProductImages } from './image-sync';

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

      // Registrar estado de productos representativos después del ciclo
      await this.recordCycleState();

      if (this.cycles.length > 100) {
        this.cycles = this.cycles.slice(-100);
      }
    } catch (error) {
      console.error(`[CICLO] Error fatal: ${(error as Error).message}`);
      cycle.errors.push(`Fatal: ${(error as Error).message}`);
      this.cycles.push(cycle);
    }
  }

  private async recordCycleState(): Promise<void> {
    try {
      const cycleNum = this.cycles.length;
      const conn = await this.pool!.getConnection();

      // Obtener datos de Sysme
      const [sysmeRows] = await conn.query(`
        SELECT
          c.id_complementog,
          COALESCE(c.precio_compra, 0) as coste,
          COALESCE(c.PVP, c.precio, 0) as precio
        FROM complementog c
        WHERE c.id_complementog IN ('00001', '00002', '00008', '00010', '00016')
        ORDER BY c.id_complementog
      `);

      conn.release();

      const sysmeData = new Map();
      (sysmeRows as any[]).forEach(row => {
        sysmeData.set(row.id_complementog, { coste: row.coste, precio: row.precio });
      });

      // Obtener datos de Supabase
      const { data: products } = await this.supabase
        .from('sysme_product_map')
        .select(`
          id_complementog,
          product_id,
          products!inner(
            id,
            name,
            cost_price,
            sale_price,
            category_id,
            image,
            active
          )
        `)
        .in('id_complementog', ['00001', '00002', '00008', '00010', '00016'])
        .limit(10);

      if (products && products.length > 0) {
        console.log(`\n[CYCLE_STATE_${cycleNum}] Estado después del ciclo:`);
        console.log('Prod | Coste Sysme | Coste Supa | Match | Precio Sys | Precio Supa | Match | Cat | Img');
        console.log('-----|-------------|------------|-------|------------|-------------|-------|-----|----');

        for (const p of products) {
          const prod = p.products as any;
          const sysme = sysmeData.get(p.id_complementog) || { coste: 'NULL', precio: 'NULL' };
          const costMatch = sysme.coste === prod.cost_price ? 'OK' : 'DIFF';
          const priceMatch = Math.abs((sysme.precio as number) - (prod.sale_price as number)) < 0.01 ? 'OK' : 'DIFF';
          const catStr = prod.category_id ? 'Y' : 'N';
          const imgStr = prod.image ? 'Y' : 'N';

          const costVal = prod.cost_price || 'NULL';
          const priceVal = prod.sale_price || 'NULL';

          console.log(`${p.id_complementog.padEnd(5)}| ${String(sysme.coste).substring(0,11).padEnd(11)} | ${String(costVal).substring(0,10).padEnd(10)} | ${costMatch.padEnd(5)} | ${String(sysme.precio).substring(0,10).padEnd(10)} | ${String(priceVal).substring(0,11).padEnd(11)} | ${priceMatch.padEnd(5)} | ${catStr.padEnd(3)} | ${imgStr.padEnd(4)}`);
        }
      }
    } catch (error) {
      console.log(`[CYCLE_STATE_ERROR] ${(error as Error).message}`);
    }
  }

  private async syncProducts(): Promise<number> {
    // Obtener mappings existentes (completos, con 4-tupla)
    const { data: mappings } = await this.supabase
      .from('sysme_product_map')
      .select('id_empresa, id_centro, id_tipo_comg, id_complementog, product_id');

    // Construir mapa por 4-tupla para búsqueda rápida
    const mappingMap = new Map<string, { product_id: string }>();
    const productMap = new Map<string, string>(); // Para image-sync (id_complementog → product_id)
    (mappings || []).forEach((m: any) => {
      const key = `${m.id_empresa}|${m.id_centro}|${m.id_tipo_comg}|${m.id_complementog}`;
      mappingMap.set(key, { product_id: m.product_id });
      productMap.set(m.id_complementog, m.product_id); // Para image-sync
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
          c.precio_compra as coste,
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
          // CASO 1: Mapping existe → RECONCILIAR producto (comparar y actualizar solo si necesario)

          // Resolver category_id desde tipo_comg_categories
          let categoryId: string | null = null;
          const { data: categoryMapping } = await this.supabase
            .from('tipo_comg_categories')
            .select('category_id')
            .eq('id_empresa', producto.id_empresa)
            .eq('id_centro', producto.id_centro)
            .eq('id_tipo_comg', producto.id_tipo_comg)
            .single();

          if (!categoryMapping) {
            console.log(
              `[CATEGORY_MAPPING_MISSING] ${mapKey}: no mapping found for id_tipo_comg=${producto.id_tipo_comg}`
            );
          } else {
            categoryId = categoryMapping.category_id;
          }

          // Obtener valores actuales de Supabase para comparación
          const { data: currentProduct, error: fetchError } = await this.supabase
            .from('products')
            .select('name, cost_price, sale_price, stock, tax_rate, weight_kg, barcode, active, category_id')
            .eq('id', existingMapping.product_id)
            .single();

          if (fetchError) {
            console.log(`[RECONCILIATION_FETCH_ERROR] ${mapKey}: ${fetchError.message}`);
            continue;
          }

          // Construir objeto con valores esperados (lo que debe estar en Supabase)
          const expectedData: any = {
            name: producto.complementog,
            cost_price: producto.coste,
            sale_price: producto.precio,
            stock: producto.cantidad,
            tax_rate: producto.tax_rate,
            weight_kg: producto.weight_kg,
            barcode: producto.barcode,
            active: producto.venta === 'S' && producto.descatalogado !== 'S',
          };

          if (categoryId) {
            expectedData.category_id = categoryId;
          }

          // DEBUG: Log detallado para productos de prueba
          if (['00001', '00002', '00016'].includes(producto.id_complementog)) {
            console.log(`\n[EVIDENCE_BEFORE] ${producto.id_complementog}:`);
            console.log(`  Sysme.precio_compra → producto.coste: ${producto.coste} (type=${typeof producto.coste})`);
            console.log(`  Supabase.cost_price (current): ${(currentProduct as any)?.cost_price}`);
          }

          // RECONCILIACIÓN: Comparar y detectar cambios reales
          const changedFields: string[] = [];
          Object.entries(expectedData).forEach(([key, expectedValue]) => {
            const currentValue = (currentProduct as any)?.[key];
            if (currentValue !== expectedValue) {
              changedFields.push(key);
            }
          });

          // Solo actualizar si hay cambios detectados
          if (changedFields.length > 0) {
            // DIAGNÓSTICO: Log BEFORE UPDATE
            console.log(`[PRODUCT_WRITE_BEFORE] ${mapKey}: cost_price=${expectedData.cost_price}, sale_price=${expectedData.sale_price}`);

            // UPDATE con RETURNING para capturar exactamente qué escribe PostgreSQL
            const { data: returnedData, error: updateError } = await this.supabase
              .from('products')
              .update(expectedData)
              .eq('id', existingMapping.product_id)
              .select('id, cost_price, sale_price, updated_at')
              .single();

            if (updateError) {
              console.log(`[RECONCILIATION_UPDATE_ERROR] ${mapKey}: ${updateError.message}`);
            } else {
              updatedCount++;
              console.log(`[RECONCILIATION_UPDATED] ${mapKey}: ${changedFields.join(', ')}`);

              // DIAGNÓSTICO: Log RETURNING (lo que PostgreSQL devolvió)
              console.log(`[PRODUCT_WRITE_RETURNING] ${mapKey}: cost_price=${returnedData?.cost_price}, sale_price=${returnedData?.sale_price}, updated_at=${returnedData?.updated_at}`);

              // DIAGNÓSTICO: Verificación inmediata (leer de nuevo)
              const { data: verifyData } = await this.supabase
                .from('products')
                .select('cost_price, sale_price, updated_at')
                .eq('id', existingMapping.product_id)
                .single();
              console.log(`[PRODUCT_VERIFY_IMMEDIATE] ${mapKey}: cost_price=${verifyData?.cost_price}, sale_price=${verifyData?.sale_price}, updated_at=${verifyData?.updated_at}`);
            }
          }
        } else {
          // CASO 2: Mapping NO existe → CREATE producto + CREATE mapping
          try {
            // Determinar active: venta='S' && descatalogado!='S' → true, else → false
            const isActive = producto.venta === 'S' && producto.descatalogado !== 'S';

            // Resolver category_id desde tipo_comg_categories
            let categoryId: string | null = null;
            const { data: categoryMapping } = await this.supabase
              .from('tipo_comg_categories')
              .select('category_id')
              .eq('id_empresa', producto.id_empresa)
              .eq('id_centro', producto.id_centro)
              .eq('id_tipo_comg', producto.id_tipo_comg)
              .single();

            if (!categoryMapping) {
              console.log(
                `[CATEGORY_MAPPING_MISSING] ${mapKey}: no mapping found for id_tipo_comg=${producto.id_tipo_comg}`
              );
            } else {
              categoryId = categoryMapping.category_id;
            }

            // Crear producto en Supabase
            const insertData: any = {
              name: producto.complementog,
              cost_price: producto.coste,
              sale_price: producto.precio,
              stock: producto.cantidad,
              tax_rate: producto.tax_rate,
              weight_kg: producto.weight_kg,
              barcode: producto.barcode,
              active: isActive,
            };

            // Incluir category_id si existe mapping
            if (categoryId) {
              insertData.category_id = categoryId;
            }

            const { data: newProduct, error: createError } = await this.supabase
              .from('products')
              .insert(insertData)
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

      // Sincronizar imágenes de todos los productos mapeados
      try {
        const imageResults = await syncProductImages(productMap, conn, this.supabase);
        console.log(`[IMAGES] Synced: ${imageResults.synced}, Skipped: ${imageResults.skipped}`);
        if (imageResults.errors && imageResults.errors.length > 0) {
          console.log(`[IMAGES] Errors: ${imageResults.errors.length}`);
          imageResults.errors.forEach((e: string) => console.log(`  [IMAGE_SYNC_ERROR] ${e}`));
        }
      } catch (error) {
        console.log(`[IMAGES] Fatal error: ${(error as Error).message}`);
      }

      // DIAGNÓSTICO: Verificar state DESPUÉS de todo el ciclo
      try {
        console.log('[PRODUCT_VERIFY_AFTER_CYCLE] Checking state after full cycle...');
        const { data: afterCycleCheck } = await this.supabase
          .from('products')
          .select('id, cost_price')
          .in('id', Array.from(productMap.values()));

        if (afterCycleCheck) {
          for (const prod of afterCycleCheck.slice(0, 3)) {
            console.log(`  [AFTER_CYCLE] ${prod.id}: cost_price=${prod.cost_price}`);
          }
        }
      } catch (error) {
        console.log(`[AFTER_CYCLE_ERROR] ${(error as Error).message}`);
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
        .select('id_empresa, id_centro, id_tipo_comg, id_complementog, product_id');

      const productMap = new Map<string, string>();
      (mappings || []).forEach((m: any) => {
        const key = `${m.id_empresa}|${m.id_centro}|${m.id_tipo_comg}|${m.id_complementog}`;
        productMap.set(key, m.product_id);
      });

      let successCount = 0;

      for (const ventaId of ventaIds) {
        try {
          const [ventaData] = await conn.query(`
            SELECT vd.id_venta, vd.serie, vd.id_tiquet, vd.fecha_venta, vd.hora
            FROM ventadirecta vd WHERE vd.id_venta = ?
          `, [ventaId]);

          const venta = (ventaData as any[])[0];
          if (!venta) continue;

          const [lineasData] = await conn.query(`
            SELECT id_linea, id_complementog, id_empresa, id_centro, id_tipo_comg, cantidad, precio, PVPTiquet, precio_compra, avgiva, descuento
            FROM ventadir_comg WHERE id_venta = ?
          `, [ventaId]);

          const lineas = lineasData as any[];
          if (lineas.length === 0) continue;

          // Obtener método de pago de pagoscobros
          const [pagosData] = await conn.query(`
            SELECT DISTINCT pc.id_modo_pago, mp.modo_pago
            FROM pagoscobros pc
            LEFT JOIN modo_pago mp ON pc.id_modo_pago = mp.id_modo_pago
            WHERE pc.id_venta = ?
            LIMIT 1
          `, [ventaId]);

          const paymentMethod = (pagosData as any[])[0]?.modo_pago || 'unknown';

          // Construir sale_date combinando fecha + hora, sin perder la zona horaria local
          const fechaObj = new Date(venta.fecha_venta);
          const year = fechaObj.getFullYear();
          const month = String(fechaObj.getMonth() + 1).padStart(2, '0');
          const day = String(fechaObj.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;
          const timeStr = venta.hora || '00:00:00';
          const saleDateISO = `${dateStr}T${timeStr}`;

          // Calcular totales usando avgiva por línea
          const subtotal = lineas.reduce((sum: number, l: any) => sum + (l.cantidad * l.precio), 0);
          const tax = lineas.reduce((sum: number, l: any) => sum + (l.cantidad * (l.PVPTiquet - l.precio)), 0);
          const total = lineas.reduce((sum: number, l: any) => sum + (l.cantidad * l.PVPTiquet), 0);

          const payload = {
            sysme_id_venta: String(ventaId),
            sysme_serie: venta.serie || 'A',
            sysme_id_tiquet: venta.id_tiquet || '0001',
            sale_date: saleDateISO,
            subtotal: subtotal,
            tax: tax,
            total: total,
            payment_method: paymentMethod,
            lineas: lineas.map((l: any) => ({
              sysme_id_venta: String(ventaId),
              sysme_id_linea: String(l.id_linea),
              product_id: productMap.get(`${l.id_empresa}|${l.id_centro}|${l.id_tipo_comg}|${l.id_complementog}`),
              quantity: l.cantidad,
              unit_sale_price: l.PVPTiquet,
              unit_cost_at_time: l.precio_compra || null,
              tax_rate: l.avgiva,
              discount: l.descuento || 0,
              total_sale: l.cantidad * l.PVPTiquet,
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
