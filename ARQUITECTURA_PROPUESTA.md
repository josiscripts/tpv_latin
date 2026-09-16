# 🏗️ ARQUITECTURA PROPUESTA PARA INTEGRACIÓN SYSME

## Diagrama de Arquitectura Actual vs Propuesta

### ACTUAL (Datos en memoria)
```
┌─────────────────────────────────────────────────┐
│         Navegador / Cliente React 19            │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │   TanStack Router + React Query          │  │
│  ├──────────────────────────────────────────┤  │
│  │  Dashboard | TPV | Productos | Stock...  │  │
│  └──────────────────────────────────────────┘  │
│                      ↓                          │
│  ┌──────────────────────────────────────────┐  │
│  │      pos-data.ts (Constantes en RAM)     │  │
│  │  • products: Product[]                   │  │
│  │  • tickets: Ticket[]                     │  │
│  │  • suppliers: Supplier[]                 │  │
│  │  • salesWeek, monthly, etc               │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│   ⚠️ PROBLEMA: Los datos se pierden            │
│      al recargar la página                     │
└─────────────────────────────────────────────────┘
```

---

## PROPUESTA A: Solo Supabase (Recomendado para esta etapa)

```
┌──────────────────────────────────────────────────────────────┐
│                    Navegador (React 19)                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  TanStack Router                                             │
│  ├── Dashboard → Agregaciones                               │
│  ├── TPV Venta → sales, sale_items, products               │
│  ├── Productos → products, categories, suppliers           │
│  ├── Stock → stock_movements, products                      │
│  ├── Compras → purchases, purchase_items, suppliers        │
│  ├── Ventas → sales, sale_items                            │
│  └── Reportes → Agregaciones                               │
│                                                               │
│  React Query (Caché y sincronización)                       │
│  ├── useQuery() ← SELECT de Supabase                       │
│  ├── useMutation() → INSERT/UPDATE                         │
│  └── useInfiniteQuery() → Paginación                       │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ↓ HTTPS/WebSocket
         ┌────────────────────────────┐
         │   SUPABASE (PostgreSQL)    │
         ├────────────────────────────┤
         │ Autenticación: JWT Token   │
         ├────────────────────────────┤
         │  Tablas:                   │
         │  ├─ products               │
         │  ├─ categories             │
         │  ├─ suppliers              │
         │  ├─ sales                  │
         │  ├─ sale_items             │
         │  ├─ purchases              │
         │  ├─ purchase_items         │
         │  ├─ stock_movements        │
         │  ├─ customers              │
         │  └─ users                  │
         │                            │
         │  RLS (Seguridad)           │
         │  Triggers                  │
         │  Functions                 │
         └────────────────────────────┘
```

**Ventajas:**
✅ Base de datos persistente  
✅ Multi-usuario  
✅ Autenticación integrada  
✅ Real-time con WebSockets  
✅ Backup automático  
✅ Escalable  

**Desventajas:**
❌ Requiere conexión a internet  
❌ Costo por uso  
❌ Dependencia de un proveedor  

---

## PROPUESTA B: Supabase + Sysme TPV (Integración completa)

```
┌──────────────────────────────────────────────────────────────────┐
│                    Latin POS (React 19)                           │
├──────────────────────────────────────────────────────────────────┤
│  • Dashboard                                                      │
│  • TPV Venta                                                      │
│  • Gestión de Productos, Stock, Compras                          │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ├─────────────────────────────────────┐
               │                                     │
               ↓ HTTPS/JWT                          ↓ HTTPS/API
   ┌──────────────────────────┐     ┌──────────────────────────┐
   │  SUPABASE (PostgreSQL)   │     │    SYSME TPV             │
   ├──────────────────────────┤     ├──────────────────────────┤
   │ Almacenamiento Local:    │     │ Fuente de verdad:        │
   │ ├─ products              │────→│ • Productos maestros     │
   │ ├─ categories            │←────│ • Precios                │
   │ ├─ suppliers             │     │ • Stock global           │
   │ ├─ sales                 │────→│ • Historial de ventas    │
   │ ├─ sales_items           │←────│ • Clientes               │
   │ ├─ stock_movements       │     │ • Proveedores            │
   │ └─ purchases             │     └──────────────────────────┘
   │                          │
   │ Sync Manager:            │
   │ ├─ Webhooks              │
   │ ├─ Polling               │
   │ └─ Conflict Resolution   │
   └──────────────────────────┘
```

**Flujo de Sincronización:**

### 1. Descarga desde Sysme (Nightly)
```
SYSME TPV
├─ Productos maestros → SUPABASE.products
├─ Categorías → SUPABASE.categories
├─ Proveedores → SUPABASE.suppliers
├─ Precios actuales → SUPABASE.products.price
└─ Stock centralizado → SUPABASE.stock_movements
```

### 2. Operaciones en Latin POS (Tiempo real)
```
USUARIO
├─ Venta → INSERT sale + sale_items
│         → UPDATE products.stock
│         → INSERT stock_movements
│
├─ Compra → INSERT purchase + purchase_items
│         → (Esperar confirmación de entrada)
│         → UPDATE products.stock
│
└─ Ajuste → INSERT stock_movements
           → UPDATE products.stock
```

### 3. Sincronización a Sysme (Real-time o batch)
```
SUPABASE changes
├─ sales creados → WEBHOOK → SYSME TPV
├─ purchases confirmados → WEBHOOK → SYSME TPV
├─ stock_movements → WEBHOOK → SYSME TPV
└─ products nuevos → API → SYSME TPV
```

---

## MAPEO DE TABLAS

```
Supabase / Latin POS          →  Sysme TPV
═════════════════════════════════════════════════════════

products                      ←  Productos maestros
├─ id (PK)                        ├─ sysme_id
├─ name                           ├─ nombre
├─ category_id (FK)               ├─ categoria
├─ supplier_id (FK)               ├─ proveedor
├─ barcode                        ├─ ean/barcode
├─ sku                            ├─ codigo_interno
├─ cost                           ├─ costo_compra
├─ price                          ├─ precio_venta
├─ stock                          ├─ stock_global
└─ image_url                      └─ imagen

sales                         →  Tickets de venta
├─ id (PK)                        ├─ id_venta
├─ ticket_number                  ├─ numero_ticket
├─ sale_date                      ├─ fecha_hora
├─ total                          ├─ total
├─ tax                            ├─ impuestos
├─ profit                         ├─ beneficio
├─ payment_method                 ├─ metodo_pago
└─ status                         └─ estado

sale_items                    →  Líneas de ticket
├─ id (PK)                        ├─ id_linea
├─ sale_id (FK)                   ├─ id_venta
├─ product_id (FK)                ├─ id_producto
├─ quantity                       ├─ cantidad
├─ unit_price                     ├─ precio_unitario
└─ subtotal                       └─ subtotal

purchases                     →  Órdenes de compra
├─ id (PK)                        ├─ id_orden
├─ purchase_number                ├─ numero_orden
├─ supplier_id (FK)               ├─ id_proveedor
├─ purchase_date                  ├─ fecha_orden
├─ expected_delivery              ├─ fecha_entrega_esperada
├─ actual_delivery                ├─ fecha_entrega_real
└─ status                         └─ estado_orden

stock_movements               ←  Movimientos de inventario
├─ id (PK)                        ├─ id_movimiento
├─ product_id (FK)                ├─ id_producto
├─ movement_type                  ├─ tipo_movimiento
├─ quantity                       ├─ cantidad
├─ reason                         ├─ razon/motivo
├─ reference_id                   ├─ referencia_sistema
└─ created_at                     └─ fecha_hora
```

---

## TABLA DE MAPEO (SYNC_MAP)

Para gestionar la sincronización y conflictos:

```sql
CREATE TABLE sysme_sync_map (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  
  -- Identificadores
  local_id BIGINT NOT NULL,
  local_table TEXT NOT NULL,
  sysme_id TEXT NOT NULL,
  sysme_code TEXT,
  
  -- Sincronización
  last_sync_from_sysme TIMESTAMP,
  last_sync_to_sysme TIMESTAMP,
  last_local_change TIMESTAMP,
  
  -- Control
  sync_status TEXT DEFAULT 'synced',
  conflict_resolution TEXT,
  
  -- Auditoría
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(local_table, local_id),
  UNIQUE(sysme_id)
);
```

**Ejemplo:**
```
local_id | local_table | sysme_id | sysme_code | sync_status | last_sync_to_sysme
---------|-------------|----------|------------|-------------|--------------------
1        | products    | prod_001 | BEB-INK-300| synced      | 2026-09-15 10:30
2        | products    | prod_002 | BEB-MAL-330| synced      | 2026-09-15 10:30
10       | sales       | vent_156 | #V-10482   | synced      | 2026-09-15 11:25
```

---

## ESTRATEGIA DE SINCRONIZACIÓN

### Opción 1: Webhook (Recomendado si Sysme lo soporta)

```
┌────────────────────────────────────────────────┐
│ Cambio en Supabase                             │
├────────────────────────────────────────────────┤
│ INSERT/UPDATE/DELETE en sales, purchases       │
└────────────────────┬───────────────────────────┘
                     │
                     ├─→ Trigger PL/pgSQL
                     │
                     ├─→ http_post() a Sysme
                     │
                     └─→ Log en sync_log
                         (auditoría)
```

**Ventajas:**
✅ Tiempo real  
✅ Bajo overhead  
✅ No requiere polling  

**Desventajas:**
❌ Requiere que Sysme tenga endpoint disponible  
❌ Más compejo de debuggear  

---

### Opción 2: Polling (Si Sysme no soporta webhooks)

```
┌─────────────────────────────────────────────────────┐
│ Sync Service (Edge Function o Lambda)              │
├─────────────────────────────────────────────────────┤
│ Cada 5 minutos:                                     │
│ 1. GET /api/sysme/products (cambios desde 10:00)   │
│ 2. Comparar con SUPABASE                           │
│ 3. Merge/Update según reglas de conflicto          │
│ 4. Notificar cambios a clientes vía WebSocket      │
└──────────────┬──────────────────────────────────────┘
               │
               ├─→ SYSME API
               ├─→ Supabase DB
               └─→ React Query invalidation
```

**Ventajas:**
✅ Más simple de implementar  
✅ No requiere endpoint en Sysme  

**Desventajas:**
❌ Delay de 5 minutos  
❌ Mayor uso de API  
❌ Más recursos computacionales  

---

### Opción 3: Bidireccional (Híbrido)

```
SYSME → Supabase (Webhook cada vez que hay cambio)
              ↓
         SYNC_MAP
              ↓
        Detectar conflictos
              ↓
        MERGE LOGIC
              ↓
        Supabase → SYSME (Polling cada 5 min)
```

---

## REGLAS DE CONFLICTO

### Escenario 1: Precio cambia en Sysme vs Venta en Latin POS

```
T1: Sysme dice: Inca Kola = 2.50€
T2: Latin POS vende a: 2.50€ (precio correcto)
T3: Sysme actualiza: Inca Kola = 2.60€ (incremente)

PROBLEMA: ¿Debería reflejarse la nueva venta en Sysme con precio nuevo?

SOLUCIÓN: Usar el precio al momento de la venta, no el actual
├─ sale_items.unit_price = 2.50€ (historizado)
├─ products.price = 2.60€ (actual)
└─ Sysme recibe ambos, usa unit_price para historial
```

---

### Escenario 2: Stock se agota en Sysme, falta en Supabase

```
T1: Supabase: Yuca = 5 unidades
T2: Sysme: Yuca = 0 unidades (vendido)
T3: Usuario en Latin POS intenta vender Yuca

SOLUCIÓN: Validación en tiempo real
├─ Antes de guardar sale_items
├─ Verificar stock en Supabase
├─ Si stock < cantidad:
│   ├─ Notificar usuario
│   └─ Rechazar venta o permitir con validación
└─ Sincronizar con Sysme para actualizar
```

---

### Escenario 3: Compra creada en Latin POS, no llega a Sysme

```
T1: Usuario crea purchase en Latin POS
T2: Guardar en Supabase ✅
T3: Intento enviar a Sysme ❌ (error de conexión)

SOLUCIÓN: Sistema de reintentos
├─ Guardar estado sync_status = 'pending'
├─ Background job cada 1 min: intenta POST a Sysme
├─ Max 5 reintentos
├─ Si sigue fallando:
│   ├─ Notificar admin
│   └─ Marcar manual_review = true
└─ No bloquear al usuario
```

---

## FLUJO DE UNA VENTA COMPLETA

```
1. USUARIO ACCEDE A TPV VENTA
   ├─ React Query carga products desde Supabase
   ├─ Caché localmente
   └─ Muestra disponibilidad

2. USUARIO AGREGA PRODUCTOS AL CARRITO
   ├─ Operación local (en memoria)
   └─ Sin persistencia aún

3. USUARIO CONFIRMA VENTA
   ├─ Frontend valida:
   │  ├─ Stock disponible
   │  ├─ Totales calculados
   │  └─ Método de pago
   │
   └─→ INSERT sale
       ├─ id, ticket_number, total, tax, profit
       └─ status = 'completed'

4. BACKEND RECIBE INSERT SALE
   ├─ Validate JWT
   ├─ Check RLS policies
   └─ INSERT en sales

5. TRIGGER: Insertar sale_items
   ├─ Por cada producto:
   │  ├─ INSERT sale_items (quantity, price)
   │  ├─ UPDATE products.stock
   │  └─ INSERT stock_movements

6. WEBHOOK: Notificar Sysme
   ├─ POST /api/sysme/sales
   ├─ Payload: sale data
   └─ Guardar response en sync_log

7. SUPABASE BROADCAST
   ├─ Notificar a otros usuarios (real-time)
   ├─ Dashboard se actualiza
   └─ Stock se refleja en Inventario

8. RESPUESTA AL USUARIO
   ├─ Éxito: Mostrar ticket
   ├─ Opción: Imprimir
   └─ Limpiar carrito y volver a inicio
```

---

## CÓDIGO EJEMPLO: Conectar React Query con Supabase

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// hooks/useProducts.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name), suppliers(name)')
        .eq('deleted_at', null)
      
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
  })
}

// hooks/useSales.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useCreateSale() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (sale: NewSale) => {
      // Crear venta
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert([sale])
        .select()

      if (saleError) throw saleError

      // Crear líneas
      const { data: itemsData, error: itemsError } = await supabase
        .from('sale_items')
        .insert(sale.items.map(item => ({
          ...item,
          sale_id: saleData[0].id,
        })))

      if (itemsError) throw itemsError

      return { sale: saleData[0], items: itemsData }
    },
    onSuccess: () => {
      // Invalidar caché
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
    },
  })
}
```

---

## DIAGRAMA ER (Entity Relationship)

```
products                 categories
├─ id (PK)              ├─ id (PK)
├─ category_id (FK) ───→├─ name
├─ supplier_id (FK) ┐   └─ ...
├─ name             │
├─ barcode          │   suppliers
├─ sku              │   ├─ id (PK)
├─ price            └───├─ name
├─ cost                 ├─ phone
├─ stock                └─ ...
├─ image_url            ↑
└─ ...                  │
  ↑                     │
  │ 1:N                 │ 1:N
  │                     │
  │                  sales
  │                  ├─ id (PK)
  │                  ├─ ticket_number
  │                  ├─ total
  │                  └─ ...
  │
  │                  sale_items ──→ products
  ├─ 1:N            ├─ id (PK)
  │                 ├─ sale_id (FK)
  │                 ├─ product_id (FK)
  │                 └─ quantity
  │
  │                 purchases
  │                 ├─ id (PK)
  │                 ├─ supplier_id (FK) ───→ suppliers
  │                 └─ ...
  │
  │                 purchase_items
  │                 ├─ id (PK)
  │                 ├─ purchase_id (FK)
  │                 ├─ product_id (FK)
  │                 └─ quantity
  │
  └─ stock_movements
    ├─ id (PK)
    ├─ product_id (FK)
    ├─ quantity
    └─ created_at
```

---

## TABLA COMPARATIVA: TECNOLOGÍAS DE INTEGRACIÓN

| Aspecto | Webhook | Polling | REST API | GraphQL |
|--------|---------|---------|----------|---------|
| **Latencia** | Real-time | 5-10 min | Bajo | Bajo |
| **Complejidad** | Alta | Baja | Media | Alta |
| **Costo** | Bajo | Medio | Bajo | Medio |
| **Confiabilidad** | Media | Alta | Alta | Alta |
| **Requerimientos** | Endpoint público | Ninguno | Documentación | Schema |
| **Recomendado para** | Producción alta | MVP | MVP | Escalable |

---

## HOJA DE RUTA

### Fase 1: Setup Supabase (Semana 1)
- [ ] Crear proyecto Supabase
- [ ] Definir esquema de BD
- [ ] Crear tablas
- [ ] Configurar RLS policies
- [ ] Agregar índices

### Fase 2: Conexión Latin POS (Semana 2)
- [ ] Instalar @supabase/supabase-js
- [ ] Crear hooks con React Query
- [ ] Migrar screens a usar Supabase
- [ ] Implementar autenticación
- [ ] Testing local

### Fase 3: Integración Sysme (Semana 3-4)
- [ ] Obtener especificación de Sysme API
- [ ] Crear tabla sync_map
- [ ] Implementar sync service
- [ ] Testing de sincronización
- [ ] Gestión de conflictos

### Fase 4: Optimización (Semana 5)
- [ ] Real-time updates con WebSockets
- [ ] Caché y offline mode
- [ ] Monitoreo y alertas
- [ ] Performance tuning
- [ ] Documentación

