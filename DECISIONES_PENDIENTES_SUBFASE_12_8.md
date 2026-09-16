# DECISIONES PENDIENTES — SUBFASE 12.8
**Especificación de Sincronización Sysme**

**Responsable de resolver:** Usuario (Lymarket)  
**Impacto:** Implementación del Bridge Windows (SUBFASE 12.9)

---

## DECISIÓN 1: Control de Stock Negativo ⚠️

### Contexto
El esquema actual requiere `stock_movements.resulting_stock >= 0`. ¿Qué sucede si Sysme envía una venta por 10 unidades cuando Latin POS solo tiene 5?

### Opción A: Permitir Stock Negativo
```sql
-- Remover constraint:
ALTER TABLE stock_movements DROP CONSTRAINT resulting_stock_not_negative;
```

**Ventajas:**
- ✅ Implementación rápida
- ✅ Sin cambios en lógica Bridge
- ✅ Sincronización sin demoras

**Desventajas:**
- ❌ Stock negativo no es realista
- ❌ Reportes de inventario confusos
- ❌ Potencial para errores de restock

---

### Opción B: Venta PENDING si Falta Stock
```sql
-- Si stock insuficiente:
INSERT sales (..., status='pending')  -- Venta en espera
-- NO actualizar stock
-- Guardar en bridge_errors: "Stock insuficiente"
-- Cuando llega compra que repone: 
--   Bridge detecta pending sales, reintentar
--   UPDATE sales SET status='completed'
```

**Ventajas:**
- ✅ Stock siempre positivo
- ✅ Ventas trackeables (estado pending)
- ✅ Posibilidad de resolver manualmente

**Desventajas:**
- ❌ Procesamiento en 2 pasos
- ❌ Lógica Bridge compleja
- ❌ Venta "incompleta" temporalmente

---

### Opción C: Reconciliación Automática
```sql
-- Si stock insuficiente:
INSERT sales (..., status='completed')  -- Venta OK
INSERT sale_lines (...)
-- Crear movement type='sysme_reconciliation'
--   quantity = -delta (negativo)
-- Stock = stock - cantidad - delta = SIEMPRE positivo
```

**Ventajas:**
- ✅ Stock nunca negativo
- ✅ Venta se crea inmediatamente
- ✅ Reconciliación automática

**Desventajas:**
- ❌ Crea movimientos "ficticios"
- ❌ Discrepancia entre físico y sistema

---

### Opción D: RECOMENDADA - Combinación B+C
```
1. Si stock >= cantidad: sale.status='completed'
2. Si stock < cantidad:  sale.status='pending' + bridge_error
3. Crear stock_movement type='pending_adjustment' (alert)
4. Cuando compra llega: buscar pending sales, reintentar
5. Si stock es suficiente: desbloquear venta
```

**Implementación:**

**Sale creada:**
```sql
BEGIN
  IF stock >= cantidad THEN
    INSERT sales (..., status='completed')
    UPDATE stock
    INSERT movement type='sale'
  ELSE
    INSERT sales (..., status='pending')
    -- NO actualizar stock
    INSERT bridge_errors(error_type='insufficient_stock', ...)
    INSERT movement type='pending_alert' (qty=0, para auditoría)
  END IF
COMMIT
```

**Cuando compra llega:**
```sql
-- Actualizar stock por compra
UPDATE products SET stock = stock + cantidad WHERE ...
INSERT movement type='purchase'

-- Buscar ventas pending
SELECT * FROM sales WHERE status='pending'
FOR each venta:
  RETRY procesar_venta()
```

---

### RECOMENDACIÓN
**OPCIÓN D** (Combinación B+C)

**Por qué:**
- ✅ Stock siempre positivo (0 o más)
- ✅ Ventas no se pierden (pending)
- ✅ Auditable (bridge_errors + pending_alert movements)
- ✅ Resolvible cuando llega reposición
- ⚠️ Requiere lógica de "reintentos de pending sales"

**Cambios requeridos al schema:**
```sql
-- 1. Agregar columnas de retry en sync_events
ALTER TABLE sync_events ADD COLUMN retry_count NUMERIC DEFAULT 0;
ALTER TABLE sync_events ADD COLUMN last_retry_at TIMESTAMPTZ;

-- 2. Crear índice para buscar pending sales
CREATE INDEX idx_sales_pending ON sales(status, created_at) 
  WHERE status='pending';
```

---

## DECISIÓN 2: Origen del Costo (unit_cost_at_time)

### Contexto
Al crear sale_lines, ¿cuál es la fuente de `unit_cost_at_time`?

### Opción A: Costo de Sysme
- Sysme envía costounitar del producto (último costo registrado)
- Bridge escribe: `unit_cost_at_time = Sysme.costounitar`

**Ventajas:**
- ✅ Costo actualizado (Sysme es fuente de verdad)
- ✅ Histórico preciso de márgenes Sysme

**Desventajas:**
- ❌ Diferencias si Latin POS tiene diferente costo

---

### Opción B: Costo de Latin POS
- Ignorar Sysme.costounitar
- Bridge busca en products: `unit_cost_at_time = products.cost_price`

**Ventajas:**
- ✅ Coherencia con productos locales

**Desventajas:**
- ❌ Pierde información Sysme

---

### Opción C: Priorizar Sysme, fallback a Local
```
unit_cost_at_time = Sysme.costounitar ?: products.cost_price
```

**Ventajas:**
- ✅ Máxima información (Sysme si existe, local si no)

---

### RECOMENDACIÓN
**OPCIÓN C** (Priorizar Sysme, fallback a local)

```sql
IF Sysme.costounitar IS NOT NULL:
  unit_cost_at_time = Sysme.costounitar
ELSE:
  unit_cost_at_time = (SELECT cost_price FROM products WHERE id = product_id_A)
```

---

## DECISIÓN 3: Interpretación de avgiva (Porcentaje vs Monto)

### Contexto
Sysme envía `avgiva`. ¿Es un porcentaje (ej: 10) o monto en moneda (ej: 2.50)?

### Opción A: avgiva es PORCENTAJE
```
avgiva = 10 (significa 10%)
tax_rate = 10
tax_monto = (unit_sale_price * quantity * tax_rate) / 100
```

**Evidencia:** Nombre "avgiva" (average VAT, impuesto)

---

### Opción B: avgiva es MONTO
```
avgiva = 2.50 (monto en moneda)
tax_rate = (avgiva / total_linea) * 100
```

---

### RECOMENDACIÓN
**OPCIÓN A** (avgiva es PORCENTAJE)

**Justificación:**
- "avg**iva**" = promedio de Impuesto al Valor Agregado
- En contabilidad, IVA se expresa como %
- Coherente con sale_lines.tax_rate (NUMERIC(5,2) suele ser %)

**Implementación:**
```sql
tax_rate = Sysme.avgiva  -- Directo, es %
```

---

## DECISIÓN 4: Mapeo de Productos — ¿1:1 o N:1?

### Contexto
¿Puede un producto Latin POS mapear a múltiples productos Sysme?

**Esquema actual:**
```sql
sysme_product_map:
  product_id UUID UNIQUE   -- Cada product_id mapea a 1 Sysme
  (id_empresa, id_centro, id_tipo_comg, id_complementog) UNIQUE
```

### Opción A: 1:1 (Actual)
- Cada product_id → exactamente 1 producto Sysme
- product_id UNIQUE en sysme_product_map

**Ventajas:**
- ✅ Simple, sin ambigüedades
- ✅ Lookup O(1) único

**Desventajas:**
- ❌ No soporta casos edge: ej 1 SKU de múltiples proveedores

---

### Opción B: N:1 (Múltiples Sysme → 1 Local)
```sql
sysme_product_map:
  -- SIN UNIQUE en product_id
  (id_empresa, id_centro, id_tipo_comg, id_complementog) → product_id
  (id_empresa, id_centro, id_tipo_comg, id_complementog2) → product_id (MISMO)
```

**Ventajas:**
- ✅ Productos Sysme con diferentes códigos → 1 SKU local

**Desventajas:**
- ❌ Lookup ambiguo
- ❌ Requiere resolver automáticamente

---

### RECOMENDACIÓN
**OPCIÓN A** (1:1) — **Mantener actual**

**Por qué:**
- Sin información Sysme, es el caso más seguro
- Si necesario, usuario puede crear producto "virtual" local

**Nota:** Si Lymarket necesita N:1 en futuro:
```sql
ALTER TABLE sysme_product_map DROP CONSTRAINT product_id_unique;
CREATE UNIQUE INDEX idx_sysme_composite ON sysme_product_map(id_empresa, id_centro, id_tipo_comg, id_complementog);
```

---

## DECISIÓN 5: Cancelación de Venta — ¿Revertir o Marcar?

### Contexto
Cuando Sysme cancela una venta, ¿cómo se registra?

### Opción A: Revertir Completamente
```sql
UPDATE sales SET status='cancelled', cancelled_at=NOW()
INSERT stock_movement type='sale_cancellation' -- Revertir qty
-- Líneas de venta quedan intactas (historical)
```

**Ventajas:**
- ✅ Stock se auto-corrige
- ✅ Historial preservado

**Desventajas:**
- Stock si varias líneas se revierte parcialmente

---

### Opción B: Marcar sin Revertir
```sql
UPDATE sales SET status='cancelled', cancelled_at=NOW()
-- NO crear movimiento de stock
-- Reportes ignoran cancelled sales
```

**Desventajas:**
- ❌ Stock inconsistente

---

### RECOMENDACIÓN
**OPCIÓN A** (Revertir completamente)

```sql
BEGIN
  UPDATE sales SET status='cancelled', cancelled_at=NOW() 
  WHERE sysme_id_venta = ?
  
  FOR each linea IN original_sale:
    INSERT stock_movement (
      type='sale_cancellation',
      quantity = +linea.quantity,
      reference_id = sale_id,
      source='sysme_bridge'
    )
  
  UPDATE products SET stock = (actual + revertidos)
COMMIT
```

---

## DECISIÓN 6: Margen de Tiempo para Reintento

### Contexto
¿Cuánto tiempo esperar antes de desistir de un reintento?

### Opciones:
- **1 hora** — Reintento frecuente, más tolerante
- **24 horas** — Estándar de retail
- **7 días** — Máximo, luego alert a admin

---

### RECOMENDACIÓN
**7 días con escalonamiento:**

```
Primer reintento: 1 segundo después
Segundo: 1 minuto después
Tercero: 1 hora después
Cuarto: 6 horas después
Quinto: 24 horas después (máximo)

Si falla después de 5 reintentos:
  - Marcar como 'failed' permanente
  - Admin revisa bridge_errors
```

---

## DECISIÓN 7: Monitoreo — ¿Alertas en Tiempo Real?

### Contexto
¿El sistema debe alertar a admin si Bridge tiene problemas?

### Recomendación
**SÍ, niveles escalados:**

| Evento | Severidad | Acción |
|--------|-----------|--------|
| `sync_state.status = 'error'` | CRÍTICO | Alert inmediato |
| `bridge_errors > 10 en 5 min` | ALTO | Alert en 5 min |
| `pending_sales > 100` | MEDIO | Alert en 1 hora |
| `last_sync > 1 hora atrás` | MEDIO | Warn en 1 hora |

**Implementación:** 
- Tabla `bridge_alerts`
- Integración Slack (opcional)
- Dashboard de monitoreo

---

## DECISIÓN 8: ¿Crear Tabla de Configuración Bridge?

### Contexto
Parámetros como polling_interval, batch_size, max_retries están hardcoded.

### Recomendación
**SÍ:**

```sql
CREATE TABLE bridge_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

INSERT INTO bridge_config (key, value, description) VALUES
  ('polling_interval_ms', '300000', 'Cada 5 minutos'),
  ('batch_size', '1000', 'Ventas por lote'),
  ('batch_timeout_ms', '30000', '30 segundos por lote'),
  ('max_retries', '5', 'Máximo reintentos'),
  ('retry_backoff_seconds', '2', 'Exponencial 2^n'),
  ('alert_on_error', 'true', 'Alertas habilitadas');
```

**Ventajas:**
- ✅ Configurable sin redeploy
- ✅ Auditoria de cambios

---

## RESUMEN: DECISIONES PARA RESOLVER

| # | Decisión | Recomendación | Cambios Schema | Cambios Bridge |
|---|----------|----------------|------------------|-----------------|
| 1 | Stock negativo | **Opción D** (Pending+Reconciliation) | Agregar retry_count | Lógica de pending |
| 2 | Origen costo | **Opción C** (Sysme → fallback local) | No | Fallback lógico |
| 3 | avgiva | **Porcentaje** (10 = 10%) | No | tax_rate = avgiva |
| 4 | Mapeo producto | **1:1** (mantener) | No | No |
| 5 | Cancelación | **Revertir** (movimiento) | No | sale_cancellation |
| 6 | Reintento timeout | **7 días escalado** | Agregar last_retry_at | Exponential backoff |
| 7 | Monitoreo | **SÍ, con alertas** | Nueva tabla bridge_alerts | Check lógico |
| 8 | Config | **SÍ, tabla bridge_config** | Nueva tabla | Read config |

---

## VALIDACIÓN DE DECISIONES

**Checklist usuario:**
- [ ] ¿Decisión #1 (stock negativo) es aceptable?
- [ ] ¿Decisión #2 (costo Sysme) tiene sentido?
- [ ] ¿Decisión #3 (avgiva = %) es correcta?
- [ ] ¿Decisión #4 (mapeo 1:1) es suficiente?
- [ ] ¿Decisión #5 (cancelación con revertir) es correcta?
- [ ] ¿Decisión #6 (7 días) es timeout razonable?
- [ ] ¿Decisión #7 (alertas) es necesaria?
- [ ] ¿Decisión #8 (tabla config) es útil?

**Una vez aprobadas**, estas decisiones se integran en:
1. `CONTRATO_SINCRONIZACION_SYSME.md` (actualizar)
2. Schema SQL (cambios mínimos)
3. Pseudocódigo Bridge (SUBFASE 12.9)
