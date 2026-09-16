import { getFinalizedSalesAfterCursor, getSaleDetail, SysmeLineaCompleta } from '../sysme/reader';
import { SupabaseClient } from '../supabase/client';
import { config } from '../config';

export interface SyncResult {
  success: boolean;
  salasProcessed: number;
  errors: any[];
  lastCursor: string | null;
}

export class SyncProcessor {
  constructor(private supabase: SupabaseClient) {}

  async synchronize(): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      salasProcessed: 0,
      errors: [],
      lastCursor: null,
    };

    try {
      // 1. Obtener estado de sincronización actual
      const syncState = await this.supabase.getSyncState();
      const cursor = syncState.last_finalized_sale_id;

      console.log(`[SYNC] Starting sync with cursor: ${cursor || 'null'}`);

      // 2. Obtener IDs de ventas finalizadas después del cursor
      const saleIds = await getFinalizedSalesAfterCursor(cursor, config.bridge.batchSize);

      if (saleIds.length === 0) {
        console.log('[SYNC] No new sales to process');
        return result;
      }

      console.log(`[SYNC] Found ${saleIds.length} sales to process`);

      // 3. Procesar cada venta
      for (const saleId of saleIds) {
        try {
          await this.processSale(saleId);
          result.salasProcessed++;
          result.lastCursor = saleId.toString();

          // Actualizar cursor después de cada venta exitosa
          await this.supabase.updateSyncState(saleId.toString());
        } catch (error) {
          console.error(`[SYNC] Error processing sale ${saleId}:`, error);
          result.errors.push({
            saleId,
            error: (error as Error).message,
          });

          // NO avanzar cursor si hay error
          break;
        }
      }

      result.success = result.errors.length === 0;
    } catch (error) {
      console.error('[SYNC] Synchronization failed:', error);
      result.success = false;
      result.errors.push((error as Error).message);
    }

    return result;
  }

  private async processSale(idVenta: number): Promise<void> {
    console.log(`[SYNC] Processing sale ${idVenta}`);

    // 1. Obtener detalle de la venta desde Sysme
    const lineas = await getSaleDetail(idVenta);

    if (lineas.length === 0) {
      throw new Error(`No lines found for sale ${idVenta}`);
    }

    // 2. Validar y mapear productos
    const mappedLineas = await Promise.all(
      lineas.map(async (linea) => {
        const productId = await this.mapSysmeProductToLocal(
          linea.id_empresa,
          linea.id_centro,
          linea.id_tipo_comg,
          linea.id_complementog
        );

        if (!productId) {
          throw new Error(
            `Product not mapped: ${linea.id_empresa}/${linea.id_centro}/${linea.id_tipo_comg}/${linea.id_complementog}`
          );
        }

        return {
          ...linea,
          product_id: productId,
        };
      })
    );

    // 3. Calcular totales
    const subtotal = mappedLineas.reduce((sum, l) => sum + (l.total || 0), 0);
    const tax = mappedLineas.reduce((sum, l) => sum + ((l.PVPTiquet * l.cantidad * l.avgiva) / 100), 0);

    // 4. Crear payload
    const payload = {
      sysme_id_venta: idVenta.toString(),
      sysme_serie: 'UNKNOWN',
      sysme_id_tiquet: idVenta.toString(),
      sale_date: lineas[0].fecha_venta || new Date().toISOString(),
      subtotal,
      tax,
      total: subtotal + tax,
      lineas: mappedLineas,
    };

    // 5. Procesar en Supabase
    await this.supabase.processSale(payload);

    console.log(`[SYNC] Sale ${idVenta} processed successfully`);
  }

  private async mapSysmeProductToLocal(
    idEmpresa: string,
    idCentro: string,
    idTipoComg: string,
    idComplementog: string
  ): Promise<string | null> {
    console.log(`[SYNC] Looking up product: ${idEmpresa}/${idCentro}/${idTipoComg}/${idComplementog}`);
    return await this.supabase.lookupProductMapping(idEmpresa, idCentro, idTipoComg, idComplementog);
  }
}
