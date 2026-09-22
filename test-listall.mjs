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

async function testListAll() {
  console.log('\n📋 TEST: listAll() QUERY\n');

  // Replicate the exact query from salesService.listAll()
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

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log(`Total sales returned: ${data.length}`);
  console.log(`Expected: 329 (328 sysme + 1 latin_pos)\n`);

  // Verify by source
  const sysmeSales = data.filter(s => s.source === 'sysme');
  const latinSales = data.filter(s => s.source === 'latin_pos');

  console.log(`Sysme sales: ${sysmeSales.length}`);
  console.log(`Latin_pos sales: ${latinSales.length}`);

  // Check first few
  console.log('\n🔝 PRIMERAS 3 VENTAS (orden por sale_date DESC):');
  data.slice(0, 3).forEach((sale, i) => {
    console.log(`${i+1}. ID=${sale.sysme_id_venta} Source=${sale.source} Date=${sale.sale_date} Lines=${(sale.sale_lines || []).length}`);
  });

  // Check last few
  console.log('\n🔚 ÚLTIMAS 3 VENTAS (orden por sale_date DESC):');
  data.slice(-3).forEach((sale, i) => {
    console.log(`${data.length - 2 + i}. ID=${sale.sysme_id_venta} Source=${sale.source} Date=${sale.sale_date} Lines=${(sale.sale_lines || []).length}`);
  });

  // Check venta Sysme 1
  console.log('\n🔍 BÚSQUEDA: VENTA SYSME ID 1');
  const venta1 = data.find(s => s.sysme_id_venta === 1);
  if (venta1) {
    console.log(`✅ ENCONTRADA en posición ${data.indexOf(venta1) + 1}`);
    console.log(`   Source: ${venta1.source}`);
    console.log(`   Date: ${venta1.sale_date}`);
    console.log(`   Total: ${venta1.total}`);
    console.log(`   Lines: ${(venta1.sale_lines || []).length}`);
  } else {
    console.log(`❌ NO encontrada`);
  }

  // Check venta Sysme 334
  console.log('\n🔍 BÚSQUEDA: VENTA SYSME ID 334');
  const venta334 = data.find(s => s.sysme_id_venta === 334);
  if (venta334) {
    console.log(`✅ ENCONTRADA en posición ${data.indexOf(venta334) + 1}`);
    console.log(`   Date: ${venta334.sale_date}`);
    console.log(`   Total: ${venta334.total}`);
    console.log(`   Lines: ${(venta334.sale_lines || []).length}`);
  } else {
    console.log(`❌ NO encontrada`);
  }

  // Check a sale without lines
  console.log('\n🔍 BÚSQUEDA: VENTA SIN LÍNEAS');
  const noLines = data.find(s => (!s.sale_lines || s.sale_lines.length === 0));
  if (noLines) {
    console.log(`✅ ENCONTRADA: Sysme ID ${noLines.sysme_id_venta}`);
    console.log(`   Date: ${noLines.sale_date}`);
    console.log(`   Total: ${noLines.total}`);
    console.log(`   Lines: ${(noLines.sale_lines || []).length}`);
  } else {
    console.log(`❌ NO encontrada (todas tienen líneas)`);
  }

  console.log('\n✅ TEST COMPLETADO\n');
}

testListAll();
