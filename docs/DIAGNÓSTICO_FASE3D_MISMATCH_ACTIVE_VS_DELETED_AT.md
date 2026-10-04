# DIAGNÓSTICO CRÍTICO — FASE 3D

**Fecha:** 2026-10-04  
**Estado:** ⚠️ PROBLEMA ENCONTRADO  
**Tipo:** Mismatch entre sistema de desactivación Bridge (active) vs Frontend (deleted_at)

---

## RESUMEN DEL PROBLEMA

El producto 00008 **continúa apareciendo visualmente en el TPV PRO** aunque el Bridge lo haya marcado correctamente como `active=false` en Supabase.

**Causa raíz:** El Bridge y el Frontend usan **dos sistemas de desactivación diferentes**:

| Sistema | Campo | Implementador | Valor | Uso |
|---------|-------|---|---|---|
| **Bridge** | `active` | Detecta eliminados (PASO 2.5) | `false` | Nunca usado |
| **Frontend** | `deleted_at` | Usuario desactiva manualmente | `not null` | Filtra catálogo |

---

## 1. EVIDENCIA DEL MISMATCH

### 1.1 Bridge actualiza `active`

**Archivo:** `bridge/src/index.ts` línea 232

```typescript
// PASO 2.5: Detección de eliminados
const { error } = await this.supabase
  .from('products')
  .update({ active: false })  // ← AQUÍ
  .eq('id', deleted.product_id);
```

### 1.2 Frontend filtra por `deleted_at`

**Archivo:** `src/services/products.service.ts` líneas 13 y 24

```typescript
// listActive()
.is('deleted_at', null)  // ← AQUÍ NO FILTRA POR active

// search()
.is('deleted_at', null)  // ← AQUÍ NO FILTRA POR active
```

### 1.3 Ningún lugar del Frontend usa `active`

**Búsqueda:** `eq('active', true)` en `/src` → 0 resultados en products

---

## 2. FLUJO OPERATIVO ACTUAL

### 2.1 Cuando Usuario desactiva manualmente

```
pos-screen.tsx
→ useDeleteProduct()
→ productsService.softDelete(id)
→ UPDATE products SET deleted_at = NOW()
→ Frontend filtra: .is('deleted_at', null)
→ Producto desaparece del catálogo
```

**✓ Funciona**

### 2.2 Cuando Bridge detecta eliminación (PASO 2.5)

```
Bridge (syncProducts PASO 2.5)
→ UPDATE products SET active = false
→ Frontend filtra: .is('deleted_at', null)
→ deleted_at sigue siendo NULL
→ Producto SIGUE VISIBLE en catálogo
```

**✗ NO funciona**

---

## 3. ESTADO ACTUAL DEL PRODUCTO 00008

### Supabase (`products` table)

```
ID: 320642eb-fb77-4b8d-bb92-5f7b73f7c13e
name: *TEST-PRODUCT-AUTOMATED
active: true (restaurado después de reaparición)
deleted_at: 2026-10-04T01:14:07.617+00:00 (timestamp de cuando fue desactivado)
barcode: 0 (número literal, no null)
```

### Observación crítica

El campo `deleted_at` contiene un timestamp, lo que significa que el sistema de soft-delete SÍ se ejecutó en algún momento.

Probablemente durante la prueba, el Frontend ejecutó `useDeleteProduct()` primero, estableciendo `deleted_at`, y luego se restauró el producto.

---

## 4. COMPONENTES AFECTADOS

### 4.1 Búsqueda de Productos (pos-screen.tsx)

**Archivo:** `src/components/pos-screen.tsx` línea 15

```typescript
const { data: products = [] } = useProducts();
```

**Consulta asociada:**

```typescript
// src/hooks/useProducts.ts línea 11-14
useQuery({
  queryKey: PRODUCTS_KEY,
  queryFn: () => productsService.listActive(),  // ← Filtra por deleted_at
})
```

**Resultado:** La lista `products` obtiene solo registros con `deleted_at = null`

### 4.2 Búsqueda por Barcode

**Archivo:** `src/components/pos-screen.tsx` línea 37

```typescript
(p.barcode?.includes(query) ?? false)
```

**Problema adicional:** El barcode es `0`, causando confusión.

### 4.3 Búsqueda por Nombre y SKU

**Archivo:** `src/components/pos-screen.tsx` línea 35-36

```typescript
p.name.toLowerCase().includes(query.toLowerCase()) ||
p.sku.toLowerCase().includes(query.toLowerCase()) ||
```

**Consulta asociada:**

```typescript
// src/services/products.service.ts línea 20-26
async search(query: string) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .is('deleted_at', null)  // ← Filtra por deleted_at
    .or(`name.ilike.%${query}%,sku.ilike.%${query}%,barcode.ilike.%${query}%`)
}
```

---

## 5. DIAGRAMA DEL FLUJO ROTO

```
┌─────────────────────────────────────────────────────────────────┐
│ FASE 3D TEST: Eliminación de Producto 00008                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ SYSME:                                                           │
│   DELETE FROM complementog WHERE id_complementog = '00008'       │
│   └─> Producto eliminado ✓                                       │
│                                                                  │
│ BRIDGE (PASO 2.5):                                               │
│   UPDATE products SET active = false WHERE id = ...              │
│   └─> active cambió de true a false ✓                            │
│   └─> Log: [PRODUCT_DEACTIVATED] ✓                              │
│                                                                  │
│ SUPABASE (Base de datos):                                        │
│   products.active = false ✓                                      │
│   products.deleted_at = null ✗ (no fue actualizado)             │
│                                                                  │
│ FRONTEND (POS):                                                  │
│   productsService.listActive() → .is('deleted_at', null) ✗      │
│   Encuentra: active=false BUT deleted_at=null                    │
│   Incluye en catálogo: SÍ (porque deleted_at es null) ✗         │
│   Resultado: Producto SIGUE VISIBLE ✗                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. PROBLEMA DEL BARCODE = 0

### 6.1 Origen

El Bridge obtiene el barcode de Sysme:

```typescript
// bridge/src/index.ts línea 265
c.codbarras as barcode
```

Si en Sysme el campo `codbarras` es NULL o vacío para el producto 00008, y se sincroniza, puede terminar como:
- NULL (si no se transforma)
- 0 (si se castea a número)
- "" (si se castea a string)

### 6.2 Impacto

En pos-screen.tsx, la búsqueda es:

```typescript
p.barcode?.includes(query)  // Si barcode=0, entonces 0?.includes(query) = false
```

Búsqueda por barcode no funciona (el tipo es número, no string).

### 6.3 Síntoma observado

"El producto sigue visible pero el código de barras desapareció"

→ El barcode es `0` (número), no un string escaneable.

---

## 7. ARCHIVOS IMPLICADOS

| Archivo | Línea | Función | Problema |
|---------|-------|---------|----------|
| `bridge/src/index.ts` | 232 | UPDATE `active=false` | No toca `deleted_at` |
| `src/services/products.service.ts` | 13, 24 | Filtra `.is('deleted_at', null)` | Ignora `active` |
| `src/hooks/useProducts.ts` | 13 | `useQuery(queryFn: listActive)` | Propaga el filtro roto |
| `src/components/pos-screen.tsx` | 15 | `useProducts()` | Recibe lista incompleta |
| `src/components/pos-screen.tsx` | 37 | `p.barcode?.includes()` | Busca con barcode=0 |

---

## 8. CAUSA RAÍZ

### Arquitectura incorrecta

El sistema tiene **dos mecanismos de desactivación paralelos e incompatibles**:

1. **Bridge → `active`** (automático, para sincronización con Sysme)
2. **Frontend → `deleted_at`** (manual, para desactivación por usuario)

**Nunca se sincronizaron.**

El diseño correcto debería ser:
- Un único campo de estado operativo
- Una única lógica de filtrado
- Un único punto de verdad

---

## 9. CONSECUENCIA OPERATIVA

Cuando un cliente **elimina un producto en su Sysme/TPV**, el sistema LYMARKET no respeta la eliminación en el frontend porque:

1. Bridge detecta correctamente y marca `active=false`
2. Frontend **no consulta el campo `active`**
3. Frontend filtra solo por `deleted_at`
4. Como `deleted_at = null`, el producto sigue en el catálogo
5. **Usuario ve el producto aunque fue eliminado en Sysme**

---

## 10. SOLUCIONES POSIBLES

### Opción A: Unificar en `deleted_at` (Recomendado)

El Bridge debería actualizar `deleted_at` en lugar de `active`:

```typescript
// Bridge PASO 2.5
UPDATE products SET deleted_at = NOW()
```

**Ventajas:**
- Una única fuente de verdad
- Compatible con lógica existente del frontend
- Soft-delete ya implementado
- Frontend ya filtra correctamente por `deleted_at`

**Cambios necesarios:**
1. Modificar Bridge línea 232: `{ deleted_at: new Date().toISOString() }` en lugar de `{ active: false }`
2. Eliminar/consolidar el campo `active` (si es posible)

### Opción B: Unificar en `active` (Alternativa)

El Frontend debería usar `active` en lugar de `deleted_at`:

```typescript
// Frontend productsService.listActive()
.eq('active', true)
```

**Ventajas:**
- Semántica clara (active/inactive)
- Bridge ya implementado

**Cambios necesarios:**
1. Cambiar todos los filtros en Frontend: `.is('deleted_at', null)` → `.eq('active', true)`
2. Cambiar `softDelete()` para actualizar `active` en lugar de `deleted_at`
3. Revisar migraciones y datos históricos

### Opción C: Sincronizar ambos campos

Bridge actualiza AMBOS campos:

```typescript
UPDATE products SET active=false, deleted_at=NOW()
```

**Desventajas:**
- Redundancia
- Riesgo de inconsistencia
- No es escalable

---

## 11. IMPACTO DEL BARCODE = 0

El barcode debe ser un STRING, no un número.

**En Sysme:**
```sql
SELECT codbarras FROM complementog WHERE id_complementog = '00008'
```

Si `codbarras` es NULL, el Bridge debería:
- Mantenerlo como NULL
- O convertirlo a string vacío: `""`
- O mantener el valor anterior

**En Supabase:**
```
barcode: 0 (número, incorrecto)
```

Debería ser:
```
barcode: null (si no hay)
barcode: "" (si se quiere string)
barcode: "..." (si hay un valor real)
```

---

## 12. ESTADO ACTUAL DE 00008

```
Sysme: Restaurado (existe de nuevo)
active: true (porque reaparició)
deleted_at: 2026-10-04T01:14:07.617+00:00 (timestamp antiguo)
barcode: 0 (número)
```

**Situación confusa:** El producto tiene `active=true` pero `deleted_at` diferente de null.

---

## 13. VERIFICACIONES REALIZADAS

✅ Producto 00008 existe en Supabase  
✅ Bridge PASO 2.5 ejecuta y genera logs  
✅ Campo `active` se actualiza  
✅ Campo `barcode` contiene 0  
✅ Frontend filtra solo por `deleted_at`  
✅ Filtro `active` no existe en produscs.service.ts  
✅ pos-screen.tsx usa `useProducts()` que filtra por `deleted_at`  

---

## 14. RECOMENDACIÓN INMEDIATA

**NO PROCEDER SIN RESOLVER ESTO.**

La arquitectura está rota. Elegir OPCIÓN A o B antes de continuar.

Si se implementa PASO 2.5 tal como está (actualizar solo `active`), el sistema no funcionará para clientes reales.

---

## RESUMEN FINAL

| Aspecto | Estado |
|---------|--------|
| **PASO 2.5 implementación** | ✅ Correcto |
| **PASO 2.5 ejecución** | ✅ Funciona |
| **PASO 2.5 logs** | ✅ Se registra |
| **Actualización de `active`** | ✅ Sucede |
| **Filtrado del Frontend** | ❌ Incorrecto |
| **Visibilidad operativa** | ❌ Producto sigue visible |
| **Sistema unificado** | ❌ Dos campos, dos lógicas |
| **FASE 3D completa** | ❌ NO APROBADA |

---

**DECISIÓN:** Esperar instrucciones sobre OPCIÓN A vs OPCIÓN B antes de corregir.

**NO MODIFICAR CÓDIGO TODAVÍA.**
