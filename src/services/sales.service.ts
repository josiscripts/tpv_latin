import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { stockService } from './stock.service';

type SaleInsert = Database['public']['Tables']['sales']['Insert'];
type SaleLineInsert = Database['public']['Tables']['sale_lines']['Insert'];

interface CartItem {
  productId: string;
  quantity: number;
  unitSalePrice: number;
  discount?: number;
  taxRate?: number;
}

export const salesService = {
  async listAll() {
    const { data, error } = await supabase
      .from('sales')
      .select(`
        *,
        sale_lines(
          *,
          products(id, name, sku)
        )
      `)
      .order('sale_date', { ascending: false });

    if (error) throw error;
    return data;
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('sales')
      .select(`
        *,
        sale_lines(
          *,
          products(id, name, sku, cost_price)
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async createSale(
    sale: Omit<SaleInsert, 'source'> & { source: 'latin_pos' | 'sysme' },
    cartItems: CartItem[]
  ) {
    // Crear cabecera de venta
    const { data: saleData, error: saleError } = await supabase
      .from('sales')
      .insert([sale])
      .select()
      .single();

    if (saleError) throw saleError;

    // Crear líneas de venta con rentabilidad histórica
    const linesToInsert: SaleLineInsert[] = [];

    for (const item of cartItems) {
      // Obtener datos actuales del producto
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('cost_price, stock')
        .eq('id', item.productId)
        .single();

      if (productError) throw productError;

      const unitCostAtTime = Number(product.cost_price);
      const totalSale = item.quantity * item.unitSalePrice;
      const totalCost = item.quantity * unitCostAtTime;
      const grossProfit = totalSale - totalCost;
      const grossMarginPercent = totalSale > 0 ? (grossProfit / totalSale) * 100 : 0;

      linesToInsert.push({
        sale_id: saleData.id,
        product_id: item.productId,
        quantity: item.quantity,
        unit_sale_price: item.unitSalePrice,
        unit_cost_at_time: unitCostAtTime,
        tax_rate: item.taxRate || 10,
        discount: item.discount || 0,
        total_sale: totalSale,
        total_cost: totalCost,
        gross_profit: grossProfit,
        gross_margin_percent: grossMarginPercent,
      });
    }

    const { data: linesData, error: linesError } = await supabase
      .from('sale_lines')
      .insert(linesToInsert)
      .select();

    if (linesError) throw linesError;

    // Actualizar stock y crear movimientos
    for (const item of cartItems) {
      const { data: product } = await supabase
        .from('products')
        .select('stock')
        .eq('id', item.productId)
        .single();

      if (product) {
        const newStock = Number(product.stock) - item.quantity;

        // Crear movimiento
        await stockService.createMovement({
          product_id: item.productId,
          movement_type: 'sale',
          quantity: -item.quantity,
          previous_stock: Number(product.stock),
          resulting_stock: newStock,
          reference_type: 'sale',
          reference_id: saleData.id,
          source: 'latin_pos',
        });

        // Actualizar stock
        await supabase
          .from('products')
          .update({ stock: newStock })
          .eq('id', item.productId);
      }
    }

    return { sale: saleData, lines: linesData };
  },

  async cancelSale(saleId: string) {
    // Obtener la venta
    const sale = await this.getById(saleId);

    // Revertir stock para cada línea
    for (const line of sale.sale_lines || []) {
      const productId = typeof line.product_id === 'string'
        ? line.product_id
        : line.products?.id;

      if (productId) {
        const { data: product } = await supabase
          .from('products')
          .select('stock')
          .eq('id', productId)
          .single();

        if (product) {
          const newStock = Number(product.stock) + Number(line.quantity);

          // Crear movimiento de cancelación
          await stockService.createMovement({
            product_id: productId,
            movement_type: 'sale_cancellation',
            quantity: Number(line.quantity),
            previous_stock: Number(product.stock),
            resulting_stock: newStock,
            reference_type: 'sale',
            reference_id: saleId,
            source: 'latin_pos',
          });

          // Actualizar stock
          await supabase
            .from('products')
            .update({ stock: newStock })
            .eq('id', productId);
        }
      }
    }

    // Marcar venta como cancelada
    const { data, error } = await supabase
      .from('sales')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', saleId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getDailySales(date?: Date) {
    const queryDate = date || new Date();
    const startOfDay = new Date(queryDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(queryDate);
    endOfDay.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .gte('sale_date', startOfDay.toISOString())
      .lte('sale_date', endOfDay.toISOString())
      .eq('status', 'completed')
      .order('sale_date', { ascending: false });

    if (error) throw error;
    return data;
  },
};
