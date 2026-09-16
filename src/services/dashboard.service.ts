import { supabase } from '@/lib/supabase';

export const dashboardService = {
  async getTodayStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Total de ventas del día
    const { data: salesData, error: salesError } = await supabase
      .from('sales')
      .select('id, total')
      .eq('status', 'completed')
      .gte('sale_date', today.toISOString())
      .lt('sale_date', tomorrow.toISOString());

    if (salesError) throw salesError;

    // Beneficio del día (desde sale_lines)
    let profitData: any[] = [];
    if (salesData && salesData.length > 0) {
      const { data, error: profitError } = await supabase
        .from('sale_lines')
        .select('gross_profit')
        .in('sale_id', salesData.map((s) => s.id));

      if (profitError) throw profitError;
      profitData = data || [];
    }

    const totalSales = salesData?.reduce((sum, s) => sum + Number(s.total), 0) || 0;
    const totalProfit = profitData?.reduce((sum, p) => sum + Number(p.gross_profit || 0), 0) || 0;

    return {
      totalSales,
      totalProfit,
      totalItems: salesData?.length || 0,
    };
  },

  async getWeeklySalesData() {
    const data = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const { data: sales, error } = await supabase
        .from('sales')
        .select('total')
        .eq('status', 'completed')
        .gte('sale_date', date.toISOString())
        .lt('sale_date', nextDate.toISOString());

      if (error) throw error;

      const total = sales?.reduce((sum, s) => sum + Number(s.total), 0) || 0;
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

      data.push({
        d: dayNames[date.getDay()],
        v: total,
      });
    }

    return data;
  },

  async getCriticalStockProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .is('deleted_at', null);

    if (error) throw error;

    const filtered = (data || [])
      .filter((p) => Number(p.stock) <= Number(p.min_stock))
      .sort((a, b) => Number(a.stock) - Number(b.stock));

    return filtered;
  },

  async getTopSellingProducts(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from('sale_lines')
      .select(`
        product_id,
        quantity,
        products(id, name, category_id, categories(name))
      `)
      .gte(
        'created_at',
        startDate.toISOString()
      )
      .order('quantity', { ascending: false })
      .limit(10);

    if (error) throw error;

    // Agregar por producto
    const grouped: Record<string, { name: string; quantity: number; category: string }> = {};

    data?.forEach((line) => {
      const productId = line.product_id;
      const product = line.products as any;
      const category = product?.categories?.name || 'Sin categoría';

      if (!grouped[productId]) {
        grouped[productId] = {
          name: product?.name || 'Desconocido',
          quantity: 0,
          category,
        };
      }
      grouped[productId].quantity += Number(line.quantity);
    });

    return Object.values(grouped).sort((a, b) => b.quantity - a.quantity);
  },

  async getMonthlySalesData(months = 6) {
    const data = [];
    const today = new Date();
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const nextDate = new Date(date.getFullYear(), date.getMonth() + 1, 1);

      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('id, total')
        .eq('status', 'completed')
        .gte('sale_date', date.toISOString())
        .lt('sale_date', nextDate.toISOString());

      if (salesError) throw salesError;

      let profits: any[] = [];
      if (sales && sales.length > 0) {
        const { data: profitsData, error: profitsError } = await supabase
          .from('sale_lines')
          .select('gross_profit')
          .in('sale_id', sales.map((s) => s.id));

        if (profitsError) throw profitsError;
        profits = profitsData || [];
      }

      const totalSales = sales?.reduce((sum, s) => sum + Number(s.total), 0) || 0;
      const totalProfit = profits?.reduce((sum, p) => sum + Number(p.gross_profit || 0), 0) || 0;

      data.push({
        m: monthNames[date.getMonth()],
        sales: totalSales,
        profit: totalProfit,
      });
    }

    return data;
  },

  async getTotalInventoryValue() {
    const { data, error } = await supabase
      .from('products')
      .select('stock, cost_price')
      .is('deleted_at', null);

    if (error) throw error;

    const total = data?.reduce((sum, p) => sum + Number(p.stock) * Number(p.cost_price), 0) || 0;
    return total;
  },

  async getStockStats() {
    const { data, error } = await supabase
      .from('products')
      .select('stock, min_stock')
      .is('deleted_at', null);

    if (error) throw error;

    const totalUnits = data?.reduce((sum, p) => sum + Number(p.stock), 0) || 0;
    const criticalCount = data?.filter((p) => Number(p.stock) <= Number(p.min_stock)).length || 0;

    return {
      totalUnits,
      criticalCount,
    };
  },
};
