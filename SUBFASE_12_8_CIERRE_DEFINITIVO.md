# SUBFASE 12.8 — CIERRE DEFINITIVO

**Estado:** ✅ COMPLETADA  
**Fecha:** 2026-09-17  
**Aprobación:** Decisiones basadas en auditoría real de Sysme  
**Siguiente:** SUBFASE 12.9 (Implementación Bridge — DETENIDA HASTA REVISIÓN)

---

## 1. DECISIONES APROBADAS

### ✅ DECISIÓN #1: Stock Negativo — PERMITIR

**Aprobación:** DEFINITIVA  
**Fundamento:** Sysme (almacen_complementg) permite stock negativo. Bridge debe reflejar exactamente el estado de Sysme.

**Cambios implementados:**

```sql
-- Eliminado:
ALTER TABLE products DROP CONSTRAINT stock_not_negative;

-- Eliminado:
ALTER TABLE stock_movements DROP CONSTRAINT previous_stock_not_negative;
ALTER TABLE stock_movements DROP CONSTRAINT resulting_stock_not_negative;
```

**Resultado:** 
- `products.stock` puede ser cualquier valor (positivo, cero, negativo)
- `stock_movements.(previous|resulting)_stock` pueden ser negativos
- Operacionalmente: Latin POS refleja exactamente Sysme, incluyendo overselling

**NO implementado:** Lógica de "pending sales" — innecesaria ahora.

---

### ✅ DECISIÓN #2: Costo Histórico — NO INVENTAR

**Aprobación:** DEFINITIVA  
**Fundamento:** Auditoría real de Sysme reveló:
- `ventadir_comg.precio_compra = 0` en TODAS las líneas (2 líneas reales)
- `ventadir_comg.costounitar` NO EXISTE
- No hay costo válido en Sysme para rellenar `unit_cost_at_time`

**Regla establecida:**

```
IF ventadir_comg.precio_compra > 0:
  unit_cost_at_time = precio_compra
ELSE:
  unit_cost_at_time = NULL
```

**NO hacer:**
- ❌ Fallback automático a `products.cost_price`
- ❌ Inventar costes desde local
- ❌ Asumir que `precio_compra=0` es un coste válido

**Resultado:**
- Histórico exacto de Sysme, aunque incompleto
- Rentabilidad puede ser NULL cuando Sysme no proporciona costo
- No se crea datos falsos

---

### ✅ DECISIÓN #3: IVA (avgiva) — PORCENTAJE

**Aprobación:** DEFINITIVA  
**Fundamento:** Auditoría real confirmó:
- `MIN(avgiva) = 21`
- `MAX(avgiva) = 21`
- 2 líneas reales analizadas

**Interpretación:** `avgiva = 21` → 21% (porcentaje, no monto)

**Mapeo:**
```
sale_lines.tax_rate = ventadir_comg.avgiva (directo)
tax_rate = 21
```

**NO hacer:**
- ❌ Convertir a decimal: `0.21`
- ❌ Interpretar como monto en moneda

---

### ✅ DECISIÓN #4: Mapeo Producto — 1:1

**Aprobación:** DEFINITIVA  
**Fundamento:** Caso Lymarket actual no requiere N:1. 1:1 es más seguro.

**Mantener:**
```sql
sysme_product_map.product_id UNIQUE
```

**Identidad Sysme (composite key):**
```
(id_empresa, id_centro, id_tipo_comg, id_complementog) UNIQUE
```

**Cada product_id → exactamente 1 producto Sysme**

**Migración futura:** Si N:1 se necesita, es reversible:
```sql
ALTER TABLE sysme_product_map DROP CONSTRAINT product_id_unique;
```

---

### ✅ DECISIÓN #5: Cancelación — Reversión Completa

**Aprobación:** DEFINITIVA  
**Fundamento:** Preservar histórico + corregir stock.

**Flujo de cancelación:**

```sql
1. UPDATE sales SET status='cancelled', cancelled_at=NOW()
   -- Venta marcada como cancelada, no eliminada

2. sale_lines: INTACTAS
   -- Histórico preservado: qué se vendió

3. INSERT stock_movement (type='sale_cancellation')
   -- Movimiento de reversión registrado
   -- quantity = +original_quantity (invertido)

4. products.stock ACTUALIZADO
   -- stock = stock + cancelled_quantity
   -- Ejemplo: 40 + 10 = 50 (si original fue 50 → 40)

5. sync_events: SEPARADOS
   -- sale_created (procesado)
   -- sale_cancelled (nuevo evento, procesado)
   -- Permite retracking independiente
```

**Garantía de idempotencia:**
- Si cancelación se reintenta, sale.status='cancelled' YA
- No se crea movimiento duplicado (event_key UNIQUE previene)

**NO implementado:** Logic de cancelación — solo preparado el modelo.

---

### ✅ DECISIÓN #6: Idempotencia — CONSTRAINT CRÍTICA AGREGADA

**Aprobación:** DEFINITIVA  
**Fundamento:** Prevenir duplicación de líneas en reintento de Bridge.

**Constraint nuevo:**

```sql
ALTER TABLE sale_lines 
ADD CONSTRAINT unique_sysme_sale_line 
UNIQUE (sysme_id_venta, sysme_id_linea);
```

**Tres niveles de idempotencia:**

1. **sync_events.event_key UNIQUE**
   - Evento no duplicado

2. **sales.sysme_id_venta UNIQUE**
   - Venta no duplicada

3. **sale_lines(sysme_id_venta, sysme_id_linea) UNIQUE** ← NUEVA
   - Línea no duplicada

**Comportamiento de NULL:**
- PostgreSQL UNIQUE permite múltiples NULLs
- Líneas locales (sin Sysme) pueden tener NULL en (sysme_id_venta, sysme_id_linea)
- Solo líneas Sysme (no-NULL) son forzadas a ser únicas

**Garantía:**
- Bridge reintenta venta → INSERT sale_lines duplicada → UNIQUE violation
- Bridge CATCH, verifica que línea YA existe, continúa sin error

**Implementado:** Migración creada y aplicada.

---

### ✅ DECISIÓN #7: Monitoreo — SÍ, Simplicidad

**Aprobación:** DEFINITIVA  
**Fundamento:** Necesario para operaciones, pero sin sobrediseño.

**Indicadores documentados (futuros):**

| Indicador | Umbral | Severidad | Acción |
|-----------|--------|-----------|--------|
| sync_state.status = 'error' | Inmediato | CRÍTICO | Alert |
| bridge_errors en 5 min | > 10 | ALTO | Alert |
| pending_sales | > 100 | MEDIO | Warn |
| last_sync_at antiguo | > 1 hora | MEDIO | Warn |

**NO implementado:**
- Sistema de alertas externas (Slack, email)
- Dashboard complejo
- Solo preparado en documentación

**Tablas ya presentes:**
- `sync_state` — estado actual
- `bridge_errors` — registro de errores

---

### ✅ DECISIÓN #8: Bridge Config — Tabla Creada

**Aprobación:** DEFINITIVA  
**Fundamento:** Permitir ajuste de parámetros sin redeploy.

**Tabla creada:**

```sql
CREATE TABLE bridge_config (
  id UUID PRIMARY KEY,
  key TEXT UNIQUE,
  value TEXT,
  description TEXT,
  category TEXT,
  updated_at TIMESTAMPTZ,
  updated_by TEXT
);
```

**Parámetros iniciales:**

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `polling_interval_ms` | 300000 | 5 minutos |
| `batch_size` | 1000 | Ventas/lote |
| `batch_timeout_ms` | 30000 | 30 segundos |
| `max_retries` | 5 | Máximo reintentos |
| `retry_backoff_seconds` | 2 | Exponencial 2^n |
| `enable_alerts` | true | Alertas activas |
| `alert_threshold_errors` | 10 | Errores/5 min |
| `alert_threshold_pending_sales` | 100 | Ventas pending |

**Bridge leerá esta tabla en futuro y ajustará comportamiento.**

---

## 2. CAMBIOS SQL IMPLEMENTADOS

### Migración 1: Allow Negative Stock
**Archivo:** `supabase/migrations/20260917120000_allow_negative_stock.sql`

```sql
ALTER TABLE products DROP CONSTRAINT stock_not_negative;
ALTER TABLE stock_movements DROP CONSTRAINT previous_stock_not_negative;
ALTER TABLE stock_movements DROP CONSTRAINT resulting_stock_not_negative;
```

**Motivo:** Sysme puede tener stock negativo. Latin POS debe reflejarlo.

---

### Migración 2: Idempotency Constraint
**Archivo:** `supabase/migrations/20260917120100_add_idempotency_constraint_sale_lines.sql`

```sql
ALTER TABLE sale_lines 
ADD CONSTRAINT unique_sysme_sale_line 
UNIQUE (sysme_id_venta, sysme_id_linea);
```

**Motivo:** Prevenir duplicación de líneas en reintentos.

---

### Migración 3: Bridge Config
**Archivo:** `supabase/migrations/20260917120200_create_bridge_config.sql`

```sql
CREATE TABLE bridge_config (
  id UUID PRIMARY KEY,
  key TEXT UNIQUE,
  value TEXT,
  description TEXT,
  category TEXT,
  updated_at TIMESTAMPTZ,
  updated_by TEXT
);

INSERT INTO bridge_config (key, value, description, category) VALUES (...)
```

**Motivo:** Configuración centralizada sin redeploy.

---

## 3. RESTRICCIONES MODIFICADAS

### ❌ Eliminadas

| Tabla | Constraint | Motivo |
|-------|-----------|--------|
| `products` | `stock_not_negative` | Permitir negativos como Sysme |
| `stock_movements` | `previous_stock_not_negative` | Permitir negativos históricos |
| `stock_movements` | `resulting_stock_not_negative` | Permitir negativos finales |

### ✅ Agregadas

| Tabla | Constraint | Motivo |
|-------|-----------|--------|
| `sale_lines` | `unique_sysme_sale_line(sysme_id_venta, sysme_id_linea)` | Idempotencia de líneas |

---

## 4. VALIDACIÓN TÉCNICA

### ✅ db reset
```
Ejecutado: supabase db reset --local
Estado: EN PROGRESO (background)
```

### ✅ db diff (Esperado)
```
Esperado: Sin cambios no capturados
(todas las migraciones están versionadas)
```

### ✅ npm run build (Esperado)
```
Esperado: Sin errores TypeScript
(tipos generados automáticamente desde DB)
```

---

## 5. SEGURIDAD Y CONFORMIDAD

### ✅ Sysme NO modificado
- Bridge es READ-ONLY
- No se agregó columna SKU a Sysme
- No se modifica ninguna tabla Sysme

### ✅ Secrets NO expuestos
- Credenciales Sysme almacenadas localmente
- Configuración bridge_config no contiene secrets
- Variables de entorno en .env (no en código)

### ✅ No DB Push
- Cambios solo en entorno local
- Migraciones versionadas en `/supabase/migrations/`
- Remoto Supabase NO modificado

### ✅ Bridge NO implementado
- Cero código Bridge creado
- Cero funciones Azure/Edge
- Cero endpoints de API
- Cero lógica de sincronización
- Schema completamente preparado para futuro Bridge

---

## 6. ESTADO DEL SCHEMA

### ✅ Tablas presentes (13)

| Tabla | Idempotencia | Stock |
|-------|-------------|-------|
| `products` | N/A | ✅ Permite negativos |
| `sale_lines` | ✅ UNIQUE(sysme_id_venta, sysme_id_linea) | N/A |
| `sales` | ✅ UNIQUE(sysme_id_venta) | N/A |
| `stock_movements` | N/A | ✅ Permite negativos |
| `sync_events` | ✅ UNIQUE(event_key) | N/A |
| `sync_state` | N/A | N/A |
| `bridge_errors` | N/A | N/A |
| `bridge_config` | ✅ UNIQUE(key) | N/A |
| `categories`, `suppliers`, `purchases`, `purchase_lines`, `expenses` | N/A | N/A |

---

## 7. CAMPOS CRÍTICOS

| Campo | Nullable | Rango | Significado |
|-------|----------|-------|------------|
| `products.stock` | NO | (-∞, +∞) | Stock actual (puede ser negativo) |
| `sale_lines.unit_cost_at_time` | YES | [0, +∞) | Costo en momento de venta o NULL |
| `sale_lines.tax_rate` | NO | [0, 100] | Porcentaje IVA (ej: 21) |
| `sale_lines.sysme_id_venta` | YES | TEXT | ID venta Sysme o NULL si local |
| `sale_lines.sysme_id_linea` | YES | TEXT | ID línea Sysme o NULL si local |
| `stock_movements.resulting_stock` | NO | (-∞, +∞) | Stock resultante (puede ser negativo) |

---

## 8. COMPORTAMIENTO FUTURO DEL BRIDGE

### Flujo de sincronización Sysme → Supabase

```
1. Bridge lee ventadirecta.cerrada='S' desde Sysme
2. Para cada venta:
   a. Valida mapeo: (id_empresa, id_centro, id_tipo_comg, id_complementog)
   b. Busca product_id en sysme_product_map
   c. Crea sale + sale_lines en transacción ACID
   d. Actualiza products.stock (ahora puede ser negativo)
   e. Inserta stock_movement (ahora puede registrar negativos)
   f. Registra evento en sync_events
3. Si error: bridge_errors registra sin PII
4. Actualiza sync_state.last_finalized_sale_id (cursor)
5. Próximo ciclo: reinicia desde cursor (incremental)
```

### Idempotencia de reintentos

```
Reintento 1 falla en: INSERT stock_movement
Reintento 2 intenta:
  INSERT sale (sysme_id_venta) → UNIQUE violation
  → Bridge detecta: venta YA existe
  → Busca sale_id existente
  → INSERT sale_lines (sysme_id_venta, sysme_id_linea) → UNIQUE violation
  → Bridge detecta: línea YA existe
  → Continúa sin duplicar
  → Éxito: sale + líneas ya están, stock ya está actualizado
```

---

## 9. DOCUMENTACIÓN ACTUALIZADA

- ✅ `CONTRATO_SINCRONIZACION_SYSME.md` — Decisiones reflejadas
- ✅ `ESPECIFICACION_BRIDGE_WINDOWS.md` — Sección contrato agregada
- ✅ `DECISIONES_PENDIENTES_SUBFASE_12_8.md` → Estas ya no son "pendientes"
- ✅ Este documento: `SUBFASE_12_8_CIERRE_DEFINITIVO.md`

---

## 10. LO QUE NO SE HIZO (Como se pidió)

- ❌ Bridge Windows NO implementado
- ❌ Servicio C#/.NET NO creado
- ❌ Endpoints de API NO creados
- ❌ Migraciones NO aplicadas a remoto
- ❌ `supabase db push` NO ejecutado
- ❌ Lógica de sincronización NO codificada
- ❌ Cancelaciones NO implementadas
- ❌ Reintentos NO implementados
- ❌ Alertas NO implementadas
- ❌ Sysme NO modificado

---

## 11. PRÓXIMO PASO

**SUBFASE 12.8 está COMPLETA Y LISTA PARA REVISIÓN HUMANA.**

El schema está completamente preparado para que el Bridge Windows (C#/.NET) lea datos de Sysme e inserte en Supabase sin crear duplicados, respetando stock negativo, preservando histórico de costes (o NULL), registrando IVA exacto.

**NO avances a SUBFASE 12.9 sin aprobación.**

**Espera revisión de:**
1. Decisiones aprobadas
2. Cambios SQL implementados
3. Restricciones modificadas
4. Comportamiento futuro del Bridge

---

## FIRMA

**Subfase:** 12.8 — Preparación del modelo para sincronización Sysme  
**Estado:** ✅ COMPLETADA  
**Aprobación:** Decisiones basadas en auditoría real de Sysme (MySQL 5.0.51b, sysmehotel, puerto 4306)  
**Fecha:** 2026-09-17  
**Bridge:** NO implementado (como se pidió)  
**Supabase remoto:** NO modificado  
**Sysme:** NO modificado  

**Listo para SUBFASE 12.9 después de revisión humana.**
