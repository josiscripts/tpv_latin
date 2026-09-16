import { createClient } from '@supabase/supabase-js';
import { config } from './config';

async function resetCursor() {
  console.log('Reseteando cursor a 0...\n');

  const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

  const { error } = await supabase
    .from('sync_state')
    .update({ last_finalized_sale_id: 0, status: 'idle' })
    .eq('integration_name', 'sysme_bridge');

  if (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  }

  console.log('✓ Cursor reseteado a 0\n');
  process.exit(0);
}

resetCursor();
