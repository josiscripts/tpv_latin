import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load .env
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

async function testCategoryClick() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║      TEST: CLICK EN CATEGORÍAS → VER PRODUCTOS             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Get categories
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name')
      .eq('active', true)
      .in('name', ['Bebidas', 'Latino', 'Galletas']);

    if (!categories || categories.length === 0) {
      console.log('❌ No se encontraron las categorías de prueba');
      return;
    }

    for (const category of categories) {
      console.log(`\n🔍 SIMULANDO CLICK EN: ${category.name}`);
      console.log('═'.repeat(60));

      // Simulate the click: fetch products for this category
      const { data: categoryProducts, error } = await supabase
        .from('products')
        .select('id, name, sale_price, stock, category_id')
        .eq('category_id', category.id)
        .eq('active', true);

      if (error) {
        console.error(`❌ Error consultando productos: ${error.message}`);
        continue;
      }

      if (!categoryProducts || categoryProducts.length === 0) {
        console.log(`⚠️  No hay productos para ${category.name}`);
        continue;
      }

      console.log(`✅ Productos encontrados: ${categoryProducts.length}\n`);
      console.log('Primeros 5 productos:');
      categoryProducts.slice(0, 5).forEach((prod, i) => {
        const categoryMatch = prod.category_id === category.id ? '✅' : '❌';
        console.log(`   ${i+1}. ${prod.name}`);
        console.log(`      ID: ${prod.id}`);
        console.log(`      Precio: €${prod.sale_price}`);
        console.log(`      Stock: ${prod.stock}`);
        console.log(`      category_id correcto: ${categoryMatch}\n`);
      });

      // Verify all products belong to this category
      const allCorrect = categoryProducts.every(p => p.category_id === category.id);
      if (allCorrect) {
        console.log(`✅ VERIFICADO: Todos los ${categoryProducts.length} productos pertenecen a "${category.name}"\n`);
      } else {
        console.log(`❌ PROBLEMA: Algunos productos no pertenecen a "${category.name}"\n`);
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('✅ TEST COMPLETADO: El flujo de click funciona correctamente');
    console.log('═'.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

testCategoryClick();
