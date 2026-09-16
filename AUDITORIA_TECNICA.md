# 📋 AUDITORÍA TÉCNICA COMPLETA
## Proyecto: Latin POS - TPV PRO (Mercado Central)
**Fecha de Auditoría:** 15 de septiembre de 2026  
**Auditor:** Claude Code  
**Estado:** ANÁLISIS PRELIMINAR - SIN CAMBIOS

---

## 1. TECNOLOGÍA UTILIZADA

### Stack Frontend
| Componente | Versión | Propósito |
|-----------|---------|----------|
| **React** | 19.2.0 | Framework de UI |
| **TypeScript** | 5.8.3 | Tipado estático |
| **Vite** | 8.1.5 | Bundler y dev server |
| **TanStack Start** | 1.168.32 | Framework full-stack con SSR |
| **TanStack Router** | 1.170.18 | Enrutador tipo archivo |
| **TanStack React Query** | 5.101.1 | Gestión de estado y caché |
| **Tailwind CSS** | 4.2.1 | Estilos utilitarios |
| **Radix UI** | Múltiples | Componentes sin estilos |
| **Lucide React** | 0.575.0 | Iconografía |
| **Recharts** | 2.15.4 | Gráficos y visualización |
| **React Hook Form** | 7.71.2 | Gestión de formularios |
| **Zod** | 3.25.76 | Validación de esquemas |

### Stack Backend/Servidor
- **Nitro** | 3.0.260603-beta | Servidor HTTP (puede ser Cloudflare Workers, Node.js, etc.)
- **h3** | (implícito en Nitro) | Manejo de middleware

### Gestión de Dependencias
- **npm** / **Bun** (bunfig.toml presente)

---

## 2. ESTRUCTURA DE CARPETAS RELEVANTE

```
src/
├── components/
│   ├── app-shell.tsx              # Layout principal de la app
│   ├── dashboard-screen.tsx       # Panel de control
│   ├── pos-screen.tsx             # Pantalla TPV Venta
│   ├── products-screen.tsx        # Catálogo de productos
│   ├── inventory-screen.tsx       # Stock e inventario
│   ├── business-screens.tsx       # Categorías, Proveedores, Compras, Ventas, Reportes
│   ├── settings-screen.tsx        # Configuración
│   ├── pos-context.tsx            # Contexto global (idioma, tema)
│   ├── pos-ui.tsx                 # Componentes UI reutilizables
│   └── ui/                        # Biblioteca de componentes Radix/Tailwind
├── routes/
│   ├── __root.tsx                 # Raíz con QueryClient y PosProvider
│   ├── index.tsx                  # Dashboard
│   ├── pos.tsx                    # TPV Venta
│   ├── products.tsx               # Productos
│   ├── categories.tsx             # Categorías
│   ├── stock.tsx                  # Stock
│   ├── suppliers.tsx              # Proveedores
│   ├── purchases.tsx              # Compras
│   ├── sales.tsx                  # Ventas
│   ├── reports.tsx                # Reportes
│   └── settings.tsx               # Configuración
├── lib/
│   ├── pos-data.ts                # 🔴 DATOS EN MEMORIA (origen actual de todos los datos)
│   ├── utils.ts                   # Funciones utilitarias
│   ├── error-capture.ts           # Captura de errores
│   └── lovable-error-reporting.ts # Integración con Lovable
├── styles.css                     # Estilos globales
├── router.tsx                     # Configuración del router
└── server.ts                      # Entry point del servidor

public/
└── assets/                        # Imágenes de productos (8 JPG)

```

---

## 3. CONEXIÓN CON SUPABASE

### ⚠️ ESTADO ACTUAL: SIN CONEXIÓN

**Hallazgo crítico:** El proyecto **NO ESTÁ CONECTADO A SUPABASE** en este momento.

- ❌ No hay imports de `@supabase/supabase-js`
- ❌ No hay variables de entorno `VITE_SUPABASE_URL` o `VITE_SUPABASE_KEY`
- ❌ No hay cliente de Supabase instanciado
- ❌ No hay llamadas a APIs de Supabase
- ❌ No hay autenticación de Supabase

### Datos Actuales
**TODOS los datos están almacenados en el archivo `src/lib/pos-data.ts` como constantes TypeScript en memoria.**

```typescript
// Importados desde pos-data.ts
- products: Product[]
- salesWeek: Array
- categorySales: Array
- monthly: Array
- suppliers: Array
- tickets: Array
```

Esto significa que:
1. No hay persistencia entre sesiones
2. No hay base de datos real
3. No hay sincronización multiusuario
4. Los cambios solo ocurren en memoria (se pierden al recargar)

---

## 4. PROYECTO/BASE DE DATOS DE SUPABASE

🔴 **NO EXISTE NINGÚN PROYECTO SUPABASE CONECTADO ACTUALMENTE**

**Propuesta:** Para la integración con Sysme TPV, será necesario:
1. Crear un nuevo proyecto en Supabase
2. Definir el esquema de base de datos (PostgreSQL)
3. Crear tablas para cada entidad
4. Instalar `@supabase/supabase-js`
5. Configurar variables de entorno

---

## 5. TABLAS REQUERIDAS Y ESTRUCTURA

### 5.1 Tabla: `products` (Productos)

**Propósito:** Almacenar catálogo de productos disponibles

```sql
CREATE TABLE products (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL,
  description TEXT,
  category_id BIGINT NOT NULL REFERENCES categories(id),
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id),
  barcode TEXT UNIQUE NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  cost NUMERIC(10, 2) NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);
```

**Relaciones:**
- FK `category_id` → `categories.id`
- FK `supplier_id` → `suppliers.id`

**RLS:** Lectura pública, escritura solo para usuarios autenticados

---

### 5.2 Tabla: `categories` (Categorías)

```sql
CREATE TABLE categories (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  order_index INTEGER,
  icon TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Valores actuales:**
- Bebidas
- Snacks
- Limpieza
- Congelados
- Dulces
- Panadería
- Conservas
- Lácteos

**RLS:** Lectura pública, escritura solo admin

---

### 5.3 Tabla: `suppliers` (Proveedores)

```sql
CREATE TABLE suppliers (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL UNIQUE,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT,
  contact_person TEXT,
  payment_terms TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);
```

**Relaciones:**
- 1:N con `products` (un proveedor puede suministrar muchos productos)
- 1:N con `purchases` (un proveedor puede tener muchas compras)

**RLS:** Lectura solo usuarios autenticados, escritura solo admin

---

### 5.4 Tabla: `stock_movements` (Movimientos de Inventario)

```sql
CREATE TABLE stock_movements (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  product_id BIGINT NOT NULL REFERENCES products(id),
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  reason TEXT,
  reference_id TEXT,
  reference_table TEXT,
  employee_id BIGINT REFERENCES users(id),
  location TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Tipos de movimiento:**
- `entrada` (Entrada de compra)
- `salida` (Venta)
- `ajuste` (Ajuste manual)
- `merma` (Pérdida/rotura)

**RLS:** Lectura según permisos, inserción logueados

---

### 5.5 Tabla: `sales` (Ventas/Tickets)

```sql
CREATE TABLE sales (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  ticket_number TEXT UNIQUE NOT NULL,
  sale_date TIMESTAMP DEFAULT NOW(),
  total NUMERIC(10, 2) NOT NULL,
  tax NUMERIC(10, 2) NOT NULL,
  profit NUMERIC(10, 2) NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT DEFAULT 'completed',
  employee_id BIGINT REFERENCES users(id),
  cashier_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Relaciones:**
- 1:N con `sale_items` (un ticket tiene múltiples líneas)
- FK `employee_id` → `users.id`

**RLS:** Lectura logueados, escritura logueados

---

### 5.6 Tabla: `sale_items` (Líneas de Venta)

```sql
CREATE TABLE sale_items (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  subtotal NUMERIC(10, 2) NOT NULL,
  discount NUMERIC(10, 2) DEFAULT 0,
  tax NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Relaciones:**
- FK `sale_id` → `sales.id` (cascada)
- FK `product_id` → `products.id`

**RLS:** Lectura logueados, escritura logueados

---

### 5.7 Tabla: `purchases` (Compras)

```sql
CREATE TABLE purchases (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  purchase_number TEXT UNIQUE NOT NULL,
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id),
  purchase_date TIMESTAMP DEFAULT NOW(),
  expected_delivery TIMESTAMP,
  actual_delivery TIMESTAMP,
  subtotal NUMERIC(10, 2) NOT NULL,
  tax NUMERIC(10, 2) NOT NULL,
  total NUMERIC(10, 2) NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Estados:** `pending`, `received`, `partial`, `cancelled`

**RLS:** Lectura logueados, escritura comprador/admin

---

### 5.8 Tabla: `purchase_items` (Líneas de Compra)

```sql
CREATE TABLE purchase_items (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  purchase_id BIGINT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity_ordered INTEGER NOT NULL,
  quantity_received INTEGER DEFAULT 0,
  unit_cost NUMERIC(10, 2) NOT NULL,
  subtotal NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Relaciones:**
- FK `purchase_id` → `purchases.id` (cascada)
- FK `product_id` → `products.id`

**RLS:** Lectura logueados, escritura comprador/admin

---

### 5.9 Tabla: `customers` (Clientes)

```sql
CREATE TABLE customers (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT,
  phone TEXT,
  email TEXT,
  dni_nif TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT,
  type TEXT DEFAULT 'retail',
  credit_limit NUMERIC(10, 2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);
```

**Tipos:** `retail`, `corporate`

**RLS:** Lectura logueados, escritura logueados

---

### 5.10 Tabla: `users` (Usuarios del Sistema)

```sql
CREATE TABLE users (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Roles:** `admin`, `manager`, `seller`, `accountant`, `viewer`

**RLS:** Lectura propia + admin, escritura admin

---

## 6. MAPEO: PANTALLAS ↔ TABLAS

| Pantalla | Tablas Utilizadas | Operaciones |
|----------|------------------|-------------|
| **Dashboard** | `sales`, `sale_items`, `products`, `stock_movements` | SELECT (lecturas agregadas) |
| **TPV Venta** | `products`, `sales`, `sale_items`, `stock_movements` | SELECT, INSERT, UPDATE |
| **Productos** | `products`, `categories`, `suppliers` | SELECT, INSERT, UPDATE, DELETE |
| **Categorías** | `categories`, `products` | SELECT, INSERT, UPDATE, DELETE |
| **Stock** | `products`, `stock_movements`, `categories` | SELECT, UPDATE, INSERT |
| **Proveedores** | `suppliers`, `products`, `purchases` | SELECT, INSERT, UPDATE, DELETE |
| **Compras** | `purchases`, `purchase_items`, `products`, `suppliers`, `stock_movements` | SELECT, INSERT, UPDATE, DELETE |
| **Ventas** | `sales`, `sale_items`, `products`, `users` | SELECT, INSERT |
| **Reportes** | `sales`, `sale_items`, `products`, `categories`, `purchases`, `purchase_items` | SELECT (agregaciones) |
| **Configuración** | `users` (lectura solo) | SELECT |

---

## 7. CÁLCULOS Y MÉTRICAS ACTUALES

### 7.1 Stock
```typescript
// Cálculo actual (src/components/inventory-screen.tsx)
stock: number                    // Valor directo de products.stock
min_stock: number                // Valor mínimo de products.min
Estado: "ok" | "low" | "critical" | "out"
  - "ok": stock >= min
  - "low": stock < min && stock > 0
  - "critical": stock > 0 && stock <= critical_threshold
  - "out": stock === 0
```

**Futura fórmula PostgreSQL:**
```sql
stock = SUM(stock_movements.quantity) WHERE product_id = X
```

---

### 7.2 Ventas (Revenue)
```typescript
// Actual (pos-data.ts)
total = SUM(sale_items.unit_price * sale_items.quantity)

// Con impuesto
tax = total - (total / 1.1)
subtotal_without_tax = total / 1.1
```

---

### 7.3 Ingresos (Revenue)
```typescript
// Semanal/Mensual
salesWeek = Array<{day, total}>
monthly = Array<{month, sales, profit}>

// Fórmula
revenue = SUM(sales.total) GROUP BY DATE
```

---

### 7.4 Beneficio (Profit)
```typescript
// Actual (hardcoded)
profit = sales.profit (campo directo)

// Fórmula correcta
profit = SUM((sale_items.unit_price - product.cost) * sale_items.quantity)
```

---

### 7.5 Margen (Margin %)
```typescript
margin_percentage = (price - cost) / price * 100

// Ejemplo: (4.25 - 2.30) / 4.25 * 100 = 45.88%
```

---

### 7.6 Productos Vendidos
```typescript
// Cálculo
units_sold = SUM(sale_items.quantity) 
           WHERE product_id = X 
           AND YEAR(sale_date) = YEAR(NOW())

// O por período
units_sold_30d = SUM(sale_items.quantity)
               WHERE product_id = X
               AND sale_date >= NOW() - INTERVAL '30 days'
```

---

### 7.7 Stock Crítico
```typescript
// Lógica actual
if (stock <= threshold) -> "critical"

// Sugerencia: usar fórmula de punto de reorden
ROP = (LEAD_TIME * AVERAGE_DAILY_SALES) + SAFETY_STOCK
Alert cuando: stock <= ROP
```

---

## 8. DUPLICACIÓN Y ANOMALÍAS DE DATOS

### Posibles Duplicados Identificados

| Área | Observación |
|------|------------|
| **Categorías** | Almacenadas en: 1) `categories` (futura tabla), 2) como string en `products.category` |
| **Proveedores** | Almacenados en: 1) `suppliers` (tabla), 2) como string en `products.supplier` |
| **Usuarios** | No hay tabla `users` actualmente, empleados solo como strings en movimientos |

### Problemas de Integridad
- Los datos de categorías y proveedores están duplicados (como strings en products)
- No hay relaciones FK que garanticen integridad referencial
- Un cambio en una categoría no actualiza automáticamente todos sus productos

---

## 9. TRIGGERS, FUNCIONES Y PROCESOS AUTOMÁTICOS

### Actualmente: ❌ NINGUNO

No existen en el código actual:
- Triggers en la BD
- Edge Functions de Supabase
- Funciones PL/pgSQL
- RPC Functions
- Webhooks
- Procesos de sincronización

**Candidatos para implementar:**

```sql
-- Trigger 1: Actualizar stock al crear sale_item
CREATE TRIGGER update_stock_on_sale
AFTER INSERT ON sale_items
FOR EACH ROW
EXECUTE FUNCTION decrease_product_stock();

-- Trigger 2: Calcular profit automático
CREATE TRIGGER calculate_sale_profit
BEFORE INSERT ON sales
FOR EACH ROW
EXECUTE FUNCTION calc_total_profit();

-- Trigger 3: Actualizar updated_at
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
```

---

## 10. DATOS INTRODUCIDOS MANUALMENTE

### ✅ Datos que requieren entrada manual:

| Datos | Pantalla | Frecuencia | Usuario |
|-------|---------|-----------|--------|
| **Nuevo producto** | Productos | Ocasional | Admin/Manager |
| **Nueva categoría** | Categorías | Ocasional | Admin |
| **Nuevo proveedor** | Proveedores | Ocasional | Admin |
| **Compra entrada** | Compras | Diaria | Comprador/Gerente |
| **Ajuste de stock** | Stock | Ocasional | Gerente/Almacén |
| **Configuración negocio** | Configuración | Una vez | Admin |
| **Descuentos en ventas** | TPV Venta | Por venta | Vendedor |

### Nota Importante
**Actualmente NO se guarda ningún dato.** Solo existe en memoria durante la sesión.

---

## 11. SISTEMA DE IDs Y MAPEO CON SYSME

### IDs Actuales

#### Productos
```typescript
type Product = {
  id: number;           // ← ID numérico simple (1-8)
  barcode: string;      // ← EAN13
  sku: string;          // ← Código interno (ej: BEB-INK-300)
  // ...
}
```

**Ejemplos:**
| id | SKU | Barcode | Nombre |
|----|-----|---------|--------|
| 1 | BEB-INK-300 | 7750011001847 | Inca Kola 300 ml |
| 2 | BEB-MAL-330 | 7590006701218 | Maltín Polar 330 ml |
| 8 | CON-YUC-1KG | 8410101081006 | Yuca congelada 1 kg |

#### Ventas
```typescript
type Ticket = {
  id: string;           // ← "#V-10482" (ticket number)
  time: string;
  items: number;
  payment: string;
  total: number;
  profit: number;
  status: string;
}
```

**Ejemplos:**
| ID Ticket | Hora | Productos | Total |
|-----------|------|-----------|-------|
| #V-10482 | 11:18 | 4 | 24,85€ |
| #V-10481 | 10:56 | 2 | 8,15€ |

### Estrategia de Mapeo con Sysme TPV

**Opción A: Usar IDs internos del sistema**
- Latin POS mantiene IDs numéricos (1, 2, 3...)
- Crear tabla de mapeo: `sysme_sync_map`
```sql
CREATE TABLE sysme_sync_map (
  local_id INTEGER,
  local_table TEXT,
  sysme_id TEXT,
  sysme_code TEXT,
  last_sync TIMESTAMP
);
```

**Opción B: Usar código único (Recomendado)**
- Usar `barcode` (EAN13) como identificador universal
- Usar `SKU` como código interno
- Sincronizar ambos con Sysme

**Opción C: Usar UUID**
- Migrar de IDs numéricos a UUID
- Mejor para sincronización de sistemas distribuidos

---

## 12. DATOS PARA CAPTURAR DE SYSME TPV

### ⚠️ INFORMACIÓN NECESARIA PARA INTEGRACIÓN

Para mapear correctamente Latin POS con Sysme TPV, necesitamos obtener de Sysme:

#### 1. **ESQUEMA Y ESTRUCTURA**
```
□ ¿Qué tablas/entidades tiene Sysme?
  - Productos
  - Categorías
  - Stock
  - Ventas
  - Compras
  - Proveedores
  - Clientes
  - Usuarios
  - Otras: ______________________

□ ¿Cuál es la estructura de datos de cada tabla?
  (campos, tipos, relaciones)

□ ¿Usa IDs numéricos, UUID o códigos alfanuméricos?

□ ¿Cuáles son los campos únicos por tabla?
  (código, SKU, barcode, referencia interna)
```

#### 2. **IDENTIFICADORES ÚNICOS**
```
□ ¿Cómo identifica Sysme los productos?
  - ID interno: ________________
  - Código: ________________
  - EAN/Barcode: ________________
  - SKU: ________________

□ ¿Cómo identifica las ventas?
  - Ticket #: ________________
  - Referencia única: ________________
  - Timestamp: ________________

□ ¿Cómo identifica compras?
  - Número de orden: ________________
  - Referencia: ________________
```

#### 3. **CAMPOS Y VALORES**
```
□ Productos en Sysme:
  - Campos obligatorios: ________________
  - Campos opcionales: ________________
  - ¿Incluye imágenes? SÍ / NO
  - ¿Incluye descripción? SÍ / NO
  - ¿Stock es por almacén o global? ________________

□ Ventas en Sysme:
  - ¿Incluye líneas de detalle? SÍ / NO
  - ¿Se calcula profit automáticamente? SÍ / NO
  - ¿Incluye cliente? SÍ / NO
  - ¿Incluye empleado/vendedor? SÍ / NO

□ Stock en Sysme:
  - ¿Hay historial de movimientos? SÍ / NO
  - ¿Se sincroniza en tiempo real? SÍ / NO
  - ¿Hay múltiples ubicaciones? ________________
```

#### 4. **CAPACIDADES DE API**
```
□ ¿Sysme ofrece API REST?
  - URL base: ________________
  - Autenticación: ________________
  - Métodos disponibles: GET / POST / PUT / DELETE

□ ¿Sysme ofrece webhooks?
  - Eventos disponibles: ________________
  - URL callback: ________________

□ ¿Sysme ofrece base de datos directa?
  - Conexión SQL: SÍ / NO
  - Host: ________________
  - Puertos: ________________

□ ¿Ofrece exportación/importación?
  - Formatos: CSV / JSON / XML / Otros: ________
```

#### 5. **SINCRONIZACIÓN**
```
□ ¿Qué datos se syncronizan de Sysme → Latin POS?
  - Productos: SÍ / NO (¿Frecuencia?)
  - Stock: SÍ / NO (¿Frecuencia?)
  - Ventas: SÍ / NO (¿Frecuencia?)
  - Compras: SÍ / NO (¿Frecuencia?)
  - Clientes: SÍ / NO (¿Frecuencia?)

□ ¿Qué datos se syncronizan de Latin POS → Sysme?
  - Ventas: SÍ / NO (¿Tiempo real o batch?)
  - Compras: SÍ / NO (¿Tiempo real o batch?)
  - Movimientos stock: SÍ / NO
  - Productos nuevos: SÍ / NO

□ ¿Hay conflictos de sincronización?
  - ¿Quién tiene prioridad en datos duplicados? ________________
  - ¿Se pueden editar datos en ambos lados? ________________
```

#### 6. **ESTADOS Y FLUJOS DE NEGOCIO**
```
□ Estados permitidos para ventas:
  - Sysme: ________________________________
  - Latin POS: completada, reembolsada

□ Estados permitidos para compras:
  - Sysme: ________________________________
  - Latin POS: pendiente, recibida...

□ Métodos de pago disponibles en Sysme:
  ________________________________

□ Motivos de ajuste de stock:
  ________________________________
```

#### 7. **PERMISOS Y SEGURIDAD**
```
□ ¿Qué usuario/credenciales usar para la integración?
  - Email: ________________
  - API Key: ________________
  - Token: ________________

□ ¿Cuáles son los permisos necesarios?
  - Lectura de productos: SÍ / NO
  - Escritura de ventas: SÍ / NO
  - Modificación de stock: SÍ / NO
  - Lectura de clientes: SÍ / NO
  - Otros: ________________

□ ¿Hay restricciones de IP/dominio?
  ________________________________
```

#### 8. **DOCUMENTACIÓN**
```
□ Documentación de API de Sysme
□ Especificación de base de datos (schema)
□ Manual de campos y tipos de datos
□ Ejemplos de integración anteriores
□ Contatos técnicos de Sysme
```

---

## RESUMEN EJECUTIVO

### Estado Actual
| Aspecto | Estado |
|--------|--------|
| **Base de datos** | ❌ No conectada (datos en memoria) |
| **Supabase** | ❌ No configurado |
| **Persistencia** | ❌ No existe |
| **Multi-usuario** | ❌ No soportado |
| **Sincronización** | ❌ No existe |

### Preparación Técnica para Sysme
| Tarea | Prioridad | Complejidad |
|------|-----------|------------|
| Crear esquema en Supabase | 🔴 Alta | Alta |
| Migrar datos a PostgreSQL | 🔴 Alta | Media |
| Crear cliente Supabase | 🟡 Media | Baja |
| Implementar sincronización | 🟡 Media | Alta |
| Testing de integraciones | 🔴 Alta | Alta |

### Riesgos Identificados
1. **No hay base de datos real** - Requiere setup completo de Supabase
2. **Datos duplicados** - Categorías y proveedores como strings y relaciones
3. **Sin historial de cambios** - No hay auditoría de datos
4. **Sin RLS** - No hay seguridad a nivel de fila
5. **IDs simples** - Puede haber conflictos con Sysme

---

## 📊 SIGUIENTE PASO

Completar el formulario "DATOS NECESARIOS PARA INTEGRAR SYSME" (arriba) para poder:
1. Diseñar tabla de mapeo
2. Crear estrategia de sincronización
3. Implementar webhooks o polling
4. Validar integridad de datos

