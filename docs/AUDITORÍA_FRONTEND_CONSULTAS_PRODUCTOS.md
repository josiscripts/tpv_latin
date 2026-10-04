# AUDITORÍA — Todas las consultas de productos en Frontend

**Fecha:** 2026-10-04  
**Objetivo:** Localizar TODAS las rutas donde se obtienen productos operativos  
**Scope:** `/src` (excluyendo node_modules, dist, etc.)

---

## 1. SERVICIOS DE LECTURA DE PRODUCTOS

### 1.1 `src/services/products.service.ts`

#### Función: `listActive()` (línea 9-17)

```typescript
async listActive() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .is('deleted_at', null)          // ← FILTRA POR deleted_at
    .order('name');
}
```

**Uso:** Catálogo operativo, POS  
**Problema:** NO filtra por `active`  
**Impacto:** Productos con `active=false` aparecen en catálogo  

#### Función: `search()` (línea 20-30)

```typescript
async search(query: string) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .is('deleted_at', null)          // ← FILTRA POR deleted_at
    .or(`name.ilike.%${query}%,sku.ilike.%${query}%,barcode.ilike.%${query}%`)
    .order('name');
}
```

**Uso:** Búsqueda de productos en POS  
**Problema:** NO filtra por `active`  
**Impacto:** Búsqueda encuentra productos inactivos  

#### Función: `getById()` (línea 32-40)

```typescript
async getById(id: string) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single();
    // ← NO FILTRA (obtiene cualquier producto por ID)
}
```

**Uso:** Obtener detalles de un producto específico  
**Problema:** Pueden obtener productos inactivos  
**Impacto:** Bajo (se usa para detalles, no para listar)  

---

### 1.2 `src/services/dashboard.service.ts`

#### Función: `getCriticalStockProducts()` (línea 74-82)

```typescript
async getCriticalStockProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .is('deleted_at', null);         // ← FILTRA POR deleted_at
}
```

**Uso:** Dashboard — mostrar productos con stock crítico  
**Problema:** NO filtra por `active`  
**Impacto:** Dashboard muestra inactivos en listado de críticos  

#### Función: `getTotalInventoryValue()` (línea 172-179)

```typescript
async getTotalInventoryValue() {
  const { data, error } = await supabase
    .from('products')
    .select('stock, cost_price')
    .is('deleted_at', null);         // ← FILTRA POR deleted_at
}
```

**Uso:** Dashboard — calcular valor total de inventario  
**Problema:** NO filtra por `active`  
**Impacto:** Incluye productos inactivos en cálculo de valor  

#### Función: `getStockStats()` (línea 184-192)

```typescript
async getStockStats() {
  const { data, error } = await supabase
    .from('products')
    .select('stock, min_stock')
    .is('deleted_at', null);         // ← FILTRA POR deleted_at
}
```

**Uso:** Dashboard — estadísticas de stock  
**Problema:** NO filtra por `active`  
**Impacto:** Estadísticas incluyen productos inactivos  

---

## 2. OPERACIONES QUE NO FILTRAN

### 2.1 `src/services/sales.service.ts`

Obtenciones para procesar ventas (líneas 69, 107, 150):

```typescript
// Línea 69
const { data: product, error } = await supabase
  .from('products')
  .select('cost_price, stock')
  .eq('id', item.productId)
  // ← NO FILTRA, obtiene por ID

// Línea 107 (igual)
// Línea 150 (igual)
```

**Uso:** Obtener datos de producto al procesar venta  
**Problema:** Técnicamente se obtiene por ID (el usuario ya seleccionó), pero debería validar que `active=true`  
**Impacto:** Medio (si el producto fue desactivado ENTRE seleccionar y procesar venta)  

### 2.2 `src/services/stock.service.ts`

Obtenciones para movimientos de stock (líneas 10, 60, 71):

```typescript
// Línea 10
const { data, error } = await supabase
  .from('products')
  .select('stock, min_stock')
  .eq('id', productId)
  // ← NO FILTRA

// Línea 60, 71 (igual)
```

**Uso:** Obtener y actualizar stock  
**Problema:** NO valida que producto esté activo  
**Impacto:** Bajo (operación interna, pero debería validar)  

### 2.3 `src/services/purchases.service.ts`

Obtenciones para procesar compras (líneas 91, 113):

```typescript
// Línea 91
const product = await supabase
  .from('products')
  .select('stock, cost_price')
  .eq('id', productId)
  // ← NO FILTRA
```

**Uso:** Procesar compra de producto  
**Problema:** NO valida que producto esté activo  
**Impacto:** Bajo (compra es operación administrativa)  

---

## 3. COMPONENTES QUE USAN ESTAS CONSULTAS

### 3.1 `src/components/pos-screen.tsx` (POS — Punto de Venta)

```typescript
const { data: products = [] } = useProducts();  // Línea 15
```

**Consulta subyacente:** `productsService.listActive()`  
**Filtro:** `.is('deleted_at', null)` ✗ NO usa `active`  
**Impacto:** **CRÍTICO** — Catálogo de venta muestra productos inactivos  

### 3.2 `src/hooks/useProducts.ts`

```typescript
const query = useQuery({
  queryKey: PRODUCTS_KEY,
  queryFn: () => productsService.listActive(),  // Línea 13
});
```

**Filtro:** Heredado de `listActive()`  
**Impacto:** Propaga el filtro roto a todos los componentes que usan este hook  

---

## 4. RESUMEN DE MISMATCH

| Consulta | Campo filtrado | Problema | Impacto |
|---|---|---|---|
| `listActive()` | `deleted_at` | Ignora `active` | **CRÍTICO** |
| `search()` | `deleted_at` | Ignora `active` | **CRÍTICO** |
| `getCriticalStockProducts()` | `deleted_at` | Ignora `active` | Alto |
| `getTotalInventoryValue()` | `deleted_at` | Ignora `active` | Alto |
| `getStockStats()` | `deleted_at` | Ignora `active` | Alto |
| `getById()` | Ninguno | Obtiene inactivos | Bajo |
| `sales.service` (operaciones) | Ninguno | Valida por ID | Bajo |
| `stock.service` | Ninguno | Operación interna | Bajo |
| `purchases.service` | Ninguno | Operación administrativa | Bajo |

---

## 5. ESTADO ACTUAL

### Campo `deleted_at`

- Usado por: `listActive()`, `search()`, dashboard functions
- Finalidad: Marcar productos desactivados manualmente
- Valor: `null` (activo) o timestamp (desactivado)

### Campo `active`

- Usado por: Bridge (PASO 2.5) únicamente
- Finalidad: Sincronización con Sysme (eliminación automática)
- Valor: `true` (activo) o `false` (desactivado)

### El problema

```
Frontend:
  IF deleted_at IS NULL → incluir en catálogo

Bridge:
  IF producto no existe en Sysme → active=false

Resultado:
  active=false + deleted_at=null → PRODUCTO SIGUE VISIBLE
```

---

## 6. RUTAS CRÍTICAS A CORREGIR

### 6.1 Catálogo de Venta (CRÍTICO)

```
pos-screen.tsx
  → useProducts()
    → useQuery(listActive)
      → productsService.listActive()
        → .is('deleted_at', null)    ✗ DEBE FILTRAR active=true
```

### 6.2 Búsqueda (CRÍTICO)

```
pos-screen.tsx (búsqueda)
  → useProductSearch()
    → useQuery(search)
      → productsService.search()
        → .is('deleted_at', null)    ✗ DEBE FILTRAR active=true
```

### 6.3 Dashboard (ALTO)

```
dashboard-screen.tsx
  → dashboardService.getCriticalStockProducts()
    → .is('deleted_at', null)        ✗ DEBE FILTRAR active=true

  → dashboardService.getTotalInventoryValue()
    → .is('deleted_at', null)        ✗ DEBE FILTRAR active=true

  → dashboardService.getStockStats()
    → .is('deleted_at', null)        ✗ DEBE FILTRAR active=true
```

---

## 7. ARCHIVOS A MODIFICAR

### 7.1 `src/services/products.service.ts` — 3 cambios

1. Línea 13: `listActive()` — agregar `.eq('active', true)`
2. Línea 24: `search()` — agregar `.eq('active', true)`
3. (Opcional) Línea 36: `getById()` — puede validar `active`, pero bajo impacto

### 7.2 `src/services/dashboard.service.ts` — 3 cambios

1. Línea 78: `getCriticalStockProducts()` — agregar `.eq('active', true)`
2. Línea 176: `getTotalInventoryValue()` — agregar `.eq('active', true)`
3. Línea 188: `getStockStats()` — agregar `.eq('active', true)`

### 7.3 Validación opcional (bajo impacto)

- `src/services/sales.service.ts` — validar `active=true` antes de procesar
- `src/services/stock.service.ts` — validar `active=true` en operaciones
- `src/services/purchases.service.ts` — validar `active=true` en operaciones

---

## 8. CAMBIO PROPUESTO

Patrón uniforme:

**Antes:**
```typescript
.is('deleted_at', null)
```

**Después:**
```typescript
.is('deleted_at', null)
.eq('active', true)
```

O (si se quiere hacer `active` la única fuente):
```typescript
.eq('active', true)  // Reemplazar .is('deleted_at', null)
```

**Recomendación:** Mantener AMBOS filtros para máxima compatibilidad:
- `deleted_at = null` → soft-delete manual por usuario
- `active = true` → sincronización automática con Sysme

Un producto debe estar AMBOS activos para aparecer en catálogo operativo.

---

## 9. VALIDACIÓN REQUERIDA

Después de cambios:

```
✓ productos con active=true, deleted_at=null → APARECEN
✓ productos con active=false, deleted_at=null → NO APARECEN
✓ productos con active=true, deleted_at!=null → NO APARECEN
✓ productos con active=false, deleted_at!=null → NO APARECEN
```

---

## 10. CONSIDERACIONES ESPECIALES

### 10.1 Caché de React Query

- `queryKey: ['products']` en `useProducts.ts`
- Cambiar consulta invalida automáticamente

### 10.2 Realtime

- No afecta consultas iniciales
- Cambio de `active` en Supabase requiere invalidación

### 10.3 Historial

- `deleted_at` se conserva para auditoría
- `active` es el estado operativo nuevo
- Ambos campos coexisten

---

## 11. ARCHIVOS AUDITADOS

```
✓ src/services/products.service.ts
✓ src/services/dashboard.service.ts
✓ src/services/sales.service.ts
✓ src/services/stock.service.ts
✓ src/services/purchases.service.ts
✓ src/hooks/useProducts.ts
✓ src/components/pos-screen.tsx
✓ src/components/dashboard-screen.tsx
```

---

## 12. CONCLUSIÓN

El mismatch está **únicamente en servicios de lectura de catálogo**:

- `listActive()` — línea 13
- `search()` — línea 24
- `getCriticalStockProducts()` — línea 78
- `getTotalInventoryValue()` — línea 176
- `getStockStats()` — línea 188

**Todas necesitan agregar:** `.eq('active', true)`

**Solución mínima:** 5 líneas modificadas en 2 archivos.

**Complejidad:** Baja  
**Riesgo:** Bajo  
**Impacto:** Crítico (corrige el flujo de eliminación completamente)

---

**AUDITORÍA COMPLETADA — LISTO PARA CORRECCIONES**
