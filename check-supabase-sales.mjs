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
  env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function checkSales() {
  console.log('\n🔍 VERIFICACIÓN: DATOS REALES EN SUPABASE\n');

  // 1. Total de ventas
  console.log('1️⃣  VENTAS TOTALES:');
  const { data: allSales, error: allError } = await supabase
    .from('sales')
    .select('id, source, sysme_id_venta, sale_date, total, status');

  if (allError) {
    console.error('Error:', allError.message);
    return;
  }

  console.log(`   Total: ${allSales.length}`);

  const bySysme = allSales.filter(s => s.source === 'sysme');
  const byLatinPos = allSales.filter(s => s.source === 'latin_pos');

  console.log(`   - Sysme: ${bySysme.length}`);
  console.log(`   - Latin_pos: ${byLatinPos.length}`);

  // 2. Date range
  console.log('\n2️⃣  RANGO DE FECHAS:');
  const dates = allSales
    .map(s => new Date(s.sale_date).getTime())
    .sort((a, b) => a - b);

  if (dates.length > 0) {
    const minDate = new Date(dates[0]);
    const maxDate = new Date(dates[dates.length - 1]);
    console.log(`   Mínima: ${minDate.toDateString()}`);
    console.log(`   Máxima: ${maxDate.toDateString()}`);
  }

  // 3. Sale lines
  console.log('\n3️⃣  LÍNEAS DE VENTA:');
  const { data: allLines } = await supabase
    .from('sale_lines')
    .select('id, sale_id', { count: 'exact' });

  console.log(`   Total líneas: ${allLines.length}`);

  // 4. Ventas sin líneas
  const ventasConLineas = new Set(allLines.map(l => l.sale_id));
  const ventasSinLineas = allSales.filter(v => !ventasConLineas.has(v.id));
  console.log(`   Ventas sin líneas: ${ventasSinLineas.length}`);

  // 5. Primeras ventas Sysme
  console.log('\n4️⃣  PRIMERAS VENTAS SYSME:');
  const sysmeSorted = bySysme.sort((a, b) =>
    (a.sysme_id_venta || 0) - (b.sysme_id_venta || 0)
  );

  sysmeSorted.slice(0, 3).forEach(sale => {
    console.log(`   ID=${sale.sysme_id_venta} Date=${new Date(sale.sale_date).toDateString()} Total=${sale.total}`);
  });

  // 6. Últimas ventas Sysme
  console.log('\n5️⃣  ÚLTIMAS VENTAS SYSME:');
  sysmeSorted.slice(-3).forEach(sale => {
    console.log(`   ID=${sale.sysme_id_venta} Date=${new Date(sale.sale_date).toDateString()} Total=${sale.total}`);
  });

  // 7. Venta Sysme 1
  console.log('\n6️⃣  VENTA SYSME ID 1:');
  const sysme1 = bySysme.find(s => s.sysme_id_venta === 1);
  if (sysme1) {
    console.log(`   ✅ Encontrada`);
    console.log(`   ID Supabase: ${sysme1.id}`);
    console.log(`   Fecha: ${new Date(sysme1.sale_date).toLocaleString()}`);
    console.log(`   Total: ${sysme1.total}`);
    console.log(`   Status: ${sysme1.status}`);
  } else {
    console.log(`   ❌ NO encontrada`);
  }

  // 8. Venta intermedia
  console.log('\n7️⃣  VENTA SYSME INTERMEDIA (ID~150):');
  const intermedia = sysmeSorted.find(s => Math.abs((s.sysme_id_venta || 0) - 150) < 30);
  if (intermedia) {
    console.log(`   ✅ Encontrada`);
    console.log(`   ID Sysme: ${intermedia.sysme_id_venta}`);
    console.log(`   Fecha: ${new Date(intermedia.sale_date).toLocaleString()}`);
    console.log(`   Total: ${intermedia.total}`);
  } else {
    console.log(`   ❌ NO encontrada`);
  }

  // 9. Venta Sysme 334
  console.log('\n8️⃣  VENTA SYSME ID 334 (MÁS RECIENTE):');
  const sysme334 = bySysme.find(s => s.sysme_id_venta === 334);
  if (sysme334) {
    console.log(`   ✅ Encontrada`);
    console.log(`   Fecha: ${new Date(sysme334.sale_date).toLocaleString()}`);
    console.log(`   Total: ${sysme334.total}`);
  } else {
    console.log(`   ❌ NO encontrada`);
  }

  // 10. Venta sin líneas
  console.log('\n9️⃣  VENTA SIN LÍNEAS:');
  if (ventasSinLineas.length > 0) {
    const sinLineas = ventasSinLineas[0];
    console.log(`   ✅ Encontrada`);
    console.log(`   ID Sysme: ${sinLineas.sysme_id_venta}`);
    console.log(`   Fecha: ${new Date(sinLineas.sale_date).toLocaleString()}`);
    console.log(`   Total: ${sinLineas.total}`);
  } else {
    console.log(`   ❌ No hay ventas sin líneas (todas tienen líneas)`);
  }

  console.log('\n✅ VERIFICACIÓN COMPLETADA\n');
}

checkSales();
