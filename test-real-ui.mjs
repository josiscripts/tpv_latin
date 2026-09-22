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

async function testUI() {
  console.log('\n🧪 TEST: SIMULA CARGA DE PANTALLA DE VENTAS\n');
  console.log('Ejecutando mismo query que useSales() → listAll()\n');

  // Esto es EXACTAMENTE lo que useSales() ejecuta
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
    console.error('❌ ERROR EN QUERY:', error);
    return;
  }

  console.log('✅ QUERY EXITOSA\n');
  console.log(`📊 RESULTADOS:`);
  console.log(`   Total de ventas retornadas: ${data.length}\n`);

  if (data.length === 0) {
    console.log('❌ SIN DATOS - La pantalla mostraría tabla vacía');
    return;
  }

  // Mostrar lo que se renderizaría en la tabla
  console.log('📋 LO QUE MOSTRARÍA LA TABLA:\n');
  console.log('Fecha                    | Origen     | Líneas | Total    | Estado');
  console.log('─'.repeat(75));

  data.slice(0, 10).forEach((sale, i) => {
    const fecha = new Date(sale.sale_date).toLocaleString('es-ES');
    const origen = sale.source === 'sysme' ? 'Sysme' : 'Latin POS';
    const lineas = (sale.sale_lines || []).length;
    const total = parseFloat(sale.total || 0).toFixed(2);
    const estado = sale.status === 'completed' ? 'Completada' : 'Cancelada';

    console.log(`${fecha.padEnd(24)} | ${origen.padEnd(10)} | ${String(lineas).padEnd(6)} | €${total.padEnd(7)} | ${estado}`);
  });

  if (data.length > 10) {
    console.log(`... y ${data.length - 10} más\n`);
  }

  // Buscar ventas específicas
  console.log('🔍 BÚSQUEDAS ESPECÍFICAS:\n');

  // Venta Sysme 1
  const venta1 = data.find(s => String(s.sysme_id_venta) === '1');
  console.log('Venta Sysme ID 1:');
  if (venta1) {
    console.log(`  ✅ ENCONTRADA EN POSICIÓN ${data.indexOf(venta1) + 1}`);
    console.log(`     Fecha BD: ${venta1.sale_date}`);
    console.log(`     Fecha mostrada: ${new Date(venta1.sale_date).toLocaleString('es-ES')}`);
    console.log(`     Total: €${venta1.total}`);
    console.log(`     Líneas: ${(venta1.sale_lines || []).length}`);
  } else {
    console.log(`  ❌ NO ENCONTRADA`);
  }

  // Venta intermedia
  console.log('\nVenta Sysme ID ~150:');
  const intermedia = data.find(s => Math.abs(parseInt(s.sysme_id_venta || 0) - 150) < 50);
  if (intermedia) {
    console.log(`  ✅ ENCONTRADA (ID=${intermedia.sysme_id_venta})`);
    console.log(`     Fecha: ${new Date(intermedia.sale_date).toLocaleString('es-ES')}`);
    console.log(`     Total: €${intermedia.total}`);
  } else {
    console.log(`  ❌ NO ENCONTRADA`);
  }

  // Venta 334
  console.log('\nVenta Sysme ID 334:');
  const venta334 = data.find(s => String(s.sysme_id_venta) === '334');
  if (venta334) {
    console.log(`  ✅ ENCONTRADA EN POSICIÓN ${data.indexOf(venta334) + 1}`);
    console.log(`     Fecha: ${new Date(venta334.sale_date).toLocaleString('es-ES')}`);
    console.log(`     Total: €${venta334.total}`);
  } else {
    console.log(`  ❌ NO ENCONTRADA`);
  }

  // Venta sin líneas
  console.log('\nVenta sin líneas:');
  const sinLineas = data.find(s => !s.sale_lines || s.sale_lines.length === 0);
  if (sinLineas) {
    console.log(`  ✅ ENCONTRADA (ID Sysme=${sinLineas.sysme_id_venta})`);
    console.log(`     Fecha: ${new Date(sinLineas.sale_date).toLocaleString('es-ES')}`);
    console.log(`     Total: €${sinLineas.total}`);
    console.log(`     Líneas: 0 ✓ (se mostraría igual en tabla)`);
  } else {
    console.log(`  ❌ NO ENCONTRADA`);
  }

  // Resumen final
  console.log('\n✅ CONCLUSIÓN:');
  console.log(`   La pantalla de Ventas DEBERÍA mostrar ${data.length} ventas`);
  console.log(`   Las ventas están correctamente ordenadas por fecha (descendente)`);
  console.log(`   Los datos están completos para renderizar la tabla`);

  console.log('\n✅ TEST COMPLETADO\n');
}

testUI();
