# AUDITORÍA DEL MODELO PARA SINCRONIZACIÓN SYSME
**SUBFASE 12.8 — Preparación del esquema sin implementación del Bridge**

**Estado:** Análisis completado | Decisiones pendientes | Documentación en progreso  
**Fecha:** 2026-09-16

---

## 1. ESTADO ACTUAL DEL ESQUEMA

### 1.1 Tablas de Sincronización Presentes ✅

```
✅ sysme_product_map    — Mapeo compuesto Sysme ↔ Latin POS
✅ sales               — Cabecera de ventas con campos Sysme
✅ sale_lines          — Líneas de venta con preservación de costo
✅ stock_movements     — Historial de movimientos (tipos: purchase, sale, adjustment, reconciliation)
✅ sync_state          — Cursor y estado de sincronización
✅ sync_events         — Tabla de idempotencia (event_key UNIQUE)
✅ bridge_errors       — Registro de errores sin datos sensibles
```

### 1.2 Campos Clave Presentes

**sales**
- `sysme_id_venta TEXT UNIQUE` — ID de venta Sysme (comprobante único)
- `sysme_id_tiquet TEXT` — Número de tiquet interno Sysme
- `sysme_serie TEXT` — Serie del tiquet
- `source TEXT CHECK (IN 'sysme', 'latin_pos')` — Origen
- `status TEXT CHECK (IN 'completed', 'cancelled', 'pending')` — Estado
- `payment_method TEXT` — Método de pago (cash, card, etc.)
- `cancelled_at TIMESTAMPTZ` — Timestamp de cancelación

**sale_lines**
- `sysme_id_venta TEXT` — Referencia a cabecera Sysme
- `sysme_id_linea TEXT` — ID único de línea Sysme
- `unit_cost_at_time NUMERIC` — **Costo histórico preservado** ✅
- `tax_rate NUMERIC(5,2)` — **IVA por línea, variable** ✅
- `discount NUMERIC` — Descuento aplicado
- `gross_profit / gross_margin_percent` — Rentabilidad calculada

**stock_movements**
- `movement_type TEXT CHECK (IN 'purchase', 'sale', 'sale_cancellation', 'adjustment', 'sysme_reconciliation', 'initial_stock')`
- `source TEXT` — Origen del movimiento (latin_pos, sysme_bridge, manual, etc.)
- `previous_stock / resulting_stock` — **Ambos >= 0** (no permite negativos)
- `reference_type / reference_id` — Trazabilidad (sale_id, purchase_id, etc.)

**sysme_product_map**
- `product_id UUID NOT NULL UNIQUE` — Un mapeo por producto
- Composite key: `(id_empresa, id_centro, id_tipo_comg, id_complementog)` UNIQUE
- `sysme_barcode TEXT` — Código de barras Sysme

**sync_state**
- `integration_name TEXT UNIQUE` — 'sysme_bridge' (predefinido en schema)
- `last_finalized_sale_id TEXT` — Cursor para sinc incremental
- `last_sync_at TIMESTAMPTZ` — Última sincronización exitosa
- `status TEXT CHECK (IN 'idle', 'syncing', 'error')` — Semáforo
- `last_error TEXT` — Mensaje de último error

**sync_events** (Idempotencia)
- `event_key TEXT NOT NULL UNIQUE` — Previene duplicados
- `event_type TEXT` — 'sale_created', 'stock_adjusted', etc.
- `source TEXT` — 'sysme_bridge'
- `source_id TEXT` — ID Sysme del evento (sysme_id_venta, sysme_id_linea)
- `payload JSONB` — Datos completos del evento
- `status TEXT CHECK (IN 'pending', 'processed', 'failed', 'skipped')`
- `processed_at TIMESTAMPTZ` — Cuándo se procesó

---

## 2. VALIDACIÓN CONTRA REQUISITOS SYSME

### 2.1 Identidad del Producto ✅
**Sysme proporciona:** id_empresa, id_centro, id_tipo_comg, id_complementog  
**Latin POS mapea a:** product_id UUID mediante sysme_product_map

**Validación:**
- ✅ Composite key en Sysme: (id_empresa, id_centro, id_tipo_comg, id_complementog) UNIQUE
- ✅ Lookup en Sysme es O(1) con índice
- ✅ product_id UNIQUE asegura 1:1 (cada product_id → 1 producto Sysme)

**Pregunta resuelta:** ¿Un producto Latin POS puede mapear a múltiples Sysme?  
**Respuesta:** NO. Por diseño, product_id es UNIQUE. Un producto local = un producto Sysme.

---

### 2.2 Identidad de Venta ✅
**Sysme proporciona:** id_venta (secuencial, único por empresa+centro+tipo)  
**Latin POS mapea a:** sysme_id_venta (TEXT, UNIQUE)

**Validación:**
- ✅ `sales.sysme_id_venta UNIQUE` previene ventas duplicadas
- ✅ Candidato a `sync_state.last_finalized_sale_id` para cursor incremental

**Pregunta resuelta:** ¿Cómo evitar procesar la misma venta dos veces?  
**Respuesta:** 
1. `sync_events.event_key` → UNIQUE (idempotencia a nivel de evento)
2. `sales.sysme_id_venta` → UNIQUE (idempotencia a nivel de venta)
3. Si Bridge reintenta: vuelve a buscar sysme_id_venta, encuentra que ya existe, skips

---

### 2.3 Precio y Total ✅
**Sysme proporciona:** PVPTiquet (precio de venta), cantidad, línea  
**Latin POS mapea a:** unit_sale_price, quantity → total_sale

**Validación:**
- ✅ `sale_lines.unit_sale_price NUMERIC(10,2)` — precio unitario Sysme
- ✅ `sale_lines.quantity NUMERIC(12,2)` — cantidad (puede ser fraccionada)
- ✅ `sale_lines.total_sale` — cantidad * precio_unitario - descuento

**Fórmula:** 
```
total_sale = (quantity * unit_sale_price) - discount
```

---

### 2.4 Costo e Historial ✅
**Sysme proporciona:** costounitar de la última compra  
**Latin POS captura:** unit_cost_at_time en sale_lines en MOMENTO DE VENTA

**Validación:**
- ✅ `sale_lines.unit_cost_at_time` — costo congelado en venta
- ✅ Permite rentabilidad histórica exacta (no depende de cambios futuros de costo)

**Fórmula de rentabilidad:**
```
total_cost = unit_cost_at_time * quantity
gross_profit = total_sale - total_cost
gross_margin_percent = (gross_profit / total_sale) * 100
```

---

### 2.5 IVA/Impuestos ✅
**Sysme proporciona:** avgiva (porcentaje promedio, puede variar por línea)  
**Latin POS mapea a:** tax_rate (por línea, NUMERIC(5,2))

**Validación:**
- ✅ `sale_lines.tax_rate` — puede variar por línea (0-100)
- ✅ `sales.tax` — suma de (unit_sale_price * tax_rate / 100) por línea
- ⚠️ **Decisión requerida:** ¿Sysme envía avgiva como PORCENTAJE o MONTO?

**Interpretación propuesta:**
```
Sysme.avgiva = % impuesto (ej: 10, 12, 21)
tax_rate = Sysme.avgiva
tax_monto_linea = (unit_sale_price * quantity * tax_rate) / 100
```

---

### 2.6 Stock - RESTRICCIÓN CRÍTICA ⚠️

**Problema:** El esquema actual requiere `resulting_stock >= 0`
```sql
CONSTRAINT resulting_stock_not_negative CHECK (resulting_stock >= 0)
```

**Caso problemático:** 
- Bridge recibe venta Sysme de 10 unidades del producto X
- Latin POS tiene 5 unidades en stock
- ¿Qué sucede?

**Opciones:**

#### Opción A: Permitir negativos (Cambio mínimo)
```sql
-- Remover constraint
ALTER TABLE stock_movements DROP CONSTRAINT resulting_stock_not_negative;
```
**Ventajas:**
- Fácil implementación
- Captura el "overselling" de Sysme
- Permite sincronización sin demoras

**Desventajas:**
- Stock negativo no es realista
- Reportes confusos

#### Opción B: Marcar venta como PENDING (Bloqueo temporal)
```sql
-- En sales:
status IN ('completed', 'cancelled', 'pending')

-- Si stock insuficiente:
INSERT sales (...) status='pending'
-- Esperar ajuste de stock
-- Luego: UPDATE sales SET status='completed' WHERE sysme_id_venta = ?
```
**Ventajas:**
- Stock siempre positivo
- Rastreable (ventas en estado pending)
- Permite reposición e intento posterior

**Desventajas:**
- Requiere procesamiento en dos pasos
- Lógica más compleja en Bridge

#### Opción C: Crear movimiento RECONCILIATION (Ajuste automático)
```sql
-- Si stock insuficiente:
1. Crear sale_lines normalmente
2. Crear stock_movement type='sysme_reconciliation' con cantidad negativa
3. Registrar error de alertaStock en bridge_errors
4. Stock se reajusta automáticamente
```
**Ventajas:**
- Stock siempre positivo
- Registra la discrepancia
- Autocorrige al siguiente recount

**Desventajas:**
- Crea movimientos "ficticios"
- Potencial de errores compuestos

#### Opción D: RECOMENDADA - Combinación B+C
```
1. Si stock >= cantidad_venta:  sale.status='completed'
2. Si stock < cantidad_venta:   sale.status='pending' + bridge_error + reconciliation_placeholder
3. Cuando llega movimiento de compra: desbloquea pending sales
```

**Decisión propuesta:** **OPCIÓN D** (Combinación B+C)
- Mantener stock_movements.resulting_stock >= 0
- Permitir sales.status = 'pending' cuando falta stock
- Crear reconciliation_movements como alertas
- Bridge reintenta ventas pending tras compras

---

### 2.7 Cursor de Sincronización Incremental ✅

**Sysme proporciona:** id_venta (secuencial, monotónico, único)  
**Latin POS trackea:** `sync_state.last_finalized_sale_id`

**Estrategia propuesta:**

```sql
-- Después de procesar correctamente venta con sysme_id_venta = "ABC123":
UPDATE sync_state 
SET 
  last_finalized_sale_id = "ABC123",
  last_sync_at = NOW(),
  status = 'idle'
WHERE integration_name = 'sysme_bridge';

-- Siguiente sincronización:
-- Bridge pide a Sysme: "Dame ventas con id_venta > ABC123"
-- Procesa solo incremental
```

**Validación:**
- ✅ `sync_state.last_finalized_sale_id` existe
- ✅ `sales.sysme_id_venta` es candidato
- ✅ Idempotencia: si Bridge falla en el UPDATE, reintenta mismo bloque

**Pregunta:** ¿Sysme garantiza monotonicidad?  
**Respuesta esperada:** SÍ, id_venta es secuencial en Sysme

---

### 2.8 Idempotencia ✅

**Mecanismo 1: event_key UNIQUE**
```sql
event_key = CONCAT(
  'sysme_sale_',
  sysme_id_venta,
  '_line_',
  sysme_id_linea
)
```
Si Bridge reenvía el mismo evento:
```
INSERT sync_events (..., event_key='sysme_sale_ABC_line_001')
-- 2do intento: UNIQUE constraint → CONFLICT
-- Código: detecta conflict, busca event anterior, verifica status='processed'
```

**Mecanismo 2: sysme_id_venta UNIQUE en sales**
```sql
INSERT sales (sysme_id_venta, ...)
-- Si ya existe: UPDATE en lugar de INSERT (depende lógica Bridge)
-- O: reutilizar sale_id existente
```

**Mecanismo 3: Procesamiento idempotente**
```
Recibir venta X
  1. Buscar sysme_id_venta en sales → encontrada?
     SÍ → Usar sale_id existente, actualizar si cambió
     NO → Crear nueva
  2. Buscar event_key en sync_events → encontrada?
     SÍ → Skip si status='processed', reintenta si status='failed'
     NO → Crear evento
```

**Validación:**
- ✅ Dos niveles de UNIQUE (sales.sysme_id_venta, sync_events.event_key)
- ✅ Permite reintentos seguros

---

### 2.9 Cancelaciones ✅

**Flujo de cancelación Sysme:**

```
1. Bridge recibe notificación: "Venta ABC123 cancelada en Sysme"
2. Busca sales.sysme_id_venta = 'ABC123' → encontrada
3. Crea NEW stock_movement:
   - type = 'sale_cancellation'
   - quantity = - (cantidad original de venta)
   - reference_id = sale_id
   - source = 'sysme_bridge'
4. UPDATE sales SET status='cancelled', cancelled_at=NOW()
5. Stock se reajusta automáticamente (sum de movimientos)
```

**Validación:**
- ✅ `stock_movements.movement_type` incluye 'sale_cancellation'
- ✅ `sales.cancelled_at` TIMESTAMPTZ para registrar cuándo
- ✅ `sales.status = 'cancelled'` semáforo
- ✅ Stock se recalcula con movimientos históricos

---

### 2.10 Errores y No-Repudio ✅

**bridge_errors tabla:**
```sql
- error_type: 'product_not_found', 'insufficient_stock', 'invalid_tax_rate', 'database_error'
- source: 'sysme_bridge'
- sysme_id_venta / sysme_id_linea: trazabilidad
- message: descripción SIN datos sensibles (precios, clientes, etc.)
- payload JSONB: contexto (cantidades, IDs, pero NO PII)
- resolved_at: cuándo se resolvió
```

**Validación:**
- ✅ Tabla diseñada para NO registrar PII
- ✅ Referencia a sysme_id para correlacionar
- ✅ resolved_at permite seguimiento de resolución

---

## 3. DECISIONES PENDIENTES

| # | Decisión | Opciones | Recomendación | Impacto |
|---|----------|----------|----------------|---------|
| 1 | Stock negativos | A: Permitir, B: Pending, C: Reconciliation, **D: B+C** | **D** | schema.sql + services |
| 2 | Cursor incremental | last_finalized_sale_id como string | SÍ, es candidato | sync_state.ts |
| 3 | Mapeo producto: 1:1 o N:1? | `product_id UNIQUE` = 1:1 | Confirmar si correcto | sysme_product_map |
| 4 | Tax_rate en sale_lines | Variar por línea vs hardcoded | Variar por línea | sales.service.ts |
| 5 | unit_cost_at_time origen | Costo Sysme vs costo local | Sysme si disponible | sales.service.ts |
| 6 | Timeout para pending sales | Cuántos días reintentar | 7 días propuesto | bridge.service.ts |
| 7 | Retry strategy | Exponential backoff, max retries | Max 5 reintentos | sync_events logic |
| 8 | Reconciliation trigger | Manual vs automático | Automático con alert | bridge_errors |

---

## 4. CAMBIOS MÍNIMOS REQUERIDOS AL SCHEMA

### 4.1 Permitir Stock Negativo (Opción D)
```sql
-- En sales: agregar status='pending' para ventas en espera
-- En sync_events: agregar retry_count NUMERIC DEFAULT 0

ALTER TABLE sync_events ADD COLUMN retry_count NUMERIC DEFAULT 0;
```

### 4.2 Agregar Control de Reintentos
```sql
ALTER TABLE sync_events ADD COLUMN 
  last_retry_at TIMESTAMPTZ;
ALTER TABLE sync_events ADD COLUMN 
  max_retries NUMERIC DEFAULT 5;
```

### 4.3 Mejoras Opcionales (NO críticas)
```sql
-- Permitir trazabilidad de "cuándo se resolvió un error"
-- Ya existe: bridge_errors.resolved_at ✅

-- Permitir agrupar errores relacionados
ALTER TABLE bridge_errors ADD COLUMN 
  batch_id UUID;  -- Agrupa errores del mismo intento de Bridge
```

---

## 5. MATRIZ DE TIPOS DE MOVIMIENTO

Sysme puede originar:

| Tipo | Origen | Creación | Reversal | Tax | Stock |
|------|--------|----------|----------|-----|-------|
| **purchase** | Sysme manual o Bridge | sale_lines | purchase_cancellation | Sysme | +qty |
| **sale** | Sysme POS | Bridge procesa | sale_cancellation | Sysme | -qty |
| **sale_cancellation** | Cancelación Sysme | Bridge | N/A | Revert | +qty |
| **sysme_reconciliation** | Recount Sysme | Bridge + manual | N/A | N/A | ajuste |
| **adjustment** | Manual Latin POS | Local | N/A | N/A | ajuste |

---

## 6. ESPECIFICACIÓN DE CAMPOS CRÍTICOS

### Campos OBLIGATORIOS en sync_events payload:
```json
{
  "sysme_id_venta": "unique_id_from_sysme",
  "sysme_id_linea": "line_id_or_null",
  "event_type": "sale_created|sale_cancelled",
  "timestamp": "ISO 8601",
  "data": {
    "id_empresa": "...",
    "id_centro": "...",
    "id_tipo_comg": "...",
    "id_complementog": "...",
    "cantidad": 10,
    "pvp_tiquet": 25.50,
    "avgiva": 10,
    "total": 280.55
  }
}
```

### event_key DEBE ser determinístico:
```
event_key = MD5(concat(
  'sysme_',
  sysme_id_venta,
  '_',
  sysme_id_linea or '',
  '_',
  event_type
))
```

---

## 7. RESUMEN DE VALIDACIÓN

| Componente | Estado | Evidencia | Acción |
|-----------|--------|-----------|--------|
| Mapeo productos | ✅ READY | sysme_product_map con composite key | Documentar constraints |
| Identidad de venta | ✅ READY | sales.sysme_id_venta UNIQUE | Documentar cursor strategy |
| Precio/cantidad | ✅ READY | sale_lines.unit_sale_price, quantity | Documentar fórmulas |
| Costo histórico | ✅ READY | sale_lines.unit_cost_at_time | Confirmar origen (Sysme vs local) |
| IVA variable | ✅ READY | sale_lines.tax_rate por línea | Documentar interpretación Sysme |
| Stock control | ⚠️ DECISION | Opción D propuesta: B+C | Implementar status='pending' |
| Idempotencia | ✅ READY | event_key UNIQUE, sysme_id_venta UNIQUE | Documentar procedimiento |
| Cancelaciones | ✅ READY | movement_type='sale_cancellation' | Documentar flujo |
| Errores | ✅ READY | bridge_errors tabla | Documentar categorías |
| Cursor incremental | ✅ READY | last_finalized_sale_id | Documentar estrategia |

---

## 8. PRÓXIMOS PASOS (SUBFASE 12.8)

- [ ] Resolver decisión #1 (stock negativo) → Usuario
- [ ] Documentar CONTRATO DE SINCRONIZACIÓN Sysme → Supabase
- [ ] Especificar formato JSON de Sysme (qué campos, tipos)
- [ ] Escribir servicio Bridge (NO implementar aún, solo pseudocódigo)
- [ ] Crear tabla de test cases para idempotencia
- [ ] Actualizar ESPECIFICACION_BRIDGE_WINDOWS.md
