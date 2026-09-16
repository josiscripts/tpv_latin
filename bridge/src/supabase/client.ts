import axios, { AxiosInstance } from 'axios';
import { config } from '../config';

export interface SupabaseClient {
  processSale(payload: any): Promise<any>;
  getSyncState(): Promise<any>;
  updateSyncState(lastFinalizedSaleId: string): Promise<void>;
  testConnection(): Promise<boolean>;
  lookupProductMapping(idEmpresa: string, idCentro: string, idTipoComg: string, idComplementog: string): Promise<string | null>;
}

class SupabaseClientImpl implements SupabaseClient {
  private apiClient: AxiosInstance;
  private supabaseUrl: string;
  private serviceKey: string;

  constructor() {
    this.supabaseUrl = config.supabase.url;
    this.serviceKey = config.supabase.serviceKey;

    this.apiClient = axios.create({
      baseURL: `${this.supabaseUrl}/rest/v1`,
      headers: {
        'apikey': this.serviceKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.apiClient.get('/sales?select=id&limit=1');
      console.log('[SUPABASE] ✓ Connection test successful');
      return true;
    } catch (error) {
      console.error('[SUPABASE] ✗ Connection test failed:', (error as Error).message);
      return false;
    }
  }

  async processSale(payload: any): Promise<any> {
    try {
      console.log(`[SUPABASE] Processing sale ${payload.sysme_id_venta} via Edge Function...`);

      // Llamar a Edge Function transaccional
      const edgeFunctionUrl = `${this.supabaseUrl}/functions/v1/sysme-bridge-sync`;

      const response = await axios.post(
        edgeFunctionUrl,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.serviceKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Edge Function failed');
      }

      console.log(`[SUPABASE] Sale ${payload.sysme_id_venta} processed successfully (transactional)`);
      return { saleId: response.data.saleId, success: true };
    } catch (error) {
      console.error(`[SUPABASE] Error processing sale:`, (error as Error).message);
      throw error;
    }
  }

async getSyncState(): Promise<any> {
    try {
      const response = await this.apiClient.get(
        `/sync_state?integration_name=eq.sysme_bridge&select=*`
      );
      return response.data[0] || { last_finalized_sale_id: null };
    } catch (error) {
      console.error('[SUPABASE] Error getting sync state:', (error as Error).message);
      throw error;
    }
  }

  async updateSyncState(lastFinalizedSaleId: string): Promise<void> {
    try {
      await this.apiClient.patch(
        `/sync_state?integration_name=eq.sysme_bridge`,
        {
          last_finalized_sale_id: lastFinalizedSaleId,
          last_sync_at: new Date().toISOString(),
          status: 'idle',
        }
      );
      console.log(`[SUPABASE] Updated sync state cursor to ${lastFinalizedSaleId}`);
    } catch (error) {
      console.error('[SUPABASE] Error updating sync state:', (error as Error).message);
      throw error;
    }
  }

  async lookupProductMapping(
    idEmpresa: string,
    idCentro: string,
    idTipoComg: string,
    idComplementog: string
  ): Promise<string | null> {
    try {
      const query = `id_empresa=eq.${idEmpresa}&id_centro=eq.${idCentro}&id_tipo_comg=eq.${idTipoComg}&id_complementog=eq.${idComplementog}&select=product_id`;
      const response = await this.apiClient.get(`/sysme_product_map?${query}`);

      if (response.data.length === 0) {
        console.warn(`[SUPABASE] Product mapping not found: ${idEmpresa}/${idCentro}/${idTipoComg}/${idComplementog}`);
        return null;
      }

      const productId = response.data[0].product_id;
      console.log(`[SUPABASE] Found product mapping: ${productId}`);
      return productId;
    } catch (error) {
      console.error(`[SUPABASE] Error looking up product mapping:`, (error as Error).message);
      return null;
    }
  }
}

export function createSupabaseClient(): SupabaseClient {
  return new SupabaseClientImpl();
}
