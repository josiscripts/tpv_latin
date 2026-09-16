import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { stockService } from './stock.service';

type Purchase = Database['public']['Tables']['purchases']['Row'];
type PurchaseInsert = Database['public']['Tables']['purchases']['Insert'];
type PurchaseLineInsert = Database['public']['Tables']['purchase_lines']['Insert'];

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
    const { data: purchaseData, error: purchaseError } = await supabase
      .from('purchases')
      .insert([purchase])
      .select()
      .single();

    if (purchaseError) throw purchaseError;

    // Crear líneas con el ID de la compra
    const linesToInsert = lines.map((line) => ({
      ...line,
      purchase_id: purchaseData.id,
    }));

    const { data: linesData, error: linesError } = await supabase
      .from('purchase_lines')
      .insert(linesToInsert)
      .select();

    if (linesError) throw linesError;

    return { purchase: purchaseData, lines: linesData };
  },

  async receivePurchase(purchaseId: string) {
    // Obtener la compra y sus líneas
    const purchase = await this.getById(purchaseId);

    // Crear movimientos de stock para cada línea
    for (const line of purchase.purchase_lines || []) {
      const productId = typeof line.product_id === 'string'
        ? line.product_id
        : line.products?.id;

      if (productId) {
        const product = await supabase
          .from('products')
          .select('stock, cost_price')
          .eq('id', productId)
          .single();

        if (product.data) {
          const newStock = Number(product.data.stock) + Number(line.quantity);

          // Crear movimiento
          await stockService.createMovement({
            product_id: productId,
            movement_type: 'purchase',
            quantity: Number(line.quantity),
            previous_stock: Number(product.data.stock),
            resulting_stock: newStock,
            reference_type: 'purchase',
            reference_id: purchaseId,
            source: 'latin_pos',
          });

          // Actualizar stock
          await supabase
            .from('products')
            .update({
              stock: newStock,
              cost_price: Number(line.unit_cost),
            })
            .eq('id', productId);
        }
      }
    }

    // Marcar compra como recibida
    const { data, error } = await supabase
      .from('purchases')
      .update({ status: 'received' })
      .eq('id', purchaseId)
      .select()
      .single();

    if (error) throw error;
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
