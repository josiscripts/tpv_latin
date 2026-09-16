# 🌉 ESPECIFICACIÓN TÉCNICA: BRIDGE WINDOWS SYSME ↔ PANEL

**Versión:** 1.0  
**Fecha:** 16 de septiembre de 2026  
**Propósito:** Sincronizar stock entre Sysme TPV Local y Panel React vía Supabase

---

## ARQUITECTURA DEL BRIDGE

### Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                     WINDOWS MACHINE (Local)                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  BRIDGE SERVICE (Node.js)                │
│  │  SYSME TPV       │  ┌──────────────────────────────────┐    │
│  │  .exe process    │  │                                  │    │
│  │                  │  │ 1. Reader Service               │    │
│  │  ├─ BD Local     │  │    └─ QuerySysmeProducts()      │    │
│  │  ├─ API Local    │  │    └─ QueryStockMovements()     │    │
│  │  └─ Logfile      │  │                                  │    │
│  └────────┬─────────┘  │ 2. Mapper Service                │    │
│           │            │    └─ MapProductIDs()           │    │
│           │            │    └─ TransformData()            │    │
│           │            │                                  │    │
│           └─→ [TCP/HTTP]─→ │ 3. Sync Service              │    │
│                        │    └─ ValidateStock()           │    │
│                        │    └─ HandleConflicts()         │    │
│                        │                                  │    │
│                        │ 4. Logger Service                │    │
│                        │    └─ LogSync()                 │    │
│                        │                                  │    │
│                        │ ┌─ polling each 5 min            │    │
│                        │ └─ webhook endpoint (optional)   │    │
│                        └──────────────────────────────────┘    │
│                               │                                 │
│                               │ HTTPS                           │
│                               │                                 │
└───────────────────────────────┼─────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
                ↓                               ↓
      ┌──────────────────┐            ┌──────────────────────┐
      │ SUPABASE         │            │ SUPABASE AUTH        │
      │ PostgreSQL       │            │ JWT Tokens           │
      ├──────────────────┤            ├──────────────────────┤
      │ • products       │            │ Service Role Key     │
      │ • stock_moves    │            │ (Bridge uso)         │
      │ • sysme_map      │            │                      │
      │ • sync_log       │            │ Anon Key             │
      │ • sync_queue     │            │ (Panel uso)          │
      └────────┬─────────┘            └──────────────────────┘
               │
               │ Realtime Subscription
               │ (WebSocket)
               │
               ↓
      ┌──────────────────────┐
      │ PANEL REACT          │
      │ (Browser)            │
      ├──────────────────────┤
      │ • Query products     │
      │ • Listen to changes  │
      │ • Update UI          │
      └──────────────────────┘
```

---

## 1. BRIDGE SERVICE (Node.js)

### Estructura de Carpetas

```
bridge-sysme-panel/
├── src/
│   ├── services/
│   │   ├── sysme/
│   │   │   ├── reader.ts
│   │   │   ├── connector.ts
│   │   │   └── types.ts
│   │   ├── mapper/
│   │   │   ├── mapper.ts
│   │   │   └── config.ts
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── syncer.ts
│   │   │   └── resolver.ts (conflictos)
│   │   └── logger/
│   │       └── logger.ts
│   ├── api/
│   │   ├── routes.ts
│   │   └── middleware.ts
│   ├── config/
│   │   ├── env.ts
│   │   └── database.sql
│   ├── utils/
│   │   ├── retries.ts
│   │   └── transforms.ts
│   └── index.ts
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

### package.json

```json
{
  "name": "bridge-sysme-panel",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "windows-service": "nssm install BridgeSysmePanel node C:\\bridge\\dist\\index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "dotenv": "^16.0.3",
    "@supabase/supabase-js": "^2.38.0",
    "mssql": "^9.1.0",
    "uuid": "^9.0.0",
    "pino": "^8.14.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.8.0",
    "typescript": "^5.2.2",
    "tsx": "^3.14.0"
  }
}
```

### .env.example

```env
# SYSME Configuration
SYSME_DB_HOST=127.0.0.1
SYSME_DB_PORT=1433
SYSME_DB_NAME=SYSME_DB
SYSME_DB_USER=sa
SYSME_DB_PASSWORD=yourpassword

# O SYSME API (si existe)
SYSME_API_URL=http://localhost:8080
SYSME_API_KEY=

# Supabase Configuration
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Bridge Configuration
BRIDGE_PORT=3001
BRIDGE_SYNC_INTERVAL=300000
BRIDGE_RETRY_ATTEMPTS=3
BRIDGE_TIMEOUT=10000

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/bridge.log
```

---

## 2. SERVICIO DE LECTURA (SYSME Reader)

### Interface TypeScript

```typescript
// src/services/sysme/types.ts

export interface SysmeProduct {
  id_empresa: string        // "001"
  id_centro: string         // "01"
  id_tipo_comg: string      // "0001"
  id_complementog: string   // "00001"
  codbarras: string         // "000100001"
  nombre: string            // "Product 1"
  precio_venta: number
  precio_costo: number
  stock_actual: number
  stock_minimo: number
  activo: boolean
}

export interface SysmeStockMovement {
  id: string
  id_producto: string
  tipo_movimiento: 'entrada' | 'salida' | 'ajuste'
  cantidad: number
  fecha_hora: Date
  usuario: string
  razon: string
  id_documento: string
}

export interface SysmeConnectorConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
  // O si es API:
  apiUrl?: string
  apiKey?: string
}
```

### Implementación del Connector

```typescript
// src/services/sysme/connector.ts

import sql from 'mssql'

export class SysmeConnector {
  private pool: sql.ConnectionPool | null = null
  private config: sql.config

  constructor(config: SysmeConnectorConfig) {
    if (config.apiUrl) {
      // Usar API
      this.useApi(config.apiUrl, config.apiKey)
    } else {
      // Usar MSSQL directo
      this.config = {
        server: config.host,
        port: config.port,
        database: config.database,
        authentication: {
          type: 'default',
          options: {
            userName: config.username,
            password: config.password
          }
        }
      }
    }
  }

  async connect(): Promise<void> {
    this.pool = new sql.ConnectionPool(this.config)
    await this.pool.connect()
    console.log('Connected to Sysme DB')
  }

  async disconnect(): Promise<void> {
    if (this.pool) await this.pool.close()
  }

  async query<T>(sql: string, params?: Record<string, any>): Promise<T[]> {
    if (!this.pool) throw new Error('Not connected')
    
    const request = this.pool.request()
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        request.input(key, value)
      })
    }

    const result = await request.query(sql)
    return result.recordset as T[]
  }
}
```

### Reader Service

```typescript
// src/services/sysme/reader.ts

export class SysmeReader {
  constructor(private connector: SysmeConnector) {}

  async getProducts(): Promise<SysmeProduct[]> {
    const query = `
      SELECT 
        id_empresa,
        id_centro,
        id_tipo_comg,
        id_complementog,
        codbarras,
        nombre,
        precio_venta,
        precio_costo,
        stock_actual,
        stock_minimo,
        activo
      FROM Productos
      WHERE activo = 1
      ORDER BY id_empresa, id_centro, id_tipo_comg, id_complementog
    `
    
    return this.connector.query<SysmeProduct>(query)
  }

  async getStockMovements(since: Date): Promise<SysmeStockMovement[]> {
    const query = `
      SELECT 
        id,
        id_producto,
        tipo_movimiento,
        cantidad,
        fecha_hora,
        usuario,
        razon,
        id_documento
      FROM MovimientosStock
      WHERE fecha_hora >= @since
      ORDER BY fecha_hora DESC
    `
    
    return this.connector.query<SysmeStockMovement>(query, { since })
  }

  async getProductById(empresa: string, centro: string, tipo: string, complemento: string) {
    const query = `
      SELECT * FROM Productos
      WHERE id_empresa = @empresa
        AND id_centro = @centro
        AND id_tipo_comg = @tipo
        AND id_complementog = @complemento
    `
    
    const result = await this.connector.query(query, {
      empresa, centro, tipo, complemento
    })
    
    return result[0] || null
  }
}
```

---

## 3. SERVICIO DE MAPEO

### Mapper Service

```typescript
// src/services/mapper/mapper.ts

import { createClient } from '@supabase/supabase-js'
import { SysmeProduct } from '../sysme/types'

interface MappedProduct {
  panel_product_id: number
  panel_sku: string
  panel_barcode: string
  stock_new: number
  stock_old: number
  price_new: number
  price_old: number
  last_sync: Date
}

interface MappingError {
  sysme_id: string
  reason: string
  severity: 'warning' | 'error'
}

export class ProductMapper {
  constructor(
    private supabase: ReturnType<typeof createClient>,
    private mapping: Map<string, number> // sysme_id → panel_id
  ) {}

  async mapSysmeToPanel(sysmeProduct: SysmeProduct): Promise<MappedProduct | MappingError> {
    // Construir ID único de Sysme
    const sysmeId = this.buildSysmeId(sysmeProduct)
    
    // Buscar en tabla sysme_product_map
    const { data: mapping, error } = await this.supabase
      .from('sysme_product_map')
      .select('panel_product_id, panel_sku, panel_barcode')
      .eq('sysme_empresa', sysmeProduct.id_empresa)
      .eq('sysme_centro', sysmeProduct.id_centro)
      .eq('sysme_tipo_comg', sysmeProduct.id_tipo_comg)
      .eq('sysme_complementog', sysmeProduct.id_complementog)
      .single()

    if (error) {
      return {
        sysme_id: sysmeId,
        reason: `No mapping found: ${sysmeProduct.nombre}`,
        severity: 'warning'
      }
    }

    // Obtener stock actual en panel
    const { data: panelProduct } = await this.supabase
      .from('products')
      .select('stock, price')
      .eq('id', mapping.panel_product_id)
      .single()

    return {
      panel_product_id: mapping.panel_product_id,
      panel_sku: mapping.panel_sku,
      panel_barcode: mapping.panel_barcode,
      stock_new: sysmeProduct.stock_actual,
      stock_old: panelProduct?.stock || 0,
      price_new: sysmeProduct.precio_venta,
      price_old: panelProduct?.price || 0,
      last_sync: new Date()
    }
  }

  private buildSysmeId(product: SysmeProduct): string {
    return `${product.id_empresa}_${product.id_centro}_${product.id_tipo_comg}_${product.id_complementog}`
  }

  async detectNewProducts(sysmeProducts: SysmeProduct[]): Promise<SysmeProduct[]> {
    // Detectar productos en Sysme que NO están en sysme_product_map
    const unmapped: SysmeProduct[] = []

    for (const product of sysmeProducts) {
      const { data } = await this.supabase
        .from('sysme_product_map')
        .select('id')
        .eq('sysme_empresa', product.id_empresa)
        .eq('sysme_centro', product.id_centro)
        .eq('sysme_tipo_comg', product.id_tipo_comg)
        .eq('sysme_complementog', product.id_complementog)
        .single()

      if (!data) {
        unmapped.push(product)
      }
    }

    return unmapped
  }
}
```

---

## 4. SERVICIO DE SINCRONIZACIÓN

### Conflict Resolution

```typescript
// src/services/supabase/resolver.ts

interface ConflictResolutionRule {
  type: 'sysme_wins' | 'panel_wins' | 'newer_wins'
  condition: (panel: Product, sysme: SysmeProduct) => boolean
  message: string
}

export class ConflictResolver {
  private rules: ConflictResolutionRule[] = [
    {
      type: 'sysme_wins',
      condition: (panel, sysme) => {
        // Sysme es la fuente de verdad
        return true
      },
      message: 'Sysme has authority'
    },
    {
      type: 'newer_wins',
      condition: (panel, sysme) => {
        // Si ambos han cambiado, usa el más nuevo
        return sysme.last_update > panel.last_update
      },
      message: 'Using newer timestamp'
    }
  ]

  resolveConflict(
    panelProduct: Product,
    sysmeProduct: SysmeProduct
  ): 'panel' | 'sysme' | 'manual' {
    for (const rule of this.rules) {
      if (rule.condition(panelProduct, sysmeProduct)) {
        if (rule.type === 'sysme_wins') return 'sysme'
        if (rule.type === 'panel_wins') return 'panel'
      }
    }

    // No se pudo resolver automáticamente
    return 'manual'
  }
}
```

### Sync Service

```typescript
// src/services/supabase/syncer.ts

export class SupabaseSync {
  constructor(
    private supabase: ReturnType<typeof createClient>,
    private resolver: ConflictResolver,
    private logger: Logger
  ) {}

  async syncProduct(mapped: MappedProduct): Promise<SyncResult> {
    try {
      // Validar datos
      if (mapped.stock_new < 0) {
        throw new Error('Stock negativo no permitido')
      }

      // Detectar conflictos
      const conflict = this.detectConflict(mapped)
      
      if (conflict) {
        const resolution = this.resolver.resolveConflict(
          mapped as any, 
          mapped as any
        )
        
        if (resolution === 'manual') {
          this.logger.warn(`Manual review needed: ${mapped.panel_product_id}`)
          return { success: false, action: 'manual_review' }
        }
      }

      // Actualizar stock en products
      const { error: updateError } = await this.supabase
        .from('products')
        .update({
          stock: mapped.stock_new,
          price: mapped.price_new,
          updated_at: new Date()
        })
        .eq('id', mapped.panel_product_id)

      if (updateError) throw updateError

      // Registrar movimiento de stock
      const { error: movementError } = await this.supabase
        .from('stock_movements')
        .insert({
          product_id: mapped.panel_product_id,
          movement_type: 'sync_sysme',
          quantity: mapped.stock_new - mapped.stock_old,
          reason: 'Sincronización automática desde Sysme',
          created_at: new Date()
        })

      if (movementError) throw movementError

      // Registrar en sync_log
      await this.logSync({
        product_id: mapped.panel_product_id,
        operation: 'stock_update',
        source: 'sysme',
        status: 'success',
        message: `Stock ${mapped.stock_old} → ${mapped.stock_new}`
      })

      return { success: true, action: 'updated' }
    } catch (error) {
      this.logger.error(`Sync failed for ${mapped.panel_product_id}:`, error)
      return { success: false, action: 'error', error: (error as Error).message }
    }
  }

  private detectConflict(mapped: MappedProduct): boolean {
    return mapped.stock_new !== mapped.stock_old
  }

  private async logSync(log: any) {
    await this.supabase.from('sync_log').insert(log)
  }
}
```

---

## 5. API ENDPOINTS

### Express Routes

```typescript
// src/api/routes.ts

import express from 'express'
import { SysmeReader } from '../services/sysme/reader'
import { SupabaseSync } from '../services/supabase/syncer'

export function setupRoutes(app: express.Application) {
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() })
  })

  // Trigger sincronización manual
  app.post('/api/bridge/sync', async (req, res) => {
    try {
      const result = await syncAll()
      res.json({ success: true, synced: result })
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message })
    }
  })

  // Actualizar producto específico
  app.put('/api/bridge/product/:id', async (req, res) => {
    try {
      const { stock, price } = req.body
      // Validar y actualizar
      res.json({ success: true })
    } catch (error) {
      res.status(400).json({ success: false, error: (error as Error).message })
    }
  })

  // Obtener estado de sincronización
  app.get('/api/bridge/status', async (req, res) => {
    res.json({
      connected: true,
      lastSync: new Date(),
      pending: 0
    })
  })
}
```

---

## 6. FLUJO DE SINCRONIZACIÓN

### Polling Automático (cada 5 minutos)

```typescript
// src/index.ts

async function startSync() {
  const interval = setInterval(async () => {
    try {
      // 1. Leer de Sysme
      const sysmeProducts = await sysmeReader.getProducts()
      
      // 2. Mapear IDs
      const mapped = []
      for (const product of sysmeProducts) {
        const mappedProduct = await mapper.mapSysmeToPanel(product)
        if (!('severity' in mappedProduct)) {
          mapped.push(mappedProduct)
        }
      }
      
      // 3. Sincronizar a Supabase
      for (const product of mapped) {
        await syncer.syncProduct(product)
      }
      
      logger.info(`Sync completed: ${mapped.length} products`)
    } catch (error) {
      logger.error('Sync failed:', error)
      // Retry logic aquí
    }
  }, 5 * 60 * 1000) // 5 minutos
  
  return interval
}
```

---

## 7. INSTALACIÓN COMO WINDOWS SERVICE

### Usar NSSM

```bash
# Descargar NSSM desde: https://nssm.cc/download

# Instalar servicio
nssm install BridgeSysmePanel "C:\Node\node.exe" "C:\bridge\dist\index.js"

# Configurar para iniciar automáticamente
nssm set BridgeSysmePanel AppDirectory C:\bridge
nssm set BridgeSysmePanel AppStdout C:\bridge\logs\bridge.log
nssm set BridgeSysmePanel AppStderr C:\bridge\logs\bridge-error.log
nssm set BridgeSysmePanel AppRotateFiles 1
nssm set BridgeSysmePanel AppRotateSeconds 604800

# Iniciar servicio
net start BridgeSysmePanel

# Detener servicio
net stop BridgeSysmePanel

# Desinstalar
nssm remove BridgeSysmePanel confirm
```

---

## 8. TABLA SQL EN SUPABASE

```sql
-- Tabla de mapeo entre Sysme y Panel
CREATE TABLE sysme_product_map (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  
  -- Panel
  panel_product_id BIGINT NOT NULL UNIQUE,
  panel_sku TEXT,
  panel_barcode TEXT,
  
  -- Sysme
  sysme_empresa TEXT NOT NULL,
  sysme_centro TEXT NOT NULL,
  sysme_tipo_comg TEXT NOT NULL,
  sysme_complementog TEXT NOT NULL,
  sysme_codbarras TEXT,
  sysme_nombre TEXT,
  
  -- Sincronización
  sync_status TEXT DEFAULT 'synced',
  last_sync_from_sysme TIMESTAMP,
  last_sync_to_sysme TIMESTAMP,
  error_message TEXT,
  
  -- Auditoría
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(sysme_empresa, sysme_centro, sysme_tipo_comg, sysme_complementog),
  FOREIGN KEY (panel_product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT valid_sync_status CHECK (sync_status IN ('synced', 'pending', 'error', 'manual'))
);

-- Índices para búsqueda rápida
CREATE INDEX idx_sysme_map_panel ON sysme_product_map(panel_product_id);
CREATE INDEX idx_sysme_map_sysme ON sysme_product_map(sysme_empresa, sysme_centro, sysme_tipo_comg, sysme_complementog);
CREATE INDEX idx_sysme_map_status ON sysme_product_map(sync_status);

-- Tabla de log de sincronización
CREATE TABLE sync_log (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  
  product_id BIGINT,
  operation TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Índices
CREATE INDEX idx_sync_log_product ON sync_log(product_id);
CREATE INDEX idx_sync_log_created ON sync_log(created_at DESC);
CREATE INDEX idx_sync_log_status ON sync_log(status);

-- RLS: El servicio Bridge (con SERVICE_ROLE_KEY) puede actualizar
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bridge can update products" ON products
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Bridge can insert stock_movements" ON stock_movements
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Public: Lectura para el panel
CREATE POLICY "Public read products" ON products
  FOR SELECT
  USING (true);
```

---

## TESTING DEL BRIDGE

### Checklist de Testing

```
□ Conexión a Sysme
  □ TCP a BD (si MSSQL)
  □ HTTP a API (si REST)
  □ Autenticación
  
□ Lectura de datos
  □ QueryProducts() retorna datos
  □ QueryMovements() retorna datos
  □ Manejo de errores
  
□ Mapeo
  □ MapSysmeToPanel() retorna objeto válido
  □ Detecta productos nuevos
  □ Maneja productos sin mapeo
  
□ Sincronización
  □ UpdateProduct() en Supabase funciona
  □ InsertMovement() registra movimiento
  □ Resuelve conflictos correctamente
  
□ Recuperación de errores
  □ Retry logic funciona
  □ Logging es correcto
  □ Servicio se recupera de caídas
  
□ Seguridad
  □ SERVICE_ROLE_KEY no se expone
  □ Conexión a Sysme protegida
  □ Logging no contiene datos sensibles
```

---

## 🤝 CONTRATO DE SINCRONIZACIÓN SYSME → SUPABASE

**⚠️ IMPORTANTE:** Este contrato especifica exactamente QUÉ datos Sysme envía y CÓMO se mapean a Latin POS.  
**Documento detallado:** Ver `CONTRATO_SINCRONIZACION_SYSME.md`

### Flujo de Sincronización (Alto Nivel)

```
Sysme TPV (MySQL)
  ↓ [Lee: ventas, líneas, costo, IVA]
  ↓
Bridge Windows (C#/.NET)
  ├─ 1. Valida mapeo de productos
  ├─ 2. Verifica stock
  ├─ 3. Previene duplicados (idempotencia)
  └─ 4. Registra errores sin PII
  ↓ [HTTPS]
  ↓
Supabase PostgreSQL
  ├─ sales (cabecera)
  ├─ sale_lines (líneas con unit_cost_at_time)
  ├─ stock_movements (historial)
  ├─ sync_events (idempotencia)
  └─ bridge_errors (auditoría)
  ↓ [Real-time Subscriptions]
  ↓
Panel React (Browser)
  └─ Datos automáticamente actualizados
```

### Campos Críticos

| Campo | Origen | Destino | Mapeo |
|-------|--------|---------|-------|
| `id_venta` | Sysme | `sales.sysme_id_venta` | Directo, UNIQUE |
| `id_linea` | Sysme | `sale_lines.sysme_id_linea` | Directo |
| `id_empresa, id_centro, id_tipo_comg, id_complementog` | Sysme | Lookup `sysme_product_map` | Composite key |
| `cantidad` | Sysme | `sale_lines.quantity` | Directo |
| `PVPTiquet` | Sysme | `sale_lines.unit_sale_price` | Directo |
| `avgiva` | Sysme | `sale_lines.tax_rate` | Como porcentaje (%) |
| `costounitar` | Sysme | `sale_lines.unit_cost_at_time` | Si disponible, else fallback a local |
| `total_linea` | Sysme | `sale_lines.total_sale` | cantidad × PVPTiquet - descuento |

### Garantías

✅ **Exactly-Once Delivery**
- event_key UNIQUE previene duplicados
- sysme_id_venta UNIQUE en sales
- Transacción ACID asegura consistencia

✅ **Stock Consistente**
- stock_movements registra TODO
- Stock nunca negativo (pending si insuficiente)
- Auditable vía historial

✅ **Trazabilidad Completa**
- sysme_id_venta en cada registro
- sync_events captura todo evento
- bridge_errors registra sin datos sensibles

✅ **Idempotente**
- Reintentos seguros
- Sin duplicados
- Recuperable ante fallos

### Validación de Decisiones Críticas

Antes de implementar Bridge, usuario debe aprobar:

- [ ] **Stock negativo:** Opción D (Pending + Reconciliation) ✓
- [ ] **Origen costo:** Sysme → fallback local ✓
- [ ] **Interpretación avgiva:** Porcentaje (10 = 10%) ✓
- [ ] **Mapeo producto:** 1:1 (cada product_id = 1 Sysme) ✓
- [ ] **Cancelación:** Revertir completamente (stock_movement) ✓
- [ ] **Timeout reintento:** 7 días exponencial ✓
- [ ] **Monitoreo:** SÍ, alertas escaladas ✓
- [ ] **Tabla config:** bridge_config para params ✓

**Documento completo de decisiones:** `DECISIONES_PENDIENTES_SUBFASE_12_8.md`

---

## CRONOGRAMA DE IMPLEMENTACIÓN

### Semana 1: Setup
- [ ] Crear proyecto Node.js
- [ ] Configurar variables de entorno
- [ ] Crear tablas en Supabase
- [ ] Documentar API de Sysme

### Semana 2: Connectors
- [ ] Implementar SysmeConnector (MSSQL o API)
- [ ] Implementar SysmeReader
- [ ] Testing de conexión
- [ ] Manejo de errores

### Semana 3: Mapper + Sync
- [ ] Implementar ProductMapper
- [ ] Implementar SupabaseSync
- [ ] Implementar ConflictResolver
- [ ] Testing end-to-end

### Semana 4: API + Service
- [ ] Implementar Express routes
- [ ] Implementar polling
- [ ] Packaging para Windows Service
- [ ] Testing de carga

### Semana 5: Deploy + Docs
- [ ] Deploy a Windows
- [ ] Setup como servicio
- [ ] Documentación final
- [ ] Training

---

**Total: ~40-50 horas de desarrollo**

