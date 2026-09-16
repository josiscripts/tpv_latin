# CONTRATO DE SINCRONIZACIÓN
## Sysme TPV (MySQL) → Latin POS (Supabase PostgreSQL)

**Versión:** 1.0  
**Estado:** Especificación en progreso (Fase de diseño)  
**Fecha:** 2026-09-16  
**Responsable de implementación:** Bridge Windows Application (SUBFASE 12.9+)  

---

## 0. RESUMEN EJECUTIVO

Este contrato define **qué datos** Sysme proporciona, **cómo** se mapean a la base de datos Latin POS, y **qué garantías** ambos sistemas deben cumplir durante la sincronización incremental de ventas.

**Puntos clave:**
1. Sincronización unidireccional: Sysme → Latin POS (sin feedback)
2. Nivel de granularidad: Venta cabecera + líneas (atomicidad)
3. Frecuencia: Tiempo real (polling cada N segundos/minutos)
4. Garantía de idempotencia: event_key UNIQUE + sysme_id_venta UNIQUE
5. Manejo de errores: bridge_errors sin datos sensibles

---

## 1. IDENTIDAD Y AUTENTICACIÓN

### 1.1 Identificadores únicos de Sysme

Toda venta en Sysme se identifica por:

```
Clave compuesta:
┌─────────────────────────────────────────────────┐
│ id_empresa (texto)        — Empresa              │
│ id_centro (texto)         — Centro de operación │
│ id_venta (numérico)       — Secuencia de venta  │
└─────────────────────────────────────────────────┘

Ejemplo: empresa='LYMARKET', centro='LOCAL-01', id_venta='1043291'
```

### 1.2 Mapeo Sysme → Latin POS

Cada producto Sysme se mapea a un producto local mediante:

```
┌─────────────────────────────────────────────────────────────────┐
│ Sysme Composite Key                                             │
├─────────────────────────────────────────────────────────────────┤
│ id_empresa         — 'LYMARKET' (ej)                            │
│ id_centro          — 'LOCAL-01' (ej)                            │
│ id_tipo_comg       — Tipo de commodity (ej '01')                │
│ id_complementog    — Complemento (ej '00001' — código artículo) │
├─────────────────────────────────────────────────────────────────┤
│ ↓ LOOKUP en sysme_product_map                                   │
├─────────────────────────────────────────────────────────────────┤
│ product_id (UUID) — Identidad local única                       │
└─────────────────────────────────────────────────────────────────┘
```

**Base de datos:**
```sql
sysme_product_map:
  id_empresa TEXT
  id_centro TEXT
  id_tipo_comg TEXT
  id_complementog TEXT
  product_id UUID
  sysme_barcode TEXT (opcional)
  UNIQUE (id_empresa, id_centro, id_tipo_comg, id_complementog)
  UNIQUE (product_id) — 1:1 mapping
```

---

## 2. ESQUEMA DE DATOS A SINCRONIZAR

### 2.1 Venta (Cabecera) — sales

Bridge lee de Sysme:
```json
{
  "id_venta": "1043291",
  "serie_tiquet": "ALZ",
  "num_tiquet": "001234",
  "timestamp_venta": "2026-09-16T14:30:45",
  "metodo_pago": "EFECTIVO" | "TARJETA",
  "total_articulos": 3,
  "subtotal": 250.00,
  "total_impuesto": 25.00,
  "total_pagar": 275.00,
  "cancelada": false,
  "timestamp_cancelacion": null
}
```

Bridge escribe a Latin POS:
```sql
INSERT INTO sales (
  source,                -- 'sysme'
  status,                -- 'completed' | 'cancelled' | 'pending'
  sysme_id_venta,        -- id_venta
  sysme_serie,           -- serie_tiquet
  sysme_id_tiquet,       -- num_tiquet
  sale_date,             -- timestamp_venta
  subtotal,              -- subtotal
  tax,                   -- total_impuesto
  total,                 -- total_pagar
  payment_method,        -- metodo_pago
  created_at,            -- NOW()
  updated_at             -- NOW()
) VALUES (...)
RETURNING id as sale_id
```

**Restricciones:**
- `sysme_id_venta UNIQUE` — No duplicados
- `status IN ('completed', 'cancelled', 'pending')`
- `subtotal >= 0, tax >= 0, total >= 0`
- Si cancelada=true en Sysme:
  - Buscar sale_id existente
  - UPDATE sales SET status='cancelled', cancelled_at=NOW()
  - Crear stock_movement type='sale_cancellation'

---

### 2.2 Línea de Venta — sale_lines

Bridge lee de Sysme para CADA línea:
```json
{
  "id_linea": "001",
  "id_empresa": "LYMARKET",
  "id_centro": "LOCAL-01",
  "id_tipo_comg": "01",
  "id_complementog": "00012",
  "codigo_barras": "7501054321240",
  "descripcion": "Producto X",
  "cantidad": 10.5,
  "precio_unitario": 25.50,
  "descuento_linea": 0.00,
  "avgiva": 10.0,
  "total_linea": 267.75
}
```

Bridge escribe a Latin POS:
```sql
INSERT INTO sale_lines (
  sale_id,              -- sale_id from cabecera
  product_id,           -- lookup sysme_product_map
  sysme_id_venta,       -- id_venta (referencia)
  sysme_id_linea,       -- id_linea (secuencia local)
  quantity,             -- cantidad
  unit_sale_price,      -- precio_unitario
  unit_cost_at_time,    -- costounitar (de Sysme si disponible)
  tax_rate,             -- avgiva
  discount,             -- descuento_linea
  total_sale,           -- total_linea
  created_at            -- NOW()
) VALUES (...)
RETURNING id as line_id
```

**Cálculos internos (Latin POS):**
```
total_cost = unit_cost_at_time * quantity (si disponible)
gross_profit = total_sale - total_cost
gross_margin_percent = (gross_profit / total_sale) * 100
```

**Restricciones:**
- `quantity > 0`
- `unit_sale_price >= 0`
- `tax_rate >= 0 AND tax_rate <= 100`
- `total_sale >= 0`

---

### 2.3 Producto Mapeado (Lookup)

Si el producto NO está mapeado:
```
Bridge busca: sysme_product_map 
  WHERE id_empresa='LYMARKET' 
    AND id_centro='LOCAL-01'
    AND id_tipo_comg='01'
    AND id_complementog='00012'
→ NO encontrado
→ REGISTRO EN bridge_errors
→ sync_events status='failed'
→ Reintento en próxima sincronización
```

---

## 3. FLUJO DE SINCRONIZACIÓN

### 3.1 Estrategia Incremental (Cursor)

```
Loop de sincronización:
  1. SELECT * FROM sync_state WHERE integration_name='sysme_bridge'
  2. cursor = last_finalized_sale_id (null si primera vez)
  3. CALL Sysme.API.get_sales_since(cursor, limit=1000)
  4. FOR each venta:
       5. Procesar venta + líneas (transacción)
       6. Si éxito: UPDATE sync_state last_finalized_sale_id = venta_id
       7. Si error: REGISTRAR EN bridge_errors, continuar
  8. UPDATE sync_state last_sync_at = NOW(), status='idle'
```

**Parámetros:**
- `limit`: 1000 ventas por lote
- `timeout`: 30 segundos por lote
- `interval`: Ejecutar cada 5 minutos (configurable)

---

### 3.2 Transacción Atómica por Venta

```sql
BEGIN TRANSACTION;
  -- 1. Validar mapeo de productos
  FOR each linea IN venta.lineas:
    SELECT product_id FROM sysme_product_map 
    WHERE (id_empresa, id_centro, id_tipo_comg, id_complementog) 
      = (linea.id_empresa, linea.id_centro, linea.id_tipo_comg, linea.id_complementog)
    → Si NO encontrado: ROLLBACK + bridge_error

  -- 2. Crear venta (cabecera)
  INSERT INTO sales (..., sysme_id_venta='1043291')
  RETURNING sale_id
  → Si sysme_id_venta YA existe: SKIP (idempotencia)

  -- 3. Crear líneas
  FOR each linea IN venta.lineas:
    INSERT INTO sale_lines (sale_id, product_id, ...)
    RETURNING line_id

  -- 4. Actualizar stock
  FOR each linea IN venta.lineas:
    new_stock = products.stock - linea.quantity
    IF new_stock < 0:
      UPDATE sales SET status='pending'  -- Venta en espera
      INSERT INTO bridge_errors (error_type='insufficient_stock')
      COMMIT PARTIAL (parcial, para idempotencia)
    ELSE:
      UPDATE products SET stock=new_stock
      INSERT INTO stock_movements (type='sale', quantity=-linea.quantity)

COMMIT;
```

---

### 3.3 Idempotencia: Dos Niveles

**Nivel 1: UNIQUE en event_key**
```sql
event_key = MD5(CONCAT(
  'sysme_sale_',
  sysme_id_venta,
  '_',
  sysme_id_linea
))

INSERT INTO sync_events (
  event_key,        -- UNIQUE
  source,           -- 'sysme_bridge'
  event_type,       -- 'sale_created'
  source_id,        -- sysme_id_venta
  payload,          -- {id_venta, lineas, total, ...}
  status            -- 'pending'
)
→ Si ya existe: IGNORE (ya procesado)
```

**Nivel 2: UNIQUE en sales.sysme_id_venta**
```sql
INSERT INTO sales (..., sysme_id_venta='1043291')
→ Si ya existe: CONFLICT
→ Bridge detecta, busca sale_id existente, reutiliza
```

**Procedimiento Bridge ante UNIQUE violation:**
```
1. CATCH unique_violation exception
2. SELECT sale_id FROM sales WHERE sysme_id_venta='1043291'
3. Verificar sale_id coincide con nuestra intención
4. Si sí: Continue (ya está, idempotencia)
5. Si no: Error, registrar en bridge_errors
```

---

## 4. CASOS ESPECIALES

### 4.1 Cancelación de Venta

Sysme envía:
```json
{
  "id_venta": "1043291",
  "cancelada": true,
  "timestamp_cancelacion": "2026-09-16T15:00:00"
}
```

Bridge:
```sql
BEGIN TRANSACTION;
  -- 1. Buscar venta existente
  SELECT sale_id FROM sales WHERE sysme_id_venta='1043291'
  → No encontrado: Error, bridge_error
  → Encontrado: sale_id='ABC-123'

  -- 2. Marcar como cancelada
  UPDATE sales SET status='cancelled', cancelled_at=NOW() WHERE id='ABC-123'

  -- 3. Revertir movimientos de stock
  SELECT quantity FROM sale_lines WHERE sale_id='ABC-123'
  FOR each linea:
    INSERT INTO stock_movements (
      product_id,
      movement_type = 'sale_cancellation',
      quantity = +linea.quantity,  -- Invertido
      previous_stock = (actual actual),
      resulting_stock = (anterior anterior),
      reference_id = sale_id,
      source = 'sysme_bridge'
    )
    UPDATE products SET stock = stock + linea.quantity

  -- 4. Marcar evento como procesado
  UPDATE sync_events SET status='processed', processed_at=NOW()
    WHERE event_key=...

COMMIT;
```

**Restricciones:**
- Si sale.status='cancelled' YA: SKIP (idempotencia)
- Movimiento sale_cancellation debe ser invertible

---

### 4.2 Venta sin Stock Disponible

Si `products.stock < quantity_linea`:

```sql
BEGIN TRANSACTION;
  INSERT INTO sales (..., status='pending')  -- Venta en espera
  INSERT INTO sale_lines (...)
  -- NO actualizar stock
  INSERT INTO bridge_errors (
    error_type = 'insufficient_stock',
    sysme_id_venta = '1043291',
    message = 'Product X requires 10 units but only 5 available'
  )
  INSERT INTO sync_events (
    status='failed',
    error_message='Stock insuficiente, esperando reposición'
  )
COMMIT;

-- Posterior: cuando llega compra, Bridge detecta pending sales y reintenta
```

---

### 4.3 Producto No Mapeado

Si lookup en sysme_product_map FALLA:

```sql
BEGIN TRANSACTION;
  INSERT INTO bridge_errors (
    error_type = 'product_not_found',
    source = 'sysme_bridge',
    sysme_id_venta = '1043291',
    sysme_id_linea = '001',
    message = 'Sysme product LYMARKET/LOCAL-01/01/00012 not mapped in Latin POS',
    payload = {
      "sysme_composite": ["LYMARKET", "LOCAL-01", "01", "00012"],
      "sysme_description": "Producto X"
    }
  )
  INSERT INTO sync_events (
    status = 'failed',
    error_message = 'Product not found in sysme_product_map'
  )
ROLLBACK;
```

**Resolución manual:**
- Admin de Latin POS: Crea producto local o mapea existente
- Próxima sincronización: Bridge reintenta

---

## 5. GARANTÍAS DEL SISTEMA

### 5.1 Garantía de "Exactly-Once" Delivery

Sysme→Latin POS procesa cada venta **exactamente una vez** mediante:

1. **UNIQUE constraint en event_key**
   - Si Bridge falla entre INSERT sale y UPDATE sync_state
   - Reintento: event_key YA existe → SKIP

2. **UNIQUE constraint en sysme_id_venta**
   - Si dos procesos Bridge intenta procesar misma venta
   - Segundo: CONFLICT → detecta + reutiliza sale_id existente

3. **Transacción ACID**
   - Todo sale+líneas+stock se actualiza en una transacción
   - Si falla línea N: ROLLBACK todo, reintento la venta completa

### 5.2 Garantía de Stock Consistente

- Stock NUNCA es negativo en tablas finales (products.stock)
- Historial de movimientos (stock_movements) captura TODO
- Reconciliación es auditoria mediante movimientos históricos

### 5.3 Garantía de Trazabilidad

Cada dato sincronizado tiene:
- `sysme_id_venta` — Referencia a original Sysme
- `sysme_id_linea` — Identificador de línea Sysme
- `source='sysme'` — Origen en sales / source='sysme_bridge' en stock_movements
- `sync_events` — Registro completo del evento
- `created_at, updated_at` — Timestamps

### 5.4 Garantía de Recuperabilidad

Ante error Bridge:
- Todos los datos originales registrados en `bridge_errors`
- Error no es sensible (NO contiene PII, passwords, etc.)
- `resolved_at` permite marcar "errores resueltos"
- Reintento automático en próximo ciclo

---

## 6. ERRORES Y MANEJO

### 6.1 Tipos de Error bridge_errors

| error_type | Causa | Acción Bridge |
|-----------|-------|--------------|
| `product_not_found` | Sysme id_comg no mapeado | Error, reintento manual |
| `insufficient_stock` | Stock < cantidad | Venta pending, sin error |
| `invalid_tax_rate` | avgiva fuera rango [0,100] | Error, bridge_error |
| `duplicate_sale` | sysme_id_venta YA existe | Skip (idempotencia normal) |
| `database_error` | Fallo conexión Supabase | Error, reintento automático |
| `sysme_read_error` | Fallo lectura MySQL Sysme | Error, reintento automático |
| `transaction_failed` | ROLLBACK inesperado | Error, reintento automático |

### 6.2 Estructura bridge_errors

```sql
error_type TEXT NOT NULL,                   -- 'product_not_found'
source TEXT NOT NULL,                       -- 'sysme_bridge'
sysme_id_venta TEXT,                        -- '1043291'
sysme_id_linea TEXT,                        -- '001'
message TEXT NOT NULL,                      -- Sin PII
payload JSONB,                              -- Contexto: cantidades, IDs
occurred_at TIMESTAMPTZ DEFAULT NOW(),
resolved_at TIMESTAMPTZ,                    -- Cuando se resolvió
```

### 6.3 Retry Strategy

```
Max retries: 5
Backoff: Exponential (1s, 2s, 4s, 8s, 16s)

FOR i = 1 TO 5:
  TRY:
    Process venta
  CATCH error:
    IF i < 5: wait(2^i), retry
    ELSE: INSERT bridge_error, mark as 'failed'
```

---

## 7. INFORMACIÓN DE CONFIGURACIÓN

### 7.1 Credenciales y Endpoints

Bridge requiere:
```
SYSME_DB_HOST = "192.168.x.x"              -- IP del servidor Sysme MySQL
SYSME_DB_PORT = 3306
SYSME_DB_USER = "sysme_sync_user"
SYSME_DB_PASSWORD = "***"
SYSME_DB_NAME = "sysme"

SUPABASE_URL = "https://xxx.supabase.co"
SUPABASE_ANON_KEY = "eyJxxxxx"
SUPABASE_SERVICE_KEY = "eyJxxxxx"

POLLING_INTERVAL = 300000  -- 5 minutos en ms
BATCH_SIZE = 1000          -- Ventas por lote
BATCH_TIMEOUT = 30000      -- 30 segundos por lote
```

### 7.2 Tabla de Configuración (Propuesto)

```sql
CREATE TABLE bridge_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Inserts:
INSERT INTO bridge_config (key, value) VALUES
  ('polling_interval_ms', '300000'),
  ('batch_size', '1000'),
  ('batch_timeout_ms', '30000'),
  ('max_retries', '5'),
  ('alert_on_error', 'true')
```

---

## 8. MONITOREO Y ALERTAS

Bridge DEBE reportar:

| Métrica | Umbral | Acción |
|---------|--------|--------|
| `sync_state.status = 'error'` | Inmediato | Alert admin |
| `bridge_errors.count > 10 en 5 min` | 10+ | Alert |
| `last_sync_at < NOW()-1 hora` | 1h | Warni |
| `pending_sales.count > 100` | 100+ | Warn |
| `retry_count >= 5` (venta) | 5+ | Alert |

**Implementación:** Tabla de `bridge_alerts` o integración Slack

---

## 9. TESTING Y VALIDACIÓN

### 9.1 Test Cases Críticos

```
Test 1: Venta normal con mapeo correcto
  Input: Sysme venta con 3 líneas, stock disponible
  Output: sales + sale_lines creados, stock actualizado
  Assert: sysme_id_venta UNIQUE, stock_movements registrados

Test 2: Reintento de venta idempotente
  Input: Enviar misma venta 2x
  Output: 1era: éxito, 2da: SKIP (event_key duplicado)
  Assert: Sales sin duplicados

Test 3: Venta cancelada
  Input: Cancelación de venta existente
  Output: sales.status='cancelled', stock_movement 'sale_cancellation'
  Assert: Stock revertido correctamente

Test 4: Producto no mapeado
  Input: Venta con id_comg no existente
  Output: bridge_error + sync_events status='failed'
  Assert: Venta NO se crea

Test 5: Stock insuficiente
  Input: Venta 10 units, stock=5
  Output: sales status='pending', sin actualización stock
  Assert: Venta no se cancela, se queda esperando
```

---

## 10. HOJA DE RUTA DE IMPLEMENTACIÓN

**SUBFASE 12.8 (Current):** Documentación y design  
- ✅ Auditoría de esquema
- ✅ Este contrato
- ⏳ Decisiones pendientes (stock negativos, etc.)
- ⏳ Pseudocódigo de Bridge services

**SUBFASE 12.9:** Implementación Bridge (NO ESTA SUBFASE)
- [ ] Windows Bridge application (C#/.NET)
- [ ] MySQL reader para Sysme
- [ ] HTTP/HTTPS client para Supabase
- [ ] Polling engine con retry logic
- [ ] Error handling y logging

**SUBFASE 12.10:** Testing y documentación  
- [ ] Test cases de idempotencia
- [ ] Carga de datos históricos
- [ ] Validación de datos integridad
- [ ] Runbook de resolución de errores

---

## 11. APÉNDICE: EJEMPLO COMPLETO

### Escenario: Venta de 2 productos

**Sysme (MySQL) origina:**
```json
{
  "id_venta": "1043291",
  "serie_tiquet": "ALZ",
  "num_tiquet": "001234",
  "timestamp_venta": "2026-09-16T14:30:45Z",
  "metodo_pago": "EFECTIVO",
  "subtotal": 250.00,
  "total_impuesto": 25.00,
  "total_pagar": 275.00,
  "cancelada": false,
  "lineas": [
    {
      "id_linea": "001",
      "id_empresa": "LYMARKET",
      "id_centro": "LOCAL-01",
      "id_tipo_comg": "01",
      "id_complementog": "00012",
      "codigo_barras": "7501054321240",
      "descripcion": "Producto A",
      "cantidad": 10,
      "precio_unitario": 20.00,
      "descuento_linea": 0.00,
      "avgiva": 10.0,
      "total_linea": 220.00
    },
    {
      "id_linea": "002",
      "id_empresa": "LYMARKET",
      "id_centro": "LOCAL-01",
      "id_tipo_comg": "02",
      "id_complementog": "00045",
      "codigo_barras": "7501098765432",
      "descripcion": "Producto B",
      "cantidad": 3,
      "precio_unitario": 10.00,
      "descuento_linea": 0.00,
      "avgiva": 10.0,
      "total_linea": 33.00
    }
  ]
}
```

**Bridge procesa:**

```sql
-- Paso 1: Crear evento (si no existe)
INSERT INTO sync_events (
  event_key = MD5('sysme_sale_1043291_001'),
  source = 'sysme_bridge',
  event_type = 'sale_created',
  source_id = '1043291',
  payload = {...completo...},
  status = 'pending'
) ON CONFLICT DO NOTHING;

-- Paso 2: Validar mapeos
SELECT product_id FROM sysme_product_map 
WHERE (id_empresa, id_centro, id_tipo_comg, id_complementog) = ('LYMARKET', 'LOCAL-01', '01', '00012')
→ product_id_A (UUID)

SELECT product_id FROM sysme_product_map 
WHERE (id_empresa, id_centro, id_tipo_comg, id_complementog) = ('LYMARKET', 'LOCAL-01', '02', '00045')
→ product_id_B (UUID)

-- Paso 3: Crear cabecera
INSERT INTO sales (
  source = 'sysme',
  status = 'completed',
  sysme_id_venta = '1043291',
  sysme_serie = 'ALZ',
  sysme_id_tiquet = '001234',
  sale_date = '2026-09-16T14:30:45Z',
  subtotal = 250.00,
  tax = 25.00,
  total = 275.00,
  payment_method = 'EFECTIVO'
) RETURNING id as sale_id;  → sale_id = '550e8400-e29b-41d4-a716-446655440000'

-- Paso 4: Crear líneas
INSERT INTO sale_lines (
  sale_id = '550e8400-e29b-41d4-a716-446655440000',
  product_id = product_id_A,
  sysme_id_venta = '1043291',
  sysme_id_linea = '001',
  quantity = 10,
  unit_sale_price = 20.00,
  unit_cost_at_time = 12.50,  -- De Sysme o local
  tax_rate = 10.0,
  discount = 0,
  total_sale = 220.00
);

INSERT INTO sale_lines (
  sale_id = '550e8400-e29b-41d4-a716-446655440000',
  product_id = product_id_B,
  sysme_id_venta = '1043291',
  sysme_id_linea = '002',
  quantity = 3,
  unit_sale_price = 10.00,
  unit_cost_at_time = 5.50,
  tax_rate = 10.0,
  discount = 0,
  total_sale = 33.00
);

-- Paso 5: Actualizar stock
UPDATE products SET stock = stock - 10 WHERE id = product_id_A;
UPDATE products SET stock = stock - 3 WHERE id = product_id_B;

INSERT INTO stock_movements (
  product_id = product_id_A,
  movement_type = 'sale',
  quantity = -10,
  previous_stock = 50,
  resulting_stock = 40,
  reference_type = 'sale_line',
  reference_id = line_id_A,
  source = 'sysme_bridge'
);

INSERT INTO stock_movements (
  product_id = product_id_B,
  movement_type = 'sale',
  quantity = -3,
  previous_stock = 20,
  resulting_stock = 17,
  reference_type = 'sale_line',
  reference_id = line_id_B,
  source = 'sysme_bridge'
);

-- Paso 6: Marcar evento como procesado
UPDATE sync_events SET status='processed', processed_at=NOW() 
WHERE event_key = MD5('sysme_sale_1043291_001');

-- Paso 7: Actualizar cursor
UPDATE sync_state SET 
  last_finalized_sale_id = '1043291',
  last_sync_at = NOW(),
  status = 'idle'
WHERE integration_name = 'sysme_bridge';
```

**Resultado en Latin POS:**
- ✅ 1 venta creada (sales)
- ✅ 2 líneas creadas (sale_lines)
- ✅ Stock ajustado: Producto A 50→40, Producto B 20→17
- ✅ 2 movimientos históricos registrados
- ✅ Evento marcado como procesado
- ✅ Cursor actualizado para siguiente sincronización

---

## 12. PRÓXIMOS PASOS

Esta especificación requiere revisión y aprobación de:

1. **Equipo técnico Sysme:** ¿Campos, tipos, formatos JSON coinciden?
2. **Usuario (Lymarket):** ¿Decisiones de stock, IVA, mapeo son correctas?
3. **Implementador Bridge:** ¿Hay dudas sobre transacciones, retry, etc.?

Una vez aprobado, este contrato es **vinculante** para la implementación del Bridge Windows.
