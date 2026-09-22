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

async function check() {
  console.log('\n🔍 VERIFICACIÓN: sysme_id_venta FIELD\n');

  const { data } = await supabase
    .from('sales')
    .select('id, source, sysme_id_venta, created_at, sale_date')
    .eq('source', 'sysme')
    .order('created_at')
    .limit(15);

  console.log('Primeras 15 ventas Sysme:');
  console.log('sysme_id_venta | created_at | sale_date');
  console.log('─'.repeat(50));

  let nullCount = 0;
  let filledCount = 0;

  data.forEach((s) => {
    if (s.sysme_id_venta === null) {
      nullCount++;
    } else {
      filledCount++;
    }
    const id = s.sysme_id_venta || 'NULL';
    const created = new Date(s.created_at).toDateString();
    const saleDate = new Date(s.sale_date).toDateString();
    console.log(`${String(id).padEnd(15)} | ${created} | ${saleDate}`);
  });

  console.log('\n📊 RESUMEN:');
  console.log(`   Con sysme_id_venta: ${filledCount}`);
  console.log(`   NULL: ${nullCount}`);
  console.log(`   % Filled: ${((filledCount / (filledCount + nullCount)) * 100).toFixed(1)}%`);

  console.log('\n✅ VERIFICACIÓN COMPLETADA\n');
}

check();
