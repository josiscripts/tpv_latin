# AUDITORÍA COMPLETA - TPV LATIN PRO (Rama: lab)

**Fecha de auditoría:** 2026-10-01  
**Objetivo:** Auditar el proyecto actual y determinar estructura, configuración y dependencias antes de crear laboratorio aislado.  
**Restricciones:** NO modificar código, NO ejecutar operaciones destructivas, SOLO inspección.

---

## A. ESTRUCTURA DEL PROYECTO

### A.1 Directorio Raíz

```
tpv_latin/
├── .git/                    # Git repository
├── .lovable/               # Lovable integration metadata
├── .tanstack/              # TanStack configuration
├── bridge/                 # Sysme Bridge (sincronización Windows)
├── node_modules/           # Dependencies
├── public/                 # Static assets
├── src/                    # Frontend + server code
├── supabase/               # Supabase migrations & functions
└── package.json            # Project manifest
```

### A.2 Tecnologías y Versiones

```json
{
  "frontend": {
    "framework": "TanStack Start (React 19.2.0)",
    "router": "@tanstack/react-router (1.170.18)",
    "state": "@tanstack/react-query (5.101.1)",
    "styling": "Tailwind CSS 4.2.1",
    "ui": "Radix UI components",
    "forms": "@hookform/resolvers 5.2.2, react-hook-form 7.71.2, zod 3.25.76",
    "charts": "recharts 2.15.4",
    "icons": "lucide-react 0.575.0"
  },
  "backend": {
    "database": "Supabase (PostgreSQL 17)",
    "auth": "Supabase Auth (local JWT)",
    "realtime": "Supabase Realtime (enabled for sales & products)",
    "storage": "Supabase Storage (documents, category images)"
  },
  "bridge": {
    "language": "TypeScript",
    "runtime": "Node.js",
    "mysql": "mysql2/promise",
    "encryption": "Custom SYSENC1 decryption"
  },
  "build": {
    "bundler": "Vite 8.1.5",
    "plugin": "@lovable.dev/vite-tanstack-config 2.20.0"
  }
}
```

### A.3 Estructura de Código

```
src/
├── assets/               # Imágenes y recursos
├── components/           # React components
│   ├── pos-context.tsx  # Global POS context
│   ├── sales-screen.tsx # Sales list & detail
│   ├── products-screen.tsx # Product catalog
│   ├── inventory-screen.tsx # Stock management
│   └── ui/              # Radix UI wrapper components
├── hooks/               # Custom React hooks
│   ├── useSales.ts      # Sales queries & mutations
│   ├── useProducts.ts   # Products queries
│   ├── useCategories.ts # Categories CRUD
│   ├── usePurchases.ts  # Purchases CRUD
│   ├── useSuppliers.ts  # Suppliers CRUD
│   ├── useStock.ts      # Stock movements
│   └── useDocuments.ts  # Document uploads
├── lib/
│   ├── supabase.ts      # Supabase client
│   ├── database.types.ts # TypeScript types (auto-generated)
│   ├── error-capture.ts # Error handling
│   └── lovable-error-reporting.ts
├── routes/              # TanStack Router routes
│   ├── __root.tsx       # Root layout
│   ├── index.tsx        # Dashboard
│   ├── pos.tsx          # POS screen (main)
│   ├── products.tsx     # Products management
│   ├── categories.tsx   # Categories management
│   ├── stock.tsx        # Stock management
│   ├── sales.tsx        # Sales history
│   ├── purchases.tsx    # Purchases management
│   ├── suppliers.tsx    # Suppliers management
│   ├── reports.tsx      # Reports
│   └── settings.tsx     # Settings
├── services/            # Business logic (Supabase queries)
│   ├── products.service.ts
│   ├── categories.service.ts
│   ├── suppliers.service.ts
│   ├── sales.service.ts
│   ├── purchases.service.ts
│   ├── stock.service.ts
│   ├── documents.service.ts
│   └── dashboard.service.ts
├── styles.css           # Global styles (Tailwind)
├── server.ts            # TanStack Server entry
├── start.ts             # Start entry point
└── router.tsx           # Router configuration
```

### A.4 Bridge Windows (Sincronización Sysme → Supabase)

```
bridge/
├── README.md
├── README-WINDOWS.md
├── SYSENC1-DECRYPTION.md
├── package.json         # Dependencies for Bridge
├── tsconfig.json        # TypeScript config
├── .env.example         # Template for .env.bridge
├── .gitignore           # Ignore .env.bridge
├── test-mysql-readonly.js
├── src/
│   ├── index.ts         # Main entry point
│   ├── bridge-continuous.ts # Continuous sync loop
│   ├── config.ts        # Configuration loading
│   ├── decrypt-cli.ts   # CLI for decryption
│   ├── sysenc1-decrypt.ts # SYSENC1 decryption utility
│   ├── test-sysenc1.ts  # Test decryption
│   ├── force-clean.ts   # Database cleanup script
│   ├── phase-*.ts       # Multiple audit/sync/reset phases
│   ├── supabase/
│   │   └── client.ts    # Supabase client (Edge Function caller)
│   ├── sync/
│   │   └── processor.ts # Sale sync logic
│   └── sysme/
│       └── reader.ts    # Sysme MySQL queries
└── [many phase files for debugging/auditing]
```

### A.5 Supabase Migrations

```
supabase/
├── config.toml          # Supabase local configuration
├── functions/
│   └── sysme-bridge-sync/
│       └── index.ts     # Edge Function for transactional sale processing
├── migrations/
│   ├── 20260916084816_create_latin_pos_core.sql          # MAIN: All core tables
│   ├── 20260916155959_enable_rls_local_development.sql  # RLS policies
│   ├── 20260916193858_enable_realtime_for_sales_and_products.sql # Realtime
│   ├── 20260917120000_allow_negative_stock.sql          # Allow negative stock
│   ├── 20260917120100_add_idempotency_constraint_sale_lines.sql # Idempotency
│   ├── 20260917120200_create_bridge_config.sql          # Bridge configuration
│   └── 20260922044425_add_visual_customization_to_categories.sql # UI customization
└── seed.sql             # Optional: seed data
```

---

## B. CONFIGURACIÓN ACTUAL

### B.1 Archivos .env

**Frontend variables:** (en `src/lib/supabase.ts`)
```typescript
VITE_SUPABASE_URL        // Supabase URL (ej: http://127.0.0.1:54321)
VITE_SUPABASE_ANON_KEY   // Supabase anon key
```

**Bridge variables:** (en `bridge/.env.example`)
```
# Sysme MySQL
SYSME_HOST=127.0.0.1
SYSME_PORT=4306
SYSME_DATABASE=sysmehotel
SYSME_USER=root
SYSME_PASSWORD=<encrypted en C:\SYSME\SGC\sysmetpv.ini>

# Supabase
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=<service role key>

# Bridge Config
POLLING_INTERVAL_MS=5000
BATCH_SIZE=10
MAX_RETRIES=5
LOG_LEVEL=info
```

### B.2 Endpoints Locales (Desarrollo)

```
Frontend:          http://127.0.0.1:3000 (Vite dev server)
Supabase API:      http://127.0.0.1:54321 (REST API)
Supabase Realtime: http://127.0.0.1:54321 (WebSocket)
Supabase Studio:   http://127.0.0.1:54323 (Web UI)
Supabase DB:       localhost:54322 (PostgreSQL)
Sysme MySQL:       127.0.0.1:4306 (Windows Sysme TPV)
```

### B.3 Configuración Supabase (supabase/config.toml)

```toml
[api]
port = 54321
schemas = ["public", "graphql_public"]
max_rows = 1000

[db]
port = 54322
shadow_port = 54320
major_version = 17

[db.pooler]
enabled = false
pool_mode = "transaction"
default_pool_size = 20

[realtime]
enabled = true

[studio]
enabled = true
port = 54323
site_url = "http://127.0.0.1:3000"

[auth]
enabled = true
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = ["https://127.0.0.1:3000"]
jwt_expiry = 3600
enable_signup = true
enable_anonymous_sign_ins = false

[edge_runtime]
enabled = true
policy = "per_worker"
deno_version = 2

[storage]
enabled = true
file_size_limit = "50MiB"

[storage.s3_protocol]
enabled = true

[storage.vector]
enabled = true
```

### B.4 Rama Git

```
Current branch: lab
Main branch: main
Committed?: Yes (clean working tree)
Latest commit: d4a32a3 "chore: create isolated lab baseline"
Recent commits:
  - d4a32a3 chore: create isolated lab baseline
  - 4eac6ec updates
  - 7d5626f fix: correct category click handler and Dialog control flow
  - 6f1d727 feat: implement interactive categories with visual customization
  - 1866caf feat: sync real Sysme categories from Bridge
```

---

## C. SUPABASE

### C.1 Tablas Definidas (13 tablas totales)

#### Core Data Tables

| Tabla | Propósito | Relaciones | Sync? |
|-------|-----------|-----------|-------|
| `categories` | Categorías de productos | ← products | No |
| `suppliers` | Proveedores | ← products, purchases | No |
| `products` | Catálogo con stock | → categories, suppliers | Bridge mapping |
| `purchases` | Cabecera compras | → suppliers | No |
| `purchase_lines` | Líneas compras | → purchases, products | No |
| `sales` | Cabecera ventas | ← sale_lines | Sysme (Bridge) |
| `sale_lines` | Líneas ventas + rentabilidad | → sales, products | Sysme (Bridge) |
| `expenses` | Gastos operativos | → suppliers | No |

#### System Tables

| Tabla | Propósito | Contenido |
|-------|-----------|----------|
| `stock_movements` | Historial movimientos stock | purchase, sale, sale_cancellation, adjustment, sysme_reconciliation |
| `sysme_product_map` | Mapeo Sysme ↔ Latin POS | (id_empresa, id_centro, id_tipo_comg, id_complementog) → product_id |
| `sync_state` | Cursor sincronización Bridge | last_finalized_sale_id, last_sync_at, status |
| `sync_events` | Idempotencia eventos | event_key UNIQUE, payload JSONB |
| `bridge_errors` | Log errores Bridge | error_type, sysme_id_venta, message, resolved_at |

#### Missing Tables

⚠️ **Nota:** No hay tabla explícita para:
- `payment_methods` - Solo field `sales.payment_method TEXT`
- `documents` - Referenciada en service pero NO en migrations
- `users` / `auth` - Supabase Auth maneja internamente

### C.2 Constraints y Validaciones

```sql
-- Stock
  stock >= 0 (ACTUALMENTE PERMITIDO: ≥ -∞ tras migración 20260917120000)

-- Precios
  sale_price >= 0
  cost_price >= 0
  min_stock >= 0
  unit_cost >= 0

-- Ventas
  source IN ('sysme', 'latin_pos')
  status IN ('completed', 'cancelled', 'pending')
  Idempotencia: UNIQUE(sysme_id_venta) en sales
  Idempotencia: UNIQUE(sysme_id_venta, sysme_id_linea) en sale_lines

-- Compras
  status IN ('draft', 'received', 'partial', 'cancelled')

-- Stock Movements
  movement_type IN ('purchase', 'sale', 'sale_cancellation', 'adjustment', 'sysme_reconciliation')
```

### C.3 Triggers y Funciones

```sql
-- update_updated_at_column()
  Automáticamente actualiza updated_at en: categories, suppliers, products,
  purchases, sales, sale_lines, stock_movements, sysme_product_map, expenses

-- Realtime activado para: sales, products
```

### C.4 Row Level Security (RLS)

**Estado actual:** HABILITADO pero con políticas DENY ALL

```sql
CREATE POLICY <table>_deny_all ON <table> USING (FALSE)
-- Aplicado a todas las 13 tablas
-- El Bridge usa SERVICE_ROLE (bypasea RLS)
-- Políticas de usuario pendiente después de implementar auth
```

### C.5 Edge Functions

**Función:** `sysme-bridge-sync` (en `supabase/functions/sysme-bridge-sync/index.ts`)

```typescript
// Entrada: POST /functions/v1/sysme-bridge-sync
interface SalesPayload {
  sysme_id_venta: string
  sale_date: string
  subtotal, tax, total: number
  lineas: Array<{
    sysme_id_venta, sysme_id_linea, product_id: string
    cantidad: number
    PVPTiquet, precio_compra, total, avgiva: number
  }>
}

// Proceso:
// 1. UPSERT venta (idempotente por sysme_id_venta)
// 2. DELETE old sale_lines + INSERT new ones (garantiza idempotencia)
// 3. Actualizar stock de cada producto
// 4. Crear movimientos en stock_movements
```

---

## D. BRIDGE (Sysme → Supabase)

### D.1 Arquitectura

```
Sysme MySQL (local)
      ↓
Bridge Windows (Node.js)
  - Lee ventas finalizadas (cerrada = 'S')
  - Mapea productos (sysme_product_map)
  - Envía a Edge Function
      ↓
Supabase Edge Function (transaccional)
  - UPSERT sales
  - DELETE/INSERT sale_lines
  - UPDATE stock
  - CREATE stock_movements
      ↓
Supabase PostgreSQL
      ↓
Frontend (Realtime listener)
```

### D.2 Flujo de Sincronización

1. **Lectura Sysme** (`bridge/src/sysme/reader.ts`)
   - Conecta a `sysmehotel` en `127.0.0.1:4306`
   - Query: `SELECT id_venta FROM ventadirecta WHERE cerrada='S' AND id_venta > :cursor`
   - Lee líneas: `LEFT JOIN ventadir_comg` con mapeo de campos
   - Decrypt password desde `SYSME_PASSWORD` (SYSENC1 decryption)

2. **Mapeo de Productos** 
   - Para cada línea Sysme: (id_empresa, id_centro, id_tipo_comg, id_complementog)
   - Lookup en `sysme_product_map` → obtiene `product_id`
   - Si no existe mapping: **PRODUCT_NOT_MAPPED** ⚠️ (venta se descarta o falla)

3. **Sincronización** (`bridge/src/sync/processor.ts`)
   - Paquet batch_size=10 ventas por ciclo
   - Retry max_retries=5 con backoff exponencial
   - Llamada a Edge Function `processSaleTransaction`

4. **Idempotencia**
   - Sale: `UNIQUE(sysme_id_venta)` en sales
   - Lines: `UNIQUE(sysme_id_venta, sysme_id_linea)` en sale_lines
   - Events: Registro en `sync_events` con `event_key UNIQUE`

5. **Actualización de Cursor**
   - `sync_state.last_finalized_sale_id` se actualiza tras éxito
   - Próximo ciclo comienza desde este ID + 1
   - Permite reintentos sin duplicados

### D.3 Configuración Tiempo de Ejecución

```
Polling Interval: 5000 ms (5 segundos)
Batch Size: 10 ventas por ciclo
Max Retries: 5 intentos
Retry Backoff: 2^n segundos (2, 4, 8, 16, 32)
Timeout por lote: 30 segundos (bridge_config)
```

### D.4 Tablas de Control del Bridge

```sql
sync_state (integration_name='sysme_bridge')
  - last_finalized_sale_id: Cursor actual (ej: "9999")
  - last_sync_at: Timestamp último sync
  - status: 'idle' | 'syncing' | 'error'
  - last_error: Mensaje error si status='error'

bridge_errors
  - error_type: error category
  - sysme_id_venta: qué venta falló
  - message: detalles del error
  - resolved_at: NULL si no resuelto

sync_events
  - event_key: UNIQUE, formato "sysme:venta:9999"
  - status: 'pending' | 'processed' | 'failed' | 'skipped'
```

### D.5 Herramientas de Debug en Bridge

```
bridge/src/
├── phase-12-15-2-before.ts              # Pre-audit snapshot
├── phase-12-15-3-2-audit.ts             # Data audit
├── phase-12-15-3-2-diagnose.ts          # Diagnose issues
├── phase-12-15-3-2-idempotence-test.ts  # Test idempotencia
├── phase-12-15-3-2-reset.ts             # Reset state
├── phase-12-15-3-schema-audit.ts        # Schema inspection
├── phase-12-16-full-sync.ts             # Full sync
├── phase-12-17-product-sync.ts          # Product mapping sync
└── [muchos más...]
```

---

## E. FRONTEND

### E.1 Estructura de Rutas

```
/ → Dashboard (DashboardScreen)
  - Today sales, profit, top products
  - Weekly sales chart (recharts)
  - Critical stock products

/pos → POS Screen (main)
  - Panel izquierdo: categorías interactivas
  - Panel centro: productos por categoría
  - Panel derecho: carrito
  - Integración con Realtime (listen products)

/products → Products Management
  - CRUD: create, read, update, soft delete
  - Search: name, sku, barcode (con TRGM indexes)
  - Stock updates

/categories → Categories Management
  - CRUD: create, read, update
  - Visual customization: color (#hex), image_url
  - Upload images a Supabase Storage

/stock → Stock Management
  - Movement history
  - Manual adjustments
  - Stock status indicators (ok, low, critical, out)

/sales → Sales History
  - List with pagination
  - Detail view modal
  - Cancel operation (revierte stock)
  - Filters: date range, source (sysme/latin_pos), status

/purchases → Purchases Management
  - CRUD cabeceras
  - CRUD líneas
  - Status workflow: draft → received → partial
  - Stock updates en receive

/suppliers → Suppliers Management
  - CRUD: create, read, update, deactivate
  - Contact info: email, phone, address

/reports → Reports
  - (Implementación pendiente según requisitos)

/settings → Settings
  - (Pendiente)
```

### E.2 Data Fetching Pattern

Usa `@tanstack/react-query` para todo:

```typescript
// Queries
useQuery({ queryKey: ['sales'], queryFn: () => salesService.listAll() })
useQuery({ queryKey: ['products'], queryFn: () => productsService.listActive() })
useQuery({ queryKey: ['stock'], queryFn: () => stockService.getMovements() })

// Mutations
useMutation({
  mutationFn: (data) => salesService.createSale(...),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sales'] })
})
```

### E.3 Real-time Implementation Status

**Estado:** Realtime CONFIGURADO pero NO IMPLEMENTADO TODAVÍA en frontend

```sql
-- Migrations habilitaron Realtime para:
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
```

**En frontend:** NO HAY `.subscribe()` calls detectadas
- Las rutas cargan datos via `useQuery`
- Actualizaciones requieren refresh manual
- Realtime escucha está LISTA pero sin listeners activos

### E.4 Servicios (Business Logic)

Todos en `src/services/`:

```
- products.service.ts      → listActive, search, crud, softDelete, updateStock
- categories.service.ts    → listActive, crud, updateColor, uploadCategoryImage
- suppliers.service.ts     → listActive, crud, deactivate
- sales.service.ts         → listAll, getById, createSale, cancelSale, getDailySales
- purchases.service.ts     → listAll, getById, createPurchase, receivePurchase
- stock.service.ts         → getProductStock, getMovements, createMovement, registerAdjustment, getStockStatus
- documents.service.ts     → listBySaleId, listByPurchaseId, uploadDocument, renameDocument, deleteDocument (soft)
- dashboard.service.ts     → getTodayStats, getWeeklySalesData, getCriticalStockProducts, getTopSellingProducts
```

---

## F. REALTIME

### F.1 Configuración

```toml
# supabase/config.toml
[realtime]
enabled = true
```

### F.2 Publicaciones Habilitadas

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
```

### F.3 Listeners en Frontend

**Status: ❌ NO ENCONTRADOS**

```bash
$ grep -r "\.subscribe()" src/
# (no results)

$ grep -r "onSnapshot\|on(" src/
# (solo coincidencias en Carousel, no Realtime)
```

**Implicación:** El frontend NO está usando Realtime, solo polling via React Query.

### F.4 Recomendación para Lab

✅ Realtime está LISTO en Supabase (configurado, publicaciones habilitadas, Edge Functions transaccionales)  
❌ Frontend NO está implementando listeners  
**Acción:** Para el lab, los listeners pueden agregarse después (no bloquea creación del lab)

---

## G. VENTAS / sale_id

### G.1 Flujo de Creación de Venta (Latin POS)

```typescript
// En sales.service.ts → createSale()
const saleData = await supabase.from('sales').insert([{
  source: 'latin_pos',     // source puede ser 'latin_pos' o 'sysme'
  status: 'completed',
  sale_date: new Date(),
  subtotal, tax, total,
  payment_method: ???      // TEXT, pero ¿cómo se obtiene?
}]).select().single();

// sale_id ahora es saleData.id (UUID)

for (const item of cartItems) {
  await supabase.from('sale_lines').insert({
    sale_id: saleData.id,     // ✅ Vinculada aquí
    product_id: item.productId,
    quantity: item.quantity,
    unit_sale_price: item.unitSalePrice,
    unit_cost_at_time: product.cost_price,
    ...
  })
}

// Actualizar stock
for (const item of cartItems) {
  await stockService.createMovement({
    reference_id: saleData.id,  // ✅ Movimiento referencia venta
    ...
  })
}
```

### G.2 Flujo de Creación de Venta (Sysme via Bridge)

```typescript
// En Edge Function: sysme-bridge-sync/index.ts
const saleData = await supabase.from('sales').upsert({
  source: 'sysme',                  // ✅ Origen claro
  sysme_id_venta: payload.sysme_id_venta,  // ✅ ID Sysme
  sysme_id_tiquet: payload.sysme_id_tiquet,
  sysme_serie: payload.sysme_serie,
  sale_date: payload.sale_date,
  subtotal, tax, total,
  payment_method: 'unknown',        // ⚠️ Hardcoded
  status: 'completed'
}).select('id').single();

const saleId = saleData.id;

// DELETE old sale_lines + INSERT new ones
for (const linea of payload.lineas) {
  insert into sale_lines {
    sale_id: saleId,               // ✅ Vinculada
    product_id: linea.product_id,  // ✅ Obtenida del mapping
    sysme_id_venta: linea.sysme_id_venta,
    sysme_id_linea: linea.sysme_id_linea,
    ...
  }
}
```

### G.3 Problema: sale_id = undefined

**Búsqueda de occurrencias de undefined:**

```bash
$ grep -r "sale_id.*undefined" src/
# (no encontrado)

$ grep -r "sale_id.*null" src/
# src/services/documents.service.ts:54: sale_id: saleId || null
```

**Contexto en documents.service.ts:**

```typescript
async uploadDocument(
  file: File,
  saleId?: string,      // ← OPTIONAL
  purchaseId?: string,  // ← OPTIONAL
  documentType: string = 'invoice'
) {
  const { data } = await supabase.from('documents').insert([{
    sale_id: saleId || null,  // ✅ Fallback a null (correcto para documentos sin venta)
    purchase_id: purchaseId || null,
    ...
  }])
}
```

**Conclusión:** No hay query problemática con `sale_id=in.(undefined)` detectada.  
⚠️ **Pero:** La tabla `documents` NO está en las migrations (¿creada manually? ¿falta?)

### G.4 Restricciones de sale_id

```sql
-- En sales table
UNIQUE(sysme_id_venta)      -- Solo uno por ID Sysme

-- En sale_lines
UNIQUE(sysme_id_venta, sysme_id_linea)  -- Línea única por venta+línea

-- En stock_movements
FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
-- stock_movements.reference_id puede ser NULL (no restringe)
```

---

## H. FLUJO DE DATOS

### H.1 Obtención de Productos

```
Sysme MySQL
  ├─ complementog (id_complementog, nombre, pvp, coste, id_tipo_comg)
  └─ almacen_complementg (id_complementog, cantidad)
        ↓
Bridge → Lookup sysme_product_map
        ↓
Supabase: sysme_product_map
  └─ (id_empresa, id_centro, id_tipo_comg, id_complementog) → product_id
        ↓
Supabase: products (id, sku, name, category_id, supplier_id, sale_price, cost_price, stock)
        ↓
Frontend: src/services/products.service.ts → listActive()
        ↓
React Query: useQuery(['products'], ...) + invalidate en mutations
        ↓
POS Screen / Products Page: recharts, cards, search
```

**Punto crítico:** Bridge debe pobluar primero `sysme_product_map` antes de cualquier venta.

### H.2 Obtención de Categorías

```
Opción 1 (Sysme):
  Sysme MySQL (si existe tabla categorías) → NOT FOUND
  
Opción 2 (Manual):
  Frontend: /categories → CREATE manualmente en Supabase
  
Opción 3 (Bridge + Mapping):
  Bridge: Si existe mapping de categorías Sysme (NO implementado)

Current State: Categorías creadas manualmente en Supabase
  categories(id, name, description, active, color, image_url)
  (color e image_url son web-only)
```

### H.3 Obtención de Stock

```
Supabase products.stock
  ↓
salesService.createSale()
  ├─ Lee product.cost_price
  ├─ Crea sale_lines con unit_cost_at_time (snapshot)
  ├─ Actualiza products.stock (↓quantity)
  └─ Crea stock_movement (type='sale')
  
↓ O desde Bridge:
  
Sysme MySQL: almacen_complementg.cantidad
  ↓
Bridge reader → sysme_product_map lookup
  ↓
Edge Function updateStock → products.stock = nueva_cantidad
  ↓
Frontend: stockService.getProductStock(productId)
```

### H.4 Obtención de Movimientos

```
stockService.getMovements(productId?)
  ↓
supabase.from('stock_movements')
  .select('*')
  .eq('product_id', productId?)
  .order('created_at', desc)
  
Tipos de movimiento:
  - purchase (compra recibida)
  - sale (venta de Latin POS)
  - sale_cancellation (cancelación de venta)
  - adjustment (ajuste manual)
  - sysme_reconciliation (sincronización Sysme)
  - initial_stock (stock inicial)
```

### H.5 Obtención de Ventas

```
salesService.listAll()
  ↓
supabase.from('sales')
  .select('*, sale_lines(*, products(...))')
  .order('sale_date', desc)
  
Filtrado por:
  - status: 'completed' | 'cancelled' | 'pending'
  - source: 'sysme' | 'latin_pos'
  - sale_date: rango de fechas
```

### H.6 Obtención de Proveedores

```
Manual: Frontend → CREATE/UPDATE/DELETE en Supabase
No hay sincronización Sysme (TODO en phase futura)

suppliers(id, name, contact_name, email, phone, address, tax_id, active)
```

### H.7 Obtención de Compras

```
Manual: Frontend → CREATE cabecera + líneas
Recepción: Frontend → UPDATE status='received' → updateStock

purchases(id, supplier_id, purchase_date, invoice_number, status, ...)
purchase_lines(id, purchase_id, product_id, quantity, unit_cost, ...)
```

### H.8 Obtención de Métodos de Pago

⚠️ **NO HAY TABLA DEDICADA**

```
sales.payment_method TEXT (solo field, sin referencia)

Valores observados:
  - 'unknown' (Bridge hardcoded en línea 77 del Edge Function)
  - Potencialmente otros desde Latin POS (no verificado)
  
TODO: Crear tabla payment_methods con restricción FOREIGN KEY
```

### H.9 Métodos de Reportes

```
dashboardService.getTodayStats()
  → Total ventas del día
  → Beneficio total (sum sale_lines.gross_profit)
  → Cantidad de tickets

dashboardService.getWeeklySalesData()
  → Array de 7 días con ventas diarias

dashboardService.getCriticalStockProducts()
  → Productos donde stock <= min_stock

dashboardService.getTopSellingProducts(days=30)
  → Productos por cantidad vendida en últimos N días

Route /reports: Aún sin implementación visual (pendiente)
```

---

## I. DEPENDENCIAS DE PRODUCCIÓN DETECTADAS

### I.1 NINGUNA conexión a producción en el código ✅

```bash
$ grep -r "lymarket.es\|production\|prod\|https" src/ bridge/
# (sin resultados que indiquen producción real)
```

### I.2 URLs Hardcoded

```
Frontend:
  VITE_SUPABASE_URL     = http://127.0.0.1:54321     ✅ LOCAL
  VITE_SUPABASE_ANON_KEY = (desarrollo)              ✅ LOCAL

Bridge:
  SUPABASE_URL          = http://127.0.0.1:54321     ✅ LOCAL
  SYSME_HOST            = 127.0.0.1                  ✅ LOCAL
```

### I.3 Posibles Riesgos (sin verificación de secretos)

```
⚠️ .env.bridge (NO COMMITEADO) contiene:
  - SYSME_PASSWORD (encrypted SYSENC1)
  - SUPABASE_SERVICE_KEY (credentials)

✅ Protecciones:
  - .gitignore excluye .env.bridge
  - .env.example solo template
  - SERVICE_ROLE_KEY no visible en repo
```

### I.4 Acceso a Sysme Real

**Estado actual:** Bridge PUEDE conectarse a Sysme real si .env.bridge es configurado

```
RIESGO: Si SYSME_PASSWORD apunta a Sysme PRODUCCIÓN (127.0.0.1:4306):
  - Bridge sincronizaría ventas REALES
  - Actualizaría stock REAL en Supabase local
  - Podría causar inconsistencias con datos locales
```

---

## J. ELEMENTOS QUE DEBEMOS AISLAR PARA CREAR LAB

### J.1 Dependencias Externas a Aislar

```
AISLABLE (necesario):
  ✅ Supabase: Ya local (supabase start)
  ✅ Sysme MySQL: Ya local (127.0.0.1:4306)
  ✅ Frontend: Ya local (vite dev)
  ✅ Bridge: Ya local (Node.js)

NO HAY dependencias externas detectadas
```

### J.2 Base de Datos - Estado Inicial

```
Opción 1: LIMPIAR TODO (fresh start)
  $ supabase db reset
  → Ejecuta todas las migraciones desde 0
  → Inserta configuración inicial (bridge_config, sync_state)
  → Tabla documents: ❌ FALTA (no en migraciones)

Opción 2: SNAPSHOT de rama main
  $ supabase db pull
  → Sincroniza schema desde producción (SI APLICA)
  
Recomendación para lab:
  - Usar Opción 1 (reset)
  - Verificar que documents tabla está en migraciones
  - Crear seed.sql con datos de prueba mínimos
```

### J.3 Bridge State

```
sync_state debe estar limpio para lab:
  last_finalized_sale_id: null       (restart desde 0)
  status: 'idle'
  last_error: null
  last_sync_at: null

sync_events: LIMPIAR (no carry over)

bridge_errors: LIMPIAR (solo debug)
```

### J.4 Datos de Prueba (Seed)

```
Mínimo necesario:
  1× categoria (ej: "Bebidas")
  1× supplier (ej: "Proveedor Test")
  3-5× products con mapeos Sysme (necesarios para sync)
  1× payment method (si se crea tabla)

Mapeos sysme_product_map:
  DEBEN coincidir con productos reales en Sysme local
  Usar fase 12-17 del Bridge para identificar
```

### J.5 Configuración Bridge para Lab

```
.env.bridge DEBE apuntar a:
  SYSME_HOST=127.0.0.1           (local o dockerizado)
  SYSME_PORT=4306
  SYSME_DATABASE=sysmehotel_lab  (¿nueva? ¿limpia?)
  SYSME_USER=root
  SYSME_PASSWORD=<local password>

  SUPABASE_URL=http://127.0.0.1:54321    (local)
  SUPABASE_SERVICE_KEY=<local key>
  POLLING_INTERVAL_MS=5000  (sin cambios)
```

---

## K. RIESGOS ANTES DE CREAR LAB

### K.1 RIESGO: Tabla documents no está en migraciones

**Impacto:** 
- Si `documents` tabla NO existe en Supabase local (tras `supabase db reset`)
- Las operaciones `documentsService.*` fallarán
- POS screen no podrá guardar invoices/documentos

**Mitigación:**
```sql
-- Revisar migraciones completas (grep "documents")
-- Si no existe, crear migración 20260923_create_documents.sql

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

### K.2 RIESGO: payment_methods tabla no existe

**Impacto:**
- `sales.payment_method TEXT` es un campo libre (sin restricción)
- Bridge hardcoding 'unknown' sin opciones definidas
- No hay ENUM o FOREIGN KEY a tabla de métodos

**Mitigación:**
```sql
-- Crear tabla payment_methods
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE
);

-- Agregar FK a sales
ALTER TABLE sales ADD CONSTRAINT fk_payment_method
  FOREIGN KEY (payment_method) REFERENCES payment_methods(code);

-- Insert iniciales
INSERT INTO payment_methods VALUES
  ('cash', 'Efectivo'),
  ('card', 'Tarjeta'),
  ('transfer', 'Transferencia'),
  ('unknown', 'Desconocido');
```

### K.3 RIESGO: Diferencia de 530 vs 553 productos

**Causa probable:**
- Sysme tiene 553 productos en almacen_complementg
- sysme_product_map solo mapea 530
- 23 productos sin mapeo = no sincronizados

**Investigación requerida:**
```sql
-- En Sysme MySQL:
SELECT COUNT(*) FROM almacen_complementg;  -- ¿553?

-- En Supabase:
SELECT COUNT(*) FROM sysme_product_map;    -- ¿530?

-- Diferencia:
SELECT DISTINCT ac.id_complementog 
FROM almacen_complementg ac
LEFT JOIN sysme_product_map spm ON (
  spm.id_empresa = 'LYMARKET' AND
  spm.id_centro = 'LOCAL-01' AND
  spm.id_tipo_comg = '01' AND
  spm.id_complementog = ac.id_complementog
)
WHERE spm.product_id IS NULL;
-- ¿23 resultados?
```

### K.4 RIESGO: Stock negativo en Sysme

**Posible causa:**
- Overselling model (vender más del stock disponible)
- Devoluciones no reflejadas

**Mitigación ya hecha:**
- Migración 20260917120000 elimina constraint `stock >= 0`
- Ahora `stock` puede ser negativo (⚠️ pero UI debe mostrar claramente)

### K.5 RIESGO: Coste unitario en 0

**Observaciones:**
- Si `products.cost_price = 0`, margin será 100%
- Si `sale_lines.unit_cost_at_time = 0`, beneficio será `total_sale` (incorrecto)

**Investigación:**
```sql
SELECT COUNT(*) FROM products WHERE cost_price = 0;
SELECT COUNT(*) FROM sale_lines WHERE unit_cost_at_time = 0;
```

### K.6 RIESGO: Beneficio incorrecto en reportes

**Causa probable:**
- `dashboardService.getTopSellingProducts()` suma `sale_lines.gross_profit`
- Si unit_cost_at_time es incorrecto o NULL, gross_profit será incorrecto
- Cálculo: `gross_profit = (total_sale - total_cost)` pero total_cost = quantity × unit_cost_at_time

**Verificación requerida:**
```typescript
// En sales.service.ts creación
if (unit_cost_at_time === 0) {
  console.warn(`⚠️ zero cost for product ${productId}`)
}
if (unit_cost_at_time === null) {
  console.error(`❌ null cost for product ${productId}`)
}
```

### K.7 RIESGO: Compras y proveedores vacíos

**Causa:** Sin sincronización Sysme (aún no implementada en Bridge)

**Mitigación:**
- Para lab, pobluar manualmente con datos de prueba
- O esperar a que Bridge implemente sincronización

### K.8 RIESGO: Realtime listeners no implementados

**Impacto:** LOW (desarrollo completable)
- Frontend cargará datos pero sin actualizaciones en tiempo real
- Necesitará F5 para refresh
- Realtime está configurado, solo falta `.subscribe()` calls

### K.9 RIESGO: RLS policies bloqueadas

**Estado:** Todas las tablas tienen `DENY ALL` policies

**Implicación:**
- Frontend (anon role) no puede leer nada
- Solo Bridge (service_role) puede escribir

**Solución actual:** Temporal durante desarrollo  
**Para producción:** Implementar auth y políticas correctas

### K.10 RIESGO: Edge Function sin validación de token

```typescript
// En supabase/functions/sysme-bridge-sync/index.ts línea 39-40:
const token = authHeader.substring(7);
// TODO: Validar token contra SERVICE_ROLE_KEY
```

**Impacto:** MEDIUM  
**Para lab:** OK (local no conecta a internet)  
**Para producción:** CRÍTICO - implementar JWT validation

---

## L. PLAN EXACTO PARA CREAR LAB

### L.1 Fase 0: Pre-requisitos

```bash
# Verificar Sysme local está corriendo
mysql -h 127.0.0.1 -P 4306 -u root -p -e "SELECT 1;" sysmehotel
# ✅ Debe retornar 1

# Verificar directorio limpio
cd ~/tpv_latin
git status
# ✅ Debe estar limpio

# Rama correcta
git branch
# ✅ Debe estar en "lab"
```

### L.2 Fase 1: Inicializar Supabase Local

```bash
# En directorio raíz (no bridge/)
cd ~/tpv_latin

# Iniciar Supabase local
supabase start
# Esperar a que esté healthy

# Verificar status
supabase status
# Anotar credenciales (SUPABASE_SERVICE_KEY, ANON_KEY)

# Obtener URLs locales
supabase status --local | grep "API URL"
# ✅ http://127.0.0.1:54321

supabase status --local | grep "Studio URL"
# ✅ http://127.0.0.1:54323
```

### L.3 Fase 2: Aplicar Migraciones

```bash
# Verificar estado de migraciones
supabase db status

# Ejecutar migraciones (CUIDADO: reset borra todo)
supabase db reset
# Esto ejecutará:
#  1. Seed (si existe seed.sql)
#  2. Todas las migraciones en orden
#  3. Inserta datos iniciales (bridge_config, sync_state)

# Verificar tablas creadas
supabase db status --verbose
```

### L.4 Fase 3: Crear/Verificar Tabla de Documentos

```bash
# Opción 1: Si documents no existe, crear migración
cat > supabase/migrations/20260923_create_documents.sql << 'EOF'
-- Create documents table for storing sale/purchase invoices and attachments

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT at_least_one_reference CHECK (
    (sale_id IS NOT NULL) OR (purchase_id IS NOT NULL)
  )
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_deny_all ON documents USING (FALSE);

CREATE INDEX idx_documents_sale_id ON documents(sale_id);
CREATE INDEX idx_documents_purchase_id ON documents(purchase_id);
CREATE INDEX idx_documents_created_at ON documents(created_at);

COMMENT ON TABLE documents IS 'Storage metadata for invoices and documents';
EOF

# Opción 2: Ejecutar migración
supabase db reset
# O si ya está en estado limpio:
supabase db execute --file supabase/migrations/20260923_create_documents.sql
```

### L.5 Fase 4: Crear/Verificar Tabla de Métodos de Pago

```bash
# Crear migración
cat > supabase/migrations/20260924_create_payment_methods.sql << 'EOF'
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_methods_deny_all ON payment_methods USING (FALSE);

INSERT INTO payment_methods (code, name, description) VALUES
  ('cash', 'Efectivo', 'Pago en efectivo'),
  ('card', 'Tarjeta de Crédito/Débito', 'Pago con tarjeta'),
  ('transfer', 'Transferencia Bancaria', 'Pago por transferencia'),
  ('check', 'Cheque', 'Pago con cheque'),
  ('mixed', 'Pago Mixto', 'Combinación de métodos'),
  ('unknown', 'Desconocido', 'Método no especificado')
ON CONFLICT (code) DO NOTHING;
EOF

supabase db reset
```

### L.6 Fase 5: Crear Datos de Prueba (Seed)

```bash
# Crear seed.sql
cat > supabase/seed.sql << 'EOF'
-- Seed data for lab environment

-- 1. Categories
INSERT INTO categories (name, description, active, color) VALUES
  ('Bebidas Calientes', 'Café, té, chocolate', true, '#8B4513'),
  ('Bebidas Frías', 'Jugos, refrescos, agua', true, '#4A90E2'),
  ('Snacks', 'Bocadillos y aperitivos', true, '#FDB913'),
  ('Desayunos', 'Desayunos completos', true, '#F15A24')
ON CONFLICT (name) DO NOTHING;

-- 2. Suppliers
INSERT INTO suppliers (name, contact_name, email, phone, active) VALUES
  ('Proveedor Local 1', 'Juan Pérez', 'juan@local.com', '+34912345678', true),
  ('Proveedor Local 2', 'María García', 'maria@local.com', '+34912345679', true)
ON CONFLICT (name) DO NOTHING;

-- 3. Products with Sysme mappings
INSERT INTO products (sku, name, category_id, supplier_id, sale_price, cost_price, stock, active) VALUES
  ('CAFE001', 'Café Americano', 
    (SELECT id FROM categories WHERE name='Bebidas Calientes' LIMIT 1),
    (SELECT id FROM suppliers WHERE name='Proveedor Local 1' LIMIT 1),
    3.50, 1.00, 100, true),
  ('CAFE002', 'Café Cappuccino',
    (SELECT id FROM categories WHERE name='Bebidas Calientes' LIMIT 1),
    (SELECT id FROM suppliers WHERE name='Proveedor Local 1' LIMIT 1),
    4.50, 1.20, 80, true),
  ('AGUA001', 'Agua Mineral',
    (SELECT id FROM categories WHERE name='Bebidas Frías' LIMIT 1),
    (SELECT id FROM suppliers WHERE name='Proveedor Local 2' LIMIT 1),
    1.50, 0.50, 200, true),
  ('SNACK001', 'Sándwich Jamón',
    (SELECT id FROM categories WHERE name='Snacks' LIMIT 1),
    (SELECT id FROM suppliers WHERE name='Proveedor Local 1' LIMIT 1),
    5.00, 2.00, 50, true),
  ('SNACK002', 'Croissant',
    (SELECT id FROM categories WHERE name='Desayunos' LIMIT 1),
    (SELECT id FROM suppliers WHERE name='Proveedor Local 2' LIMIT 1),
    2.50, 0.80, 120, true)
ON CONFLICT (sku) DO NOTHING;

-- 4. Sysme Product Mappings
-- IMPORTANTE: Estos valores DEBEN coincidir con productos reales en Sysme local
INSERT INTO sysme_product_map (product_id, id_empresa, id_centro, id_tipo_comg, id_complementog, active) 
SELECT 
  id, 'LYMARKET', 'LOCAL-01', '01', 
  CASE sku 
    WHEN 'CAFE001' THEN '00001'
    WHEN 'CAFE002' THEN '00002'
    WHEN 'AGUA001' THEN '00003'
    WHEN 'SNACK001' THEN '00004'
    WHEN 'SNACK002' THEN '00005'
  END,
  true
FROM products
WHERE sku IN ('CAFE001', 'CAFE002', 'AGUA001', 'SNACK001', 'SNACK002')
ON CONFLICT (product_id) DO NOTHING;

-- 5. Initial sync state
UPDATE sync_state 
SET last_finalized_sale_id = null, status = 'idle'
WHERE integration_name = 'sysme_bridge';
EOF

# Ejecutar seed (automático en supabase db reset, o manual)
supabase db reset  # Ejecuta migrations + seed
```

### L.7 Fase 6: Configurar Bridge para Lab

```bash
# En bridge/ crear .env.bridge
cd bridge
cp .env.example .env.bridge

# Editar .env.bridge con valores LABORATORIO
cat > .env.bridge << 'EOF'
# Sysme MySQL (LOCAL)
SYSME_HOST=127.0.0.1
SYSME_PORT=4306
SYSME_DATABASE=sysmehotel
SYSME_USER=root
SYSME_PASSWORD=<obtener de C:\SYSME\SGC\sysmetpv.ini o password local>

# Supabase (LOCAL)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=<obtener de supabase status --local>

# Bridge Config
POLLING_INTERVAL_MS=5000
BATCH_SIZE=10
MAX_RETRIES=5
LOG_LEVEL=info
EOF

# Verificar .env.bridge está en .gitignore
grep ".env.bridge" .gitignore
# ✅ Debe estar allí
```

### L.8 Fase 7: Compilar Bridge

```bash
cd bridge
npm install
npm run build
# ✅ Debe compilar sin errores
```

### L.9 Fase 8: Verificar Conexiones

```bash
# Test Sysme
cd bridge
npm run test-mysql  # Si existe este script, o:
npx ts-node test-mysql-readonly.js

# Test Supabase local
cd ..
npm run build  # Frontend build
npm run dev    # Vite dev server

# En otra terminal:
curl -H "apikey: <anon_key>" http://127.0.0.1:54321/rest/v1/sales?limit=1
# ✅ Debe retornar status 200 (y array vacío o datos)
```

### L.10 Fase 9: Iniciar Bridge (SOLO PARA TESTING)

⚠️ **NO ejecutar Bridge en producción sin autorización**

```bash
cd bridge
npm run start
# Logs esperados:
# [BRIDGE] ✓ Sysme MySQL: OK
# [BRIDGE] ✓ Supabase: OK
# [BRIDGE] Iniciando loop continuo...
# [SYNC] Cycle #1: buscando ventas finalizadas...

# Para detener:
# Ctrl+C
```

### L.11 Fase 10: Iniciar Frontend

```bash
# En raíz (no bridge/)
npm install
npm run dev

# Acceder a: http://127.0.0.1:3000
# ✅ Dashboard debe mostrar datos de prueba creados en L.6
```

### L.12 Fase 11: Verificar Laboratorio Funciona

```bash
Checklist:
  ✅ Frontend carga (http://127.0.0.1:3000)
  ✅ Dashboard muestra stats (0 ventas inicialmente)
  ✅ /products muestra 5 productos de seed
  ✅ /categories muestra 4 categorías
  ✅ /suppliers muestra 2 proveedores
  ✅ Supabase local (http://127.0.0.1:54323) accesible
  ✅ Bridge puede iniciar y conectar a Sysme
  ✅ Crear venta de prueba en Frontend → stock actualiza
  ✅ Crear venta en Sysme → Bridge sincroniza → Aparece en /sales
```

### L.13 Fase 12: Finalizar Lab

```bash
# Crear rama lab aislada
git checkout -b lab/v1-initial
git add -A
git commit -m "chore: lab environment setup with seed data

- Initialized local Supabase with all migrations
- Created seed data: 4 categories, 2 suppliers, 5 products
- Configured Bridge for local Sysme connection
- Verified all systems functional
- RLS policies in place (DENY ALL)

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"

# Documentar en LABORATORIO.md
cat > LABORATORIO.md << 'EOF'
# Laboratorio de TPV LATIN PRO

## Iniciar Laboratorio

### Requisitos
- Docker o Supabase CLI
- Node.js 18+
- MySQL 5.7+ corriendo en 127.0.0.1:4306 (Sysme local)

### Pasos

1. Iniciar Supabase local
   ```bash
   supabase start
   ```

2. Aplicar migraciones
   ```bash
   supabase db reset
   ```

3. Configurar Bridge
   ```bash
   cd bridge
   cp .env.example .env.bridge
   # Editar .env.bridge con credenciales locales
   ```

4. Iniciar Frontend
   ```bash
   npm install
   npm run dev
   ```

5. (Opcional) Iniciar Bridge
   ```bash
   cd bridge
   npm run start
   ```

## URLs
- Frontend: http://127.0.0.1:3000
- Supabase: http://127.0.0.1:54323
- API: http://127.0.0.1:54321

## Detener

```bash
supabase stop
```

## Reset Completo

```bash
supabase db reset  # Borra y recrea con seed
# O para purga total:
supabase stop --remove-docker
supabase start
supabase db reset
```
EOF
```

---

## RESUMEN DE AUDITORÍA

### ✅ Lo que ESTÁ LISTO para Lab

1. **Supabase local** completamente funcional
2. **Migraciones** de esquema completas
3. **Bridge** compilable y testeable
4. **Frontend** sin dependencias externas
5. **Realtime** configurado (sin listeners aún)
6. **RLS** en su lugar (DENY ALL temporal)
7. **Reproducibilidad** clara

### ⚠️ Problemas ANTES de hacer Lab

1. **Tabla `documents` no en migraciones** → Crear migración 20260923
2. **Tabla `payment_methods` no existe** → Crear migración 20260924
3. **Diferencia 530 vs 553 productos** → Audit de mappeos Sysme
4. **Stock negativo posible** → Ya permitido, pero UI debe manejar
5. **Coste unitario en 0** → Verificar datos Sysme
6. **Realtime listeners faltantes** → TODO para fase posterior
7. **Token validation ausente** → TODO para producción

### 🎯 Próximas Acciones Recomendadas

**PARA CREAR LAB (orden):**
1. Crear migraciones 20260923 (documents) y 20260924 (payment_methods)
2. Crear seed.sql con datos de prueba
3. Ejecutar fases L.1 a L.13 del plan
4. Validar todas las conexiones funcionan
5. Documentar cualquier desviación encontrada

**DESPUÉS DE CREAR LAB:**
1. Diagnosticar diferencia 530 vs 553 productos
2. Verificar costes unitarios en 0
3. Implementar listeners Realtime en frontend
4. Agregar UI para métodos de pago
5. Solucionar problemas funcionales (beneficio, reportes, etc.)
6. Implementar seguridad (auth, RLS policies)

---

**FIN DE AUDITORÍA**

**Auditor:** Claude Haiku 4.5  
**Fecha:** 2026-10-01  
**Restricciones seguidas:** ✅ Sin modificar código, sin operaciones destructivas, SOLO inspección
