import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { stockService } from './stock.service';

type Purchase = Database['public']['Tables']['purchases']['Row'];
type PurchaseInsert = Database['public']['Tables']['purchases']['Insert'];
type PurchaseLineInsert = Database['public']['Tables']['purchase_lines']['Insert'];

// Funciones RPC de compras: no están en los tipos generados; se tipan aquí.
// La autorización y las dependencias se comprueban en la base de datos.
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<{ data: T; error: { message: string } | null }> {
  const client = supabase as unknown as {
    rpc: (name: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const res = await client.rpc(fn, args);
  return { data: res.data as T, error: res.error };
}

export const purchasesService = {
  async listAll() {
    const { data, error } = await supabase
      .from('purchases')
      .select(`
        *,
        suppliers(id, name),
        purchase_lines(
          id,
          product_id,
          quantity,
          unit_cost,
          tax_rate,
          total,
          products(id, name, sku)
        )
      `)
      .order('purchase_date', { ascending: false });

    if (error) throw error;
    return data;
  },

  async search(query: string) {
    const searchTerm = `%${query}%`;
    const { data, error } = await supabase
      .from('purchases')
      .select(`
        *,
        suppliers(id, name),
        purchase_lines(
          id,
          product_id,
          quantity,
          unit_cost,
          tax_rate,
          total,
          products(id, name, sku)
        )
      `)
      .or(`invoice_number.ilike.${searchTerm},suppliers.name.ilike.${searchTerm}`)
      .order('purchase_date', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async searchByProduct(productQuery: string) {
    const searchTerm = `%${productQuery}%`;
    const { data: products, error: productError } = await supabase
      .from('products')
      .select('id')
      .or(`name.ilike.${searchTerm},sku.ilike.${searchTerm}`)
      .limit(100);

    if (productError) throw productError;

    if (!products || products.length === 0) return [];

    const productIds = products.map((p) => p.id);

    const { data, error } = await supabase
      .from('purchase_lines')
      .select(`
        purchase_id,
        purchases(
          *,
          suppliers(id, name),
          purchase_lines(
            id,
            product_id,
            quantity,
            unit_cost,
            tax_rate,
            total,
            products(id, name, sku)
          )
        )
      `)
      .in('product_id', productIds);

    if (error) throw error;

    const purchases = data
      ?.map((line) => (line.purchases as any))
      .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i) || [];

    return purchases;
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('purchases')
      .select(`
        *,
        suppliers(id, name),
        purchase_lines(
          *,
          products(id, name, sku, cost_price)
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async createPurchase(
    purchase: PurchaseInsert,
    lines: Array<Omit<PurchaseLineInsert, 'purchase_id'>>
  ) {
    // Crear cabecera de compra
    const purchaseData: any = {
      supplier_id: purchase.supplier_id,
      purchase_date: purchase.purchase_date,
      subtotal: purchase.subtotal,
      tax: purchase.tax,
      total: purchase.total,
      status: purchase.status,
      notes: purchase.notes,
      invoice_number: purchase.invoice_number,
      type: (purchase as any).type || 'factura',
    };

    const { data: createdPurchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert([purchaseData])
      .select()
      .single();

    if (purchaseError) throw purchaseError;

    // Crear líneas con el ID de la compra
    const linesToInsert = lines.map((line) => ({
      ...line,
      purchase_id: createdPurchase.id,
    }));

    const { data: linesData, error: linesError } = await supabase
      .from('purchase_lines')
      .insert(linesToInsert)
      .select();

    if (linesError) throw linesError;

    return { purchase: createdPurchase, lines: linesData };
  },

  // Recibir: transición de estado en la base de datos (idempotente). No modifica stock.
  async receivePurchase(purchaseId: string) {
    const { data, error } = await rpc<{ changed: boolean; status: string }>('receive_purchase', {
      p_purchase_id: purchaseId,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  // Rechazar: estado 'rejected' con motivo opcional. No borra la compra ni toca inventario.
  async rejectPurchase(purchaseId: string, reason?: string) {
    const { data, error } = await rpc<{ changed: boolean; status: string }>('reject_purchase', {
      p_purchase_id: purchaseId,
      p_reason: reason?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  // Eliminar: solo administradores; bloqueado si hay documentos, extracciones, movimientos o recepción.
  async deletePurchase(purchaseId: string) {
    const { data, error } = await rpc<{ deleted: boolean }>('delete_purchase', {
      p_purchase_id: purchaseId,
    });
    if (error) throw new Error(error.message);
    return data;
  },

  async updateStatus(id: string, status: 'draft' | 'received' | 'partial' | 'cancelled') {
    const { data, error } = await supabase
      .from('purchases')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};
