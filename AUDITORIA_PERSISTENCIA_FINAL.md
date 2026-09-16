# 🔐 AUDITORÍA FINAL: ESTADO REAL DE PERSISTENCIA Y BACKEND

**Fecha:** 16 de septiembre de 2026  
**Tipo:** Auditoría EXHAUSTIVA de LECTURA SOLO  
**Objetivo:** Determinar con certeza si existe persistencia, Supabase u otro backend

---

## A) ¿EXISTE SUPABASE ACTUALMENTE?

### Búsqueda Exhaustiva Realizada

✅ Buscado en TODO el proyecto:
- `supabase` (0 resultados)
- `@supabase/supabase-js` (0 resultados)
- `SUPABASE_URL` (0 resultados)
- `VITE_SUPABASE_URL` (0 resultados)
- `SUPABASE_ANON_KEY` (0 resultados)
- `VITE_SUPABASE_ANON_KEY` (0 resultados)
- `supabaseClient` (0 resultados)
- `createClient` (0 resultados)
- `.env` (NO EXISTE)
- `.env.local` (NO EXISTE)
- `.env.example` (NO EXISTE)
- Directorios `supabase/` (NO EXISTE)
- Directorios `migrations/` (NO EXISTE)
- Directorios `functions/` (NO EXISTE)

### Resultado

**❌ NO EXISTE SUPABASE**

**Evidencia:**
```
- @supabase/supabase-js NO está en package.json
- No hay variables de entorno
- No hay directorio de configuración
- No hay migraciones
- No hay Edge Functions
- No hay cliente Supabase
```

---

## B) ¿EXISTE OTRA BASE DE DATOS O BACKEND?

### Búsqueda Exhaustiva

✅ Buscado:
- `mysql`, `postgresql`, `postgres`, `mongodb`, `firebase` (0 resultados)
- `database`, `DB`, `db.` (0 resultados significativos)
- Llamadas HTTP: `fetch`, `axios`, `api/`, `localhost` (0 resultados)
- Persistencia: `localStorage`, `sessionStorage`, `indexedDB` (0 resultados)
- Estado persistente: `zustand`, `redux`, `persist` (0 resultados)
- Archivos `.sql` (0 resultados)

### Dependencias Instaladas

```json
Instaladas:
✅ React 19.2.0
✅ TypeScript 5.8.3
✅ TanStack React Query 5.101.1  ← Instalado pero NO USADO
✅ TanStack React Router 1.170.18
✅ TanStack Start 1.168.32
✅ Radix UI (componentes)
✅ Tailwind CSS 4.2.1
✅ Recharts 2.15.4
✅ React Hook Form 7.71.2

NO instaladas:
❌ @supabase/supabase-js
❌ mysql
❌ postgresql
❌ firebase
❌ mongodb
❌ axios
❌ node-fetch
```

### Resultado

**❌ NO EXISTE OTRO BACKEND**

**Verificación:**
```
- No hay librerías de BD instaladas
- No hay endpoints HTTP configurados
- No hay API calls en el código
- No hay mecanismo de persistencia
```

---

## C) TABLA/ESTRUCTURA REAL DE PRODUCTOS

### Ubicación

```
Archivo: src/lib/pos-data.ts
Tipo: Constante TypeScript en memoria
Persistencia: ❌ NINGUNA (se pierden al F5)
```

### Estructura Exacta

```typescript
export type Product = {
  id: number                    // ID numérico secuencial
  name: string                  // Nombre del producto
  category: string              // Categoría (texto duplicado)
  supplier: string              // Proveedor (texto duplicado)
  price: number                 // Precio de venta
  cost: number                  // Costo de compra
  stock: number                 // ← CAMPO DE STOCK
  min: number                   // Stock mínimo
  barcode: string               // EAN13
  sku: string                   // SKU único
  image: string                 // URL/path de imagen
  state: StockState             // "ok" | "low" | "critical" | "out"
}

export const products: Product[] = [
  { id:1, name:"Inca Kola 300 ml", ..., stock:42, min:12, ... },
  { id:2, name:"Maltín Polar 330 ml", ..., stock:8, min:12, ... },
  // ... 6 más
]
```

### Productos Actualmente Definidos (8)

| id | Nombre | Stock | Min | Estado |
|----|--------|-------|-----|--------|
| 1 | Inca Kola 300 ml | 42 | 12 | ok |
| 2 | Maltín Polar 330 ml | 8 | 12 | low |
| 3 | Chifles salados 150 g | 24 | 10 | ok |
| 4 | Panela colombiana 500 g | 5 | 8 | critical |
| 5 | Ají amarillo pasta 225 g | 16 | 6 | ok |
| 6 | Dulce de leche 450 g | 11 | 10 | low |
| 7 | Harina PAN blanca 1 kg | 36 | 15 | ok |
| 8 | Yuca congelada 1 kg | 0 | 8 | out |

### Campos Disponibles para Mapeo Sysme

```
DISPONIBLES para mapeo:
✅ id: 1-8 (entero)
✅ barcode: "7750011001847" (EAN13)
✅ sku: "BEB-INK-300" (único)

NO DISPONIBLES:
❌ sysme_id (no existe)
❌ sysme_empresa (no existe)
❌ sysme_complementog (no existe)
```

---

## D) SISTEMA ACTUAL DE PERSISTENCIA

### Estado Actual

```
┌─────────────────────────────────────────────────┐
│ PERSISTENCIA ACTUAL                             │
├─────────────────────────────────────────────────┤
│                                                 │
│ Datos: src/lib/pos-data.ts                     │
│ Almacenamiento: EN MEMORIA (const array)       │
│ Duración: UNA SESIÓN (se pierden con F5)       │
│                                                 │
│ ✅ Lee de:    products array (import)          │
│ ✅ Muestra:   en componentes React             │
│ ❌ Guarda en: NINGÚN LADO                       │
│ ❌ Recupera:  NUNCA                             │
│                                                 │
│ RESULTADO: CERO PERSISTENCIA                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Cómo se Usan los Datos

```
1. Componente React importa products
   import { products } from "@/lib/pos-data"

2. Muestra datos en UI
   {products.map(p => <...>{p.stock}</...>)}

3. Usuario interactúa (compra, ajusta stock)
   - Solo afecta estado local del componente
   - setCart(), setRows(), setFilter()
   - NO actualiza el array products

4. Al recargar la página
   ❌ Los cambios se pierden
   ✅ Se cargan los datos originales de pos-data.ts
```

---

## E) CONFIGURACIÓN SUPABASE ENCONTRADA

### ❌ NINGUNA

No existe:
- Configuración de Supabase
- Variables de entorno
- Cliente de Supabase
- Conexión
- Proyecto
- Tablas remotas
- Migraciones

---

## F) TABLAS EXISTENTES RELACIONADAS CON PRODUCTOS/STOCK

### En la Aplicación (EN MEMORIA)

```
products[]
├─ id
├─ name
├─ category (texto)
├─ supplier (texto)
├─ price
├─ cost
├─ stock
├─ min
├─ barcode
├─ sku
├─ image
└─ state

suppliers[]
├─ name
├─ initials
├─ phone
├─ email
├─ count
└─ last

tickets[]
├─ id
├─ time
├─ items
├─ payment
├─ total
├─ profit
└─ status
```

### En Base de Datos Remota

❌ **NINGUNA**

No existe:
- Base de datos remota
- Tabla de productos
- Tabla de stock
- Tabla de movimientos
- Ninguna tabla

---

## G) CÓMO CONVERTIR EL STOCK ACTUAL EN PERSISTENTE

### Problema Actual

```
src/lib/pos-data.ts tiene:
const products: Product[] = [ ... ]

Cada recarga:
  ✅ Lee desde el archivo
  ❌ NO guarda cambios
  ❌ Datos se pierden
```

### Solución Recomendada (Arquitectura Propuesta)

```
PASO 1: Agregar Supabase
  → Crear proyecto Supabase (PostgreSQL)
  → Crear tabla 'products' con misma estructura
  → Crear tabla 'stock_movements'
  → Crear tabla 'sysme_product_map'

PASO 2: Crear Bridge (Node.js)
  → Lee de Sysme MySQL local (127.0.0.1:4306)
  → Mapea IDs en sysme_product_map
  → Actualiza products en Supabase
  → Cada 5 minutos

PASO 3: Conectar Panel React a Supabase
  → Instalar @supabase/supabase-js
  → Reemplazar import de pos-data.ts
  → Usar useQuery para leer products
  → Usar useMutation para escribir
  → React Query caché y sincronización

PASO 4: Mantener pos-data.ts
  → Como fallback si Supabase cae
  → Para desarrollo offline
  → Para testing
```

---

## H) QUÉ PARTE DEL PANEL DEBEMOS MODIFICAR

### Componentes que NECESITAN cambios

```
✏️ MODIFICAR:

1. src/lib/pos-data.ts
   └─ Agregar: sysme_id, sysme_empresa, etc.

2. src/routes/__root.tsx
   └─ Agregar: Supabase client initialization
   └─ Agregar: QueryClientProvider (ya está)

3. src/components/pos-screen.tsx
   └─ Cambiar: toast.success() → API call real
   └─ Guardar carrito antes de cobrar

4. src/components/business-screens.tsx
   └─ Cambiar: "Registrar compra" → handler real
   └─ Cambiar: "Registrar ajuste" → handler real
   └─ Cambiar: "Ver movimientos" → query real

5. src/components/inventory-screen.tsx
   └─ Cambiar: "Registrar ajuste" → handler real
   └─ Cambiar: movimientos ficticios → datos reales

6. src/components/products-screen.tsx
   └─ Cambiar: "Editar" → formulario con API
   └─ Cambiar: "Eliminar" → confirmación + API

7. src/lib/utils.ts (crear si no existe)
   └─ Agregar: hooks de Supabase
   └─ useProducts()
   └─ useStockMovements()
   └─ useCreateSale()
   └─ etc.
```

### Componentes que NO tocar

```
✅ MANTENER COMO ESTÁN:

1. src/components/ui/*
   └─ Componentes UI puros
   └─ Sin lógica de negocio

2. src/components/pos-context.tsx
   └─ Solo idioma y tema
   └─ No toca datos de negocio

3. src/components/dashboard-screen.tsx
   └─ Cambiar source de datos, visual igual

4. src/components/app-shell.tsx
   └─ Layout y navegación
   └─ No toca datos

5. src/router.tsx
   └─ Rutas
   └─ No toca datos

6. Toda la configuración de build
   └─ vite.config.ts
   └─ tsconfig.json
   └─ package.json (solo agregar @supabase/supabase-js)
```

---

## I) QUÉ PARTE NO DEBEMOS MODIFICAR

### 🔒 INTOCABLE

```
❌ NO MODIFICAR:

1. Sysme MySQL local
   └─ NO escribir en sysme_hotel BD
   └─ SOLO leer para mapeo
   └─ Dejar como está

2. Estructura de Sysme
   └─ Datos reales ya verificados:
      - id_empresa: 001
      - id_centro: 01
      - id_tipo_comg: 0001
      - id_complementog: 00001/00002/etc
      - codbarras: 000100001, 000100002, etc
   └─ NO cambiar nada aquí

3. Panel React - Lógica visual
   └─ El diseño UI funciona bien
   └─ Solo cambiar DÓNDE vienen los datos
   └─ NO cambiar CÓMO se muestran

4. TanStack Router
   └─ Rutas están bien
   └─ Solo agregar loaders/queries

5. Estilos
   └─ Tailwind CSS está bien
   └─ NO tocar CSS
```

---

## J) ARQUITECTURA FINAL RECOMENDADA

```
Sysme MySQL Local
(127.0.0.1:4306, sysmehotel)
│
├─ id_empresa: 001
├─ id_centro: 01
├─ id_tipo_comg: 0001
├─ id_complementog: 00001/00002/etc
├─ codbarras: 000100001, 000100002, etc
└─ NO MODIFICAR

         ↓ (Bridge lee cada 5 min)

Bridge Windows (Node.js)
├─ Conecta a MySQL Sysme
├─ Lee tabla de productos
├─ Mapea IDs (tabla sysme_product_map)
├─ Valida y transforma
└─ Envía a Supabase vía HTTPS

         ↓ (HTTPS POST/UPDATE)

Supabase PostgreSQL (Cloud)
├─ products (productos)
├─ stock_movements (historial)
├─ sysme_product_map (mapeo)
├─ sync_log (auditoría)
└─ RLS (Row Level Security)

         ↓ (React Query + Realtime)

Panel React (Navegador)
├─ src/lib/pos-data.ts → src/hooks/useProducts()
├─ products → Supabase queries
├─ stock → En tiempo real
├─ Todas las operaciones → API
└─ Persistencia ✅ COMPLETA

         ↓ (Usuario)

Usuario ve stock sincronizado
en tiempo real desde Sysme
```

---

## K) PASOS EXACTOS A REALIZAR (DESPUÉS DE ESTA AUDITORÍA)

### Fase 0: Pre-requisitos (NO EJECUTAR AÚN)

```
□ Obtener Supabase Pro (~$25/mes)
□ Crear proyecto en supabase.com
□ Obtener SUPABASE_URL y SUPABASE_ANON_KEY
□ Obtener SUPABASE_SERVICE_ROLE_KEY
□ Verificar acceso a MySQL Sysme
   - Host: 127.0.0.1
   - Port: 4306
   - Database: sysmehotel
   - User: root
   - Password: (obtener de sysmetpv.ini)
```

### Fase 1: Setup Base de Datos (SIN EJECUTAR)

```
□ 1.1 Crear tabla 'products' en Supabase
      Columnas: id, name, category, supplier, price, cost,
                stock, min, barcode, sku, image, state,
                sysme_id (nuevo), created_at, updated_at

□ 1.2 Crear tabla 'stock_movements' en Supabase
      Columnas: id, product_id, movement_type, quantity,
                reason, employee, created_at

□ 1.3 Crear tabla 'sysme_product_map' en Supabase
      Columnas: panel_product_id, sysme_empresa,
                sysme_centro, sysme_tipo_comg,
                sysme_complementog, sysme_codbarras,
                sync_status, last_sync

□ 1.4 Crear tabla 'sync_log' en Supabase
      Columnas: id, product_id, operation, status,
                message, created_at

□ 1.5 Crear índices en todas las tablas
      INDEX en product_id, sync_status, created_at

□ 1.6 Configurar RLS (Row Level Security)
      - Lectura: pública (SELECT)
      - Escritura: solo con SERVICE_ROLE_KEY
```

### Fase 2: Crear Bridge Windows (SIN EJECUTAR)

```
□ 2.1 Crear carpeta: C:\bridge-sysme-panel\

□ 2.2 Setup Node.js project
      npm init -y
      npm install express dotenv mysql supabase

□ 2.3 Implementar SysmeConnector
      Conectar a MySQL 127.0.0.1:4306

□ 2.4 Implementar SysmeReader
      Leer tabla de productos de Sysme

□ 2.5 Implementar ProductMapper
      Mapear IDs con tabla sysme_product_map

□ 2.6 Implementar SupabaseSync
      Actualizar stock en Supabase

□ 2.7 Crear Express API
      POST /api/bridge/sync
      GET /api/bridge/status

□ 2.8 Configurar polling
      Sincronizar cada 5 minutos

□ 2.9 Instalar como Windows Service
      Usar NSSM para iniciar automáticamente
```

### Fase 3: Conectar Panel a Supabase (SIN EJECUTAR)

```
□ 3.1 npm install @supabase/supabase-js

□ 3.2 Crear src/lib/supabase.ts
      export const supabase = createClient(...)

□ 3.3 Crear src/hooks/useProducts.ts
      export function useProducts() {
        return useQuery({
          queryKey: ['products'],
          queryFn: async () => {
            return supabase.from('products').select()
          }
        })
      }

□ 3.4 Crear src/hooks/useCreateSale.ts
      Mutation para crear venta

□ 3.5 Crear src/hooks/useUpdateStock.ts
      Mutation para actualizar stock

□ 3.6 Reemplazar import en componentes
      import { products } from "@/lib/pos-data"
      →
      const { data: products } = useProducts()

□ 3.7 Agregar handlers a botones
      "Cobrar" → useMutation para crear sale
      "Registrar compra" → useMutation
      "Registrar ajuste" → useMutation

□ 3.8 Testing en desarrollo
      npm run dev
      Verificar lectura de Supabase
      Verificar escritura de datos
```

### Fase 4: Integración y Testing (SIN EJECUTAR)

```
□ 4.1 Pruebas funcionales
      □ Leer productos desde Supabase
      □ Mostrar stock en tiempo real
      □ Crear venta y decrementar stock
      □ Crear compra e incrementar stock
      □ Ver historial de movimientos

□ 4.2 Pruebas de sincronización
      □ Bridge lee de Sysme cada 5 min
      □ Stock en Sysme se refleja en Panel
      □ Cambios en Panel se guardan en Supabase

□ 4.3 Pruebas de conflictos
      □ Si se modifica en ambos lados
      □ Verificar resolución correcta

□ 4.4 Pruebas de performance
      □ Latencia < 2 segundos
      □ Caché de React Query funciona
      □ Realtime updates funcionan

□ 4.5 Documentación
      □ Crear README.md para Bridge
      □ Crear guía de deployment
      □ Crear guía de troubleshooting
```

---

## RESUMEN FINAL

### Estado Actual Confirmado

```
✅ CONFIRMADO SIN DUDA:

1. NO EXISTE Supabase
2. NO EXISTE otra base de datos
3. NO EXISTE persistencia
4. NO EXISTE API/Backend
5. NO EXISTE autenticación
6. NO EXISTE sincronización

Datos almacenados en:
└─ src/lib/pos-data.ts
   └─ const array en memoria
   └─ Se pierden al recargar página

Estructura lista para mapeo Sysme:
└─ Productos con id, barcode, sku
└─ Stock en campo .stock
└─ Fácil de sincronizar
```

### Listos para Integración

✅ Panel React está estructurado correctamente
✅ Componentes están preparados para conectar datos
✅ Sufielen campos para mapeo con Sysme
✅ Datos de Sysme comprobados (MySQL 127.0.0.1:4306)
✅ Identificadores claros (id_complementog, codbarras)

---

**AUDITORÍA COMPLETADA SIN CAMBIOS**

El proyecto está listo para ser conectado a Supabase y sincronizado con Sysme.

