import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type StockMovement = Database['public']['Tables']['stock_movements']['Row'];
type StockMovementInsert = Database['public']['Tables']['stock_movements']['Insert'];

export const stockService = {
  async getProductStock(productId: string) {
    const { data, error } = await supabase
      .from('products')
      .select('stock, min_stock')
      .eq('id', productId)
      .single();

    if (error) throw error;
    return data;
  },

  async getMovements(productId?: string) {
    let query = supabase.from('stock_movements').select('*');

    if (productId) {
      query = query.eq('product_id', productId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async createMovement(movement: StockMovementInsert) {
    const { data, error } = await supabase
      .from('stock_movements')
      .insert([movement])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async registerAdjustment(productId: string, quantityDelta: number, reason: string) {
    const product = await this.getProductStock(productId);
    const newStock = Number(product.stock) + quantityDelta;

    // Crear movimiento
    const movement = await this.createMovement({
      product_id: productId,
      movement_type: 'adjustment',
      quantity: quantityDelta,
      previous_stock: Number(product.stock),
      resulting_stock: newStock,
      source: 'latin_pos',
      reason,
    });

    // Actualizar stock del producto
    const { error: updateError } = await supabase
      .from('products')
      .update({ stock: newStock })
      .eq('id', productId);

    if (updateError) throw updateError;

    return movement;
  },

  async getStockStatus(productId: string) {
    const { data, error } = await supabase
      .from('products')
      .select('stock, min_stock')
      .eq('id', productId)
      .single();

    if (error) throw error;

    const stock = Number(data.stock);
    const minStock = Number(data.min_stock);

    let state: 'ok' | 'low' | 'critical' | 'out' = 'ok';
    if (stock === 0) {
      state = 'out';
    } else if (stock <= minStock) {
      state = 'critical';
    } else if (stock <= minStock * 1.5) {
      state = 'low';
    }

    return { stock, minStock, state };
  },
};
