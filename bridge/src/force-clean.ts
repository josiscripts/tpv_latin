import { createClient } from '@supabase/supabase-js';
import { config } from './config';

async function forceClean() {
  console.log('FORCE CLEANING SUPABASE...\n');

  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

  try {
    // Get all sales
    const { data: allSales } = await supabase
      .from('sales')
      .select('id, sysme_id_venta');

    console.log(`Total sales in DB: ${allSales?.length}`);

    if (allSales && allSales.length > 0) {
      const saleIds = allSales.map((s: any) => s.id);

      // Delete stock_movements
      console.log('Deleting stock_movements...');
      const { error: movError } = await supabase
        .from('stock_movements')
        .delete()
        .in('reference_id', saleIds);
      if (movError) console.error('movError:', movError);

      // Delete sale_lines
      console.log('Deleting sale_lines...');
      const { error: lineError } = await supabase
        .from('sale_lines')
        .delete()
        .in('sale_id', saleIds);
      if (lineError) console.error('lineError:', lineError);

      // Delete sales
      console.log('Deleting sales...');
      const { error: salesError } = await supabase
        .from('sales')
        .delete()
        .in('id', saleIds);
      if (salesError) console.error('salesError:', salesError);

      console.log('✓ All deleted');
    }

    // Reset cursor
    console.log('Resetting cursor...');
    const { error: cursorError } = await supabase
      .from('sync_state')
      .update({ last_finalized_sale_id: 0 })
      .eq('integration_name', 'sysme_bridge');

    if (cursorError) console.error('cursorError:', cursorError);
    else console.log('✓ Cursor reset');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

forceClean();
