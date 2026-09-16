import { createClient } from '@supabase/supabase-js';
import { config } from './config';

async function cleanup() {
  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

  console.log('Limpiando venta 4...\n');

  // Obtener sale_id para venta 4
  const { data: sales } = await supabase
    .from('sales')
    .select('id')
    .eq('sysme_id_venta', '4');

  if (sales && sales.length > 0) {
    const saleIds = sales.map((s: any) => s.id);

    // Eliminar movimientos
    await supabase.from('stock_movements').delete().in('reference_id', saleIds);

    // Eliminar líneas
    await supabase.from('sale_lines').delete().in('sale_id', saleIds);

    // Eliminar venta
    await supabase.from('sales').delete().in('id', saleIds);

    console.log('✓ Venta 4 limpiada');
  }

  process.exit(0);
}

cleanup();
