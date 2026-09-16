# 🔍 AUDITORÍA: STOCK Y MAPEO PANEL ↔ SYSME TPV

**Fecha:** 16 de septiembre de 2026  
**Auditor:** Claude Code  
**Tipo:** Análisis de LECTURA SOLO - Sin modificaciones  
**Objetivo:** Identificar estructura actual de productos y stock para integración Bridge Windows

---

## A TABLA DE PRODUCTOS REAL DEL PANEL

### Ubicación
```
📁 src/lib/pos-data.ts
   └─ export const products: Product[]
```

### Estructura TypeScript (REAL)

```typescript
export type Product = {
  id: number                    // ID numérico (1-8 actualmente)
  name: string                  // Nombre producto (ej: "Inca Kola 300 ml")
  category: string              // Categoría (duplicado como string)
  supplier: string              // Proveedor (duplicado como string)
  price: number                 // Precio venta (decimal)
  cost: number                  // Costo compra (decimal)
  stock: number                 // Stock actual (entero)
  min: number                   // Stock mínimo (entero)
  barcode: string               // EAN13 (ej: "7750011001847")
  sku: string                   // SKU interno (ej: "BEB-INK-300")
  image: string                 // URL/path de imagen
  state: StockState             // Estado calculado: "ok" | "low" | "critical" | "out"
}
```

### Datos Reales Actuales (8 productos)

| id | Nombre | SKU | Barcode | Stock | Min | Precio | Costo |
|----|--------|-----|---------|-------|-----|--------|-------|
| 1 | Inca Kola 300 ml | BEB-INK-300 | 7750011001847 | 42 | 12 | 2.50€ | 1.35€ |
| 2 | Maltín Polar 330 ml | BEB-MAL-330 | 7590006701218 | 8 | 12 | 2.25€ | 1.20€ |
| 3 | Chifles salados 150 g | SNA-CHI-150 | 8437019431502 | 24 | 10 | 2.95€ | 1.45€ |
| 4 | Panela colombiana 500 g | DUL-PAN-500 | 7702011105004 | 5 | 8 | 3.80€ | 2.10€ |
| 5 | Ají amarillo pasta 225 g | CON-AJI-225 | 7750106002254 | 16 | 6 | 4.60€ | 2.55€ |
| 6 | Dulce de leche 450 g | DUL-DDL-450 | 7790580104501 | 11 | 10 | 4.25€ | 2.30€ |
| 7 | Harina PAN blanca 1 kg | PAN-HAR-1KG | 7591002001012 | 36 | 15 | 3.40€ | 1.85€ |
| 8 | Yuca congelada 1 kg | CON-YUC-1KG | 8410101081006 | 0 | 8 | 5.90€ | 3.20€ |

### Características del Array `products`

```typescript
// Importado y usado en TODO el frontend
import { products } from "@/lib/pos-data"

// Usado en:
- Dashboard Screen
- POS Screen (TPV Venta)
- Products Screen
- Inventory Screen (Stock)
- Business Screens (Suppliers, Purchases, Sales)
```

---

## B) CAMPO DE STOCK REAL

### Ubicación del Campo
```
products[i].stock: number
```

### Rango Actual
- **Mínimo:** 0 (producto Yuca)
- **Máximo:** 42 (producto Inca Kola)
- **Promedio:** 17.75 unidades

### Cálculo del Estado (StockState)

```typescript
// Lógica en pos-data.ts:
export type StockState = "ok" | "low" | "critical" | "out"

// Implementación observada en components:
estado = 
  stock === 0                 ? "out"      // Sin stock
  stock < min                 ? "critical" // Por debajo del mínimo
  stock < min * 1.5          ? "low"      // Bajo (entre min y 1.5x min)
  else                        ? "ok"       // Correcto

// Ejemplo aplicado a producto id=2 (Maltín Polar):
- stock = 8
- min = 12
- 8 < 12 = true  → state = "low"
```

### Actualización de Stock

❌ **NO EXISTE CÓDIGO QUE ACTUALICE STOCK**

**Hallazgos:**

1. **POS Screen (TPV Venta)**
   - Botón: "Cobrar en efectivo" → `toast.success()` (sin persistencia)
   - Botón: "Cobrar con tarjeta" → `toast.success()` (sin persistencia)
   - ⚠️ **El stock NO se decrementa al vender**

2. **Purchases Screen (Compras)**
   - Botón: "Registrar compra" → `<PackagePlus/>Registrar compra`
   - ⚠️ **NO hace nada, solo muestra HTML sin onClick handler**
   - El stock NO se incrementa al comprar

3. **Inventory Screen (Stock)**
   - Botón: "Registrar ajuste" → `<SlidersHorizontal/>Registrar ajuste`
   - ⚠️ **NO hace nada, solo muestra HTML sin onClick handler**
   - El stock NO se ajusta manualmente

4. **Products Screen**
   - "Editar producto" → Sin implementación
   - "Ver movimientos" → Sin implementación
   - "Eliminar" → Sin implementación

### Conclusión Sobre Stock

```
┌────────────────────────────────────────────┐
│ ESTADO ACTUAL DEL STOCK                    │
├────────────────────────────────────────────┤
│ Campo: products[i].stock (number)          │
│ Tipo de dato: Entero (integer)             │
│ Rango: 0-42 actualmente                    │
│ Actualización: ❌ NO IMPLEMENTADA          │
│ Persistencia: ❌ EN MEMORIA (se pierden)   │
│ Base de datos: ❌ NO EXISTE                │
└────────────────────────────────────────────┘
```

---

## C) IDENTIFICADOR/SKU/CÓDIGO DE BARRAS DISPONIBLE

### Campos Disponibles para Mapeo

| Campo | Tipo | Ejemplo | Características | Único |
|-------|------|---------|-----------------|-------|
| **id** | number | 1 | Numérico secuencial | ✅ |
| **sku** | string | "BEB-INK-300" | Código interno | ✅ |
| **barcode** | string | "7750011001847" | EAN13 | ✅ |
| **name** | string | "Inca Kola 300 ml" | Nombre | ❌ |

### Disponibilidad en Frontend

```typescript
// Búsqueda en POS Screen (pos-screen.tsx)
const p = products.find(p =>
  p.name.toLowerCase().includes(query.toLowerCase()) ||   // ✅ Soportado
  p.barcode.includes(query)                                // ✅ Soportado
)

// Campos mostrados en Productos Screen:
- Nombre: p.name
- Barcode: p.barcode
- SKU: p.sku
- Categoría: p.category
- Proveedor: p.supplier
```

### Recomendación

Para mapeo con Sysme:

**Opción 1: Usar Barcode (EAN13) - RECOMENDADO**
```
Panel:      products.barcode = "7750011001847"
Sysme:      codbarras = "000100001" (convertir)
Problema:   EAN13 vs formato Sysme diferente
Solución:   Tabla de mapeo: barcode_panel → codbarras_sysme
```

**Opción 2: Usar SKU - ALTERNATIVO**
```
Panel:      products.sku = "BEB-INK-300"
Sysme:      NO TIENE SKU DIRECTO
Problema:   SKU no existe en Sysme
Solución:   Guardar SKU panel en campo custom de Sysme
```

**Opción 3: Usar ID interno + ID Empresa - COMPLEJO**
```
Panel:      products.id = 1
Sysme:      id_empresa + id_centro + id_tipo_comg + id_complementog
Problema:   IDs no coinciden estructuralmente
Solución:   Tabla de mapeo detallada con toda la composición
```

---

## D) MÉTODO ACTUAL DE ACTUALIZACIÓN DE STOCK

### Componentes que Intentan Actualizar Stock

#### 1. POS Screen (`src/components/pos-screen.tsx`)

```typescript
// Línea 10-11
const [cart, setCart] = useState<CartItem[]>([...]);

// El carrito es LOCAL, nunca se persiste
const change = (id: number, delta: number) => 
  setCart(c => c.map(x => x.id === id ? {...x, qty: Math.max(1, x.qty + delta)} : x))

// Al hacer clic "Cobrar en efectivo"
<Button onClick={() => toast.success("Cobro en efectivo preparado")}>
  // ⚠️ SOLO TOAST, NO HAY ACTUALIZACIÓN DE STOCK
</Button>
```

**Conclusión:** NO actualiza stock.

---

#### 2. Purchases Screen (`src/components/business-screens.tsx`, línea 15)

```typescript
const PurchasesScreen = () => {
  const [rows, setRows] = useState([{id:7, q:24}, {id:2, q:12}, {id:4, q:10}])
  const total = rows.reduce((a,r) => a + (products.find(p=>p.id===r.id)?.cost??0)*r.q, 0)
  
  return (
    // ... tabla de compra ...
    <Button>Registrar compra</Button>  // ⚠️ NO TIENE onClick HANDLER
  )
}
```

**Conclusión:** NO actualiza stock. El botón es decorativo.

---

#### 3. Inventory Screen (`src/components/inventory-screen.tsx`, línea 12)

```typescript
const InventoryScreen = () => {
  const [filter, setFilter] = useState("all")
  const visible = filter==="all" ? products : products.filter(p=>p.state!==filter)
  
  return (
    // ... tabla de stock ...
    <Button>Registrar ajuste</Button>  // ⚠️ NO TIENE onClick HANDLER
  )
}
```

**Conclusión:** NO actualiza stock. El botón es decorativo.

---

### Método de Actualización Detectado

```
┌─────────────────────────────────────────────────────────┐
│ MÉTODO ACTUAL DE ACTUALIZACIÓN DE STOCK                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. LECTURA:  products (import desde pos-data.ts) ✅   │
│  2. RENDER:   Mostrar products[i].stock           ✅   │
│  3. ESCRIBIR: ❌ NO IMPLEMENTADO                       │
│  4. PERSIST:  ❌ NO EXISTE                             │
│  5. SYNC:     ❌ NO EXISTE                             │
│                                                          │
│ RESULTADO: Stock es READ-ONLY en frontend             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## E) RECOMENDACIÓN TÉCNICA PARA MAPEO SYSME → PANEL

### Comparativa: Sysme vs Panel

```
SYSME TPV (Datos reales proporcionados)
═════════════════════════════════════════════════════════════
id_empresa:     001
id_centro:      01
id_tipo_comg:   0001
id_complementog: 00001
codbarras:      000100001
nombre:         Product 1


PANEL ACTUAL (En memoria)
═════════════════════════════════════════════════════════════
id:        1
sku:       BEB-INK-300
barcode:   7750011001847
name:      Inca Kola 300 ml
stock:     42
```

### Estrategia de Mapeo Recomendada

**PROBLEMA FUNDAMENTAL:**
- Sysme identifica productos por: `(id_empresa, id_centro, id_tipo_comg, id_complementog)`
- Panel identifica productos por: `id` numérico simple

**SOLUCIÓN RECOMENDADA: Tabla de Mapeo Bidireccional**

```sql
-- Tabla que NO EXISTE actualmente, NECESARIO CREAR:
CREATE TABLE sysme_product_map (
  id BIGINT PRIMARY KEY,
  
  -- Identificadores Panel
  panel_product_id INTEGER,
  panel_sku TEXT,
  panel_barcode TEXT,
  
  -- Identificadores Sysme
  sysme_empresa TEXT,
  sysme_centro TEXT,
  sysme_tipo_comg TEXT,
  sysme_complementog TEXT,
  sysme_codbarras TEXT,
  
  -- Control
  sync_status TEXT,
  last_sync TIMESTAMP,
  
  UNIQUE(panel_product_id),
  UNIQUE(sysme_empresa, sysme_centro, sysme_tipo_comg, sysme_complementog)
);
```

**Ejemplo de mapeo:**

| panel_product_id | panel_sku | panel_barcode | sysme_empresa | sysme_centro | sysme_tipo_comg | sysme_complementog | sysme_codbarras |
|------------------|-----------|---------------|---------------|--------------|-----------------|-------------------|-----------------|
| 1 | BEB-INK-300 | 7750011001847 | 001 | 01 | 0001 | 00001 | 000100001 |
| 2 | BEB-MAL-330 | 7590006701218 | 001 | 01 | 0001 | 00002 | 000100002 |

### Flujo de Sincronización Recomendado

```
Sysme TPV Local
(datos maestros)
       │
       ├─→ Bridge Windows
       │   (servicio de sincronización)
       │
       ├─→ HTTPS → Supabase
       │   • Lookup en sysme_product_map
       │   • Encontrar panel_product_id
       │   • UPDATE products.stock
       │
       └─→ Panel React
           (mostrar stock actualizado)
```

### Identificador Recomendado para Usar

**OPCIÓN A: Usar `id_complementog` de Sysme como PK**
```
Ventaja:   Simple, numérico
Desventaja: Puede haber colisiones si múltiples centros
```

**OPCIÓN B: Usar composición completa**
```
sysme_id = `${empresa}_${centro}_${tipo}_${complemento}`
Ejemplo:   "001_01_0001_00001"
```

**OPCIÓN C: Usar Barcode (RECOMENDADO)**
```
Ventaja:   Universal, EAN13 es estándar
Desventaja: Conversión de formato (000100001 → 7750011001847?)
```

**RECOMENDACIÓN FINAL:**
```
Usar combinación:
├─ Barcode como PRIMARY para búsqueda rápida
├─ (empresa, centro, tipo, complemento) como UNIQUE CONSTRAINT
└─ tabla sysme_product_map para mantener histórico
```

---

## F) ARCHIVOS DEL PROYECTO QUE INTERVIENEN EN STOCK

### Archivos que LEEN stock

| Archivo | Línea | Uso |
|---------|-------|-----|
| `src/lib/pos-data.ts` | 11-22 | Define estructura Product y datos |
| `src/components/dashboard-screen.tsx` | - | Lee product.stock, product.state |
| `src/components/pos-screen.tsx` | 4 | Importa products |
| `src/components/products-screen.tsx` | 16 | Muestra p.stock en tabla |
| `src/components/inventory-screen.tsx` | 12 | Filtra por p.state, muestra p.stock |
| `src/components/business-screens.tsx` | 4, 14, 15 | Lee p.stock en suppliers, purchases |
| `src/components/pos-ui.tsx` | - | StockBadge muestra estado |

### Archivos que INTENTA escribir stock

| Archivo | Función | Estado |
|---------|---------|--------|
| `src/components/pos-screen.tsx` | Cobrar en efectivo/tarjeta | ❌ Mock (toast) |
| `src/components/business-screens.tsx` | Registrar compra | ❌ Sin handler |
| `src/components/inventory-screen.tsx` | Registrar ajuste | ❌ Sin handler |

### Archivos que DEBERÍAN ser modificados

```
PARA INTEGRACIÓN CON SYSME:

1. ✅ src/lib/pos-data.ts
   └─ Agregar field: sysme_id o sysme_complementog

2. ✅ src/routes/ (crear)
   └─ Crear endpoint POST /api/products/sync-stock

3. ✅ src/hooks/ (crear)
   └─ Crear useStockSync() para polling/webhooks

4. ✅ src/types/ (crear)
   └─ Definir tipos para respuesta de Sysme

5. ⚠️ src/components/pos-screen.tsx
   └─ Agregar persistencia al vender

6. ⚠️ src/components/business-screens.tsx
   └─ Agregar handlers a botones

7. ⚠️ src/components/inventory-screen.tsx
   └─ Agregar handlers a botones
```

---

## G) QUÉ NECESITAMOS CONSTRUIR PARA EL BRIDGE

### Arquitectura Propuesta

```
┌──────────────────┐
│  SYSME TPV LOCAL │
│  (Windows .exe)  │
│                  │
│  Almacena:       │
│  • Productos     │
│  • Stock         │
│  • Transacciones │
└────────┬─────────┘
         │
         │ (API local)
         ↓
┌──────────────────────────────────────┐
│     BRIDGE WINDOWS (Node.js)         │
│  (Servicio que corre en Windows)    │
│                                      │
│  1. Lee de Sysme (API local)        │
│  2. Transforma datos               │
│  3. Mapea IDs (sysme_product_map)  │
│  4. Sincroniza con Supabase        │
│  5. Maneja conflictos              │
└────────────┬────────────────────────┘
             │
             │ HTTPS
             │ (Requiere Supabase)
             ↓
   ┌─────────────────────────┐
   │    SUPABASE POSTGRESQL  │
   │  (Base de datos cloud)  │
   ├─────────────────────────┤
   │ Tablas:                 │
   │ • products              │
   │ • stock_movements       │
   │ • sysme_product_map     │
   │ • sync_log              │
   └────────────┬────────────┘
                │
                │ Supabase Client
                │ (React Query)
                ↓
      ┌──────────────────────┐
      │  PANEL REACT (WEB)   │
      │  Muestra datos       │
      │  en tiempo real      │
      └──────────────────────┘
```

### Componentes del Bridge a Construir

#### 1. Servicio de Lectura de Sysme

```typescript
// bridge-windows/src/sysme/reader.ts

interface SysmeProduct {
  id_empresa: string
  id_centro: string
  id_tipo_comg: string
  id_complementog: string
  codbarras: string
  nombre: string
  stock: number
  precio: number
  costo: number
}

class SysmeReader {
  async getProducts(): Promise<SysmeProduct[]> {
    // Conectar a API local de Sysme
    // O leer BD de Sysme directamente
  }
  
  async getStockMovements(): Promise<StockMovement[]> {
    // Traer cambios de stock
  }
}
```

#### 2. Servicio de Mapeo

```typescript
// bridge-windows/src/mapeo/mapper.ts

class ProductMapper {
  async mapSysmeToPanel(sysmeProduct: SysmeProduct) {
    // 1. Buscar en tabla sysme_product_map
    // 2. Obtener panel_product_id
    // 3. Retornar datos para actualizar
    
    return {
      panel_id: mapped.panel_product_id,
      stock: sysmeProduct.stock,
      price: sysmeProduct.precio,
      timestamp: new Date()
    }
  }
}
```

#### 3. Servicio de Sincronización a Supabase

```typescript
// bridge-windows/src/supabase/syncer.ts

class SupabaseSync {
  async syncStock(product: MappedProduct) {
    // UPDATE products SET stock = ...
    // INSERT INTO stock_movements ...
    // Manejar conflictos
  }
  
  async handleConflicts(local: Product, sysme: SysmeProduct) {
    // Si timestamp_sysme > timestamp_panel
    //   → usar stock de Sysme
    // Else
    //   → mantener stock actual
  }
}
```

#### 4. Configuración del Bridge

```typescript
// bridge-windows/config.ts

export const BRIDGE_CONFIG = {
  // Conexión a Sysme
  SYSME: {
    API_URL: "http://localhost:8080",
    DB_HOST: "127.0.0.1",
    DB_PORT: 1433,
    DB_NAME: "SYSME_DB"
  },
  
  // Conexión a Supabase
  SUPABASE: {
    URL: process.env.VITE_SUPABASE_URL,
    KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    TABLE: "products"
  },
  
  // Sincronización
  SYNC: {
    INTERVAL: 5 * 60 * 1000,  // 5 minutos
    RETRY_ATTEMPTS: 3,
    TIMEOUT: 10000
  }
}
```

### Tabla que Necesita Existir en Supabase

```sql
-- Esta tabla ES NECESARIA CREAR
CREATE TABLE sysme_product_map (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  
  -- Lado Panel
  panel_product_id BIGINT NOT NULL UNIQUE,
  panel_sku TEXT,
  panel_barcode TEXT,
  
  -- Lado Sysme
  sysme_empresa TEXT NOT NULL,
  sysme_centro TEXT NOT NULL,
  sysme_tipo_comg TEXT NOT NULL,
  sysme_complementog TEXT NOT NULL,
  sysme_codbarras TEXT,
  
  -- Control de sincronización
  sync_status TEXT DEFAULT 'synced',
  last_sync_from_sysme TIMESTAMP,
  last_sync_to_sysme TIMESTAMP,
  error_message TEXT,
  
  -- Auditoría
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(sysme_empresa, sysme_centro, sysme_tipo_comg, sysme_complementog),
  FOREIGN KEY (panel_product_id) REFERENCES products(id)
);

-- Tabla para registrar sincronizaciones
CREATE TABLE sync_log (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  
  product_id BIGINT,
  operation TEXT,
  source TEXT,
  status TEXT,
  message TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Endpoints que Necesita Crear el Bridge

```
POST /api/bridge/sync
├─ Triggered: cada 5 minutos (polling)
├─ Payload: { timestamp, products: [] }
└─ Response: { synced: N, errors: [] }

POST /api/bridge/stock/update
├─ Triggered: webhook desde Sysme
├─ Payload: { sysme_id, stock, timestamp }
└─ Response: { success, panel_id, stock }

GET /api/bridge/status
├─ Retorna: health check
└─ Response: { connected, last_sync, pending }
```

### Tecnologías para el Bridge

```
Opciones:

1. Node.js Express (RECOMENDADO)
   - npm install express supabase dotenv
   - Fácil de ejecutar como Windows Service
   
2. .NET C# (Si Sysme es .NET)
   - Supabase.Postgrest
   - DirectAccess a BD Sysme
   
3. Python + FastAPI
   - Más simple para lógica de mapeo
   - Harder para Windows Service

RECOMENDACIÓN: Node.js Express
```

---

## RESUMEN TÉCNICO

### Problemas Encontrados

| Problema | Severidad | Impacto |
|----------|-----------|--------|
| No existe BD real | 🔴 CRÍTICO | Stock no persiste |
| Stock es READ-ONLY | 🔴 CRÍTICO | No se puede actualizar |
| No hay Supabase | 🔴 CRÍTICO | No se puede integrar |
| Botones sin handlers | 🟡 ALTO | UI incompleta |
| No hay RLS | 🟡 ALTO | Sin seguridad |

### Dependencias para Integración

```
❌ ANTES DE BRIDGE:
   • Crear proyecto Supabase
   • Migrar datos a Supabase
   • Conectar frontend a Supabase

✅ PARA BRIDGE:
   • Tabla sysme_product_map
   • Endpoints de sincronización
   • Servicio Bridge Windows
```

### Plan de Implementación del Bridge

#### Fase 1: Setup (1 semana)
- [ ] Crear proyecto Node.js
- [ ] Configurar Supabase SDK
- [ ] Crear tabla sysme_product_map
- [ ] Documentar API de Sysme

#### Fase 2: Lectura de Sysme (1 semana)
- [ ] Conectar a BD/API de Sysme
- [ ] Extraer productos
- [ ] Extraer movimientos de stock
- [ ] Testing

#### Fase 3: Mapeo (1 semana)
- [ ] Implementar mapper
- [ ] Detectar productos nuevos
- [ ] Manejar cambios de IDs
- [ ] Logging

#### Fase 4: Sincronización (1 semana)
- [ ] Escribir en Supabase
- [ ] Manejar conflictos
- [ ] Polling + Webhook
- [ ] Retry logic

#### Fase 5: Testing e Integración (1 semana)
- [ ] Testing de flujos
- [ ] Validación de datos
- [ ] Performance
- [ ] Documentación

**Total: 5 semanas**

---

## CHECKLIST DE INFORMACIÓN REQUERIDA

Para construir el Bridge, NECESITAMOS:

### De Sysme

```
□ ¿Cómo acceder a Sysme?
  □ IP/Puerto: ________
  □ Usuario/Password: ________
  □ ¿API REST disponible? SÍ / NO
  □ ¿Acceso directo a BD? SÍ / NO (tipo: ________)

□ Estructura de tabla de productos en Sysme:
  □ Nombre exacto de tabla: ________
  □ Columnas: ________
  □ ¿Hay tabla de stock separada? SÍ / NO

□ Cómo identifica Sysme los productos:
  □ PK: ________
  □ Unique key: ________
  □ ¿Incluye movimientos de stock? SÍ / NO

□ Cambios de stock en Sysme:
  □ ¿Se puede leer historial? SÍ / NO
  □ ¿Hay tabla de movimientos? SÍ / NO
  □ ¿Hay timestamp? SÍ / NO
  □ ¿Hay usuario que hizo cambio? SÍ / NO
```

### Del Panel (PANEL)

```
✅ Todo ya investigado
   • Tabla: products (array en memoria)
   • Campos: id, stock, barcode, sku
   • Actualización: ❌ NO EXISTE
```

---

## CONCLUSIÓN

### Estado Actual

```
┌─────────────────────────────────────┐
│ PANEL ACTUAL                        │
├─────────────────────────────────────┤
│ Stock: products[i].stock (number)   │
│ Fuente: pos-data.ts (hardcoded)     │
│ Persistencia: ❌ NO                 │
│ Integración Sysme: ❌ NO            │
└─────────────────────────────────────┘
```

### Qué se Necesita

```
1. ✅ Estructura Panel identificada
   └─ ID: entero | SKU: texto | Barcode: EAN13

2. 🔄 Base de datos Supabase
   └─ CON tabla sysme_product_map

3. 🛠️ Bridge Windows (Node.js)
   └─ Sincronización cada 5 min o webhook

4. 📋 Información de Sysme
   └─ API/BD, estructura, IDs
```

### Mapeo Recomendado

```
Sysme Product ID
(id_empresa, id_centro, id_tipo_comg, id_complementog)
              ↓
       [sysme_product_map tabla]
              ↓
        Panel Product ID
           (entero)
              ↓
      products[i].stock
      (actualizar vía Bridge)
```

---

**Auditoría completada. Sin cambios realizados. Listo para integración.**

