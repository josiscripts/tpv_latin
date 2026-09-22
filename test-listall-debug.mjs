import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

function loadEnv() {
  const env = {};
  const files = ['.env.local', '.env'];
  for (const file of files) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      content.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          env[key.trim()] = valueParts.join('=').trim();
        }
      });
      break;
    }
  }
  return env;
}

const env = loadEnv();
const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY
);

async function debug() {
  console.log('\n🐛 DEBUG: TIPOS Y VALORES\n');

  const { data } = await supabase
    .from('sales')
    .select('id, sysme_id_venta, sale_date')
    .order('sale_date', { ascending: false })
    .limit(5);

  console.log('Últimas 5 ventas (primeras del query):');
  data.forEach((sale, i) => {
    console.log(`\n${i+1}. Supabase ID: ${sale.id}`);
    console.log(`   sysme_id_venta value: ${sale.sysme_id_venta}`);
    console.log(`   sysme_id_venta type: ${typeof sale.sysme_id_venta}`);
    console.log(`   sysme_id_venta === 1: ${sale.sysme_id_venta === 1}`);
    console.log(`   sysme_id_venta == 1: ${sale.sysme_id_venta == 1}`);
    console.log(`   String(sysme_id_venta) === "1": ${String(sale.sysme_id_venta) === "1"}`);
  });

  // Find all records
  console.log('\n\n📊 BÚSQUEDA EN TODO EL DATASET:\n');

  const { data: all } = await supabase
    .from('sales')
    .select('id, sysme_id_venta, sale_date')
    .eq('source', 'sysme');

  const venta1 = all.find(s => s.sysme_id_venta === 1);
  const venta1str = all.find(s => String(s.sysme_id_venta) === '1');
  const venta1loose = all.find(s => s.sysme_id_venta == 1);

  console.log(`Con === 1: ${venta1 ? '✅ ENCONTRADA' : '❌ NO encontrada'}`);
  console.log(`Con String === "1": ${venta1str ? '✅ ENCONTRADA' : '❌ NO encontrada'}`);
  console.log(`Con == 1: ${venta1loose ? '✅ ENCONTRADA' : '❌ NO encontrada'}`);

  if (venta1str) {
    console.log(`\nDetalles: sysme_id_venta=${venta1str.sysme_id_venta} (${typeof venta1str.sysme_id_venta})`);
  }

  console.log('\n✅ DEBUG COMPLETADO\n');
}

debug();
