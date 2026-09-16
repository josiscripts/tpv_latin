# RESUMEN — SUBFASE 12.8
**Preparación del modelo para sincronización Sysme (sin Bridge todavía)**

**Estado:** ✅ DOCUMENTACIÓN COMPLETADA | ⏳ APROBACIÓN USUARIO  
**Fecha:** 2026-09-16

---

## ¿QUÉ SE HA HECHO?

SUBFASE 12.8 cumple su objetivo: **diseñar, auditar y documentar el contrato de sincronización Sysme sin implementar el Bridge aún.**

### Documentos Generados

| Documento | Propósito | Audiencia | Estado |
|-----------|-----------|-----------|--------|
| **AUDITORIA_SUBFASE_12_8.md** | Análisis técnico del esquema actual | Arquitectos | ✅ Completo |
| **CONTRATO_SINCRONIZACION_SYSME.md** | Especificación formal de datos y flujos | Bridge team | ✅ Completo |
| **DECISIONES_PENDIENTES_SUBFASE_12_8.md** | 8 decisiones que requieren aprobación usuario | Lymarket | ⏳ Espera aprobación |
| **PSEUDOCODIGO_BRIDGE_SERVICE.md** | Arquitectura C#/.NET para implementación | Desarrollador Bridge | ✅ Completo |
| **Este documento** | Resumen ejecutivo y próximos pasos | Todos | ✅ Completo |

---

## VALIDACIÓN DEL ESQUEMA ACTUAL

### ✅ Lo que ESTÁ LISTO

```
✅ Tablas de sincronización presentes (sales, sale_lines, stock_movements, etc.)
✅ Campos Sysme presentes (sysme_id_venta, sysme_id_linea, sysme_serie)
✅ Mapeo compuesto de productos (sysme_product_map)
✅ Preservación de costo histórico (unit_cost_at_time)
✅ IVA variable por línea (tax_rate)
✅ Movimientos de stock con tipos (sale, purchase, adjustment, reconciliation)
✅ Idempotencia en dos niveles (event_key UNIQUE, sysme_id_venta UNIQUE)
✅ Registros de error sin PII (bridge_errors)
✅ Cursor para sincronización incremental (sync_state.last_finalized_sale_id)
```

**Conclusión:** El esquema SQL es **robusto y preparado para Sysme.** No requiere cambios mayores.

---

## 8 DECISIONES PENDIENTES

El documento `DECISIONES_PENDIENTES_SUBFASE_12_8.md` detalla:

### 1. Stock Negativo ⚠️ CRÍTICA
**Recomendación:** Opción D (Venta PENDING + Reconciliación)
- Si stock < cantidad: venta status='pending', sin movimiento
- Cuando compra llega: reintentar venta
- Auditable y reversible

**Decisión requerida:** ¿Aprobado? SÍ/NO

---

### 2. Origen de Costo
**Recomendación:** Priorizar Sysme, fallback a local
- Si Sysme envía costounitar: usarlo
- Si no: usar products.cost_price

---

### 3. Interpretación avgiva
**Recomendación:** Porcentaje (10 = 10%)
- tax_rate = Sysme.avgiva (directo)

---

### 4. Mapeo Producto
**Recomendación:** 1:1 (mantener actual)
- Cada product_id = exactamente 1 producto Sysme

---

### 5. Cancelación
**Recomendación:** Revertir completamente
- UPDATE sales status='cancelled'
- INSERT stock_movement type='sale_cancellation'

---

### 6. Timeout de Reintento
**Recomendación:** 7 días con backoff exponencial
- 1s, 1m, 1h, 6h, 24h
- Máx 5 reintentos

---

### 7. Monitoreo
**Recomendación:** SÍ, con alertas escaladas
- CRÍTICO si sync_state='error'
- ALTO si > 10 errores / 5 min
- MEDIO si pending_sales > 100

---

### 8. Tabla de Configuración
**Recomendación:** SÍ
- bridge_config para parámetros runtime
- Evitar hardcoding en Bridge

---

## ¿QUÉ CAMBIOS AL SCHEMA SQL SE REQUIEREN?

**Mínimos:**

```sql
-- 1. Agregar columnas de retry a sync_events (si Opción D aprobada)
ALTER TABLE sync_events ADD COLUMN 
  retry_count NUMERIC DEFAULT 0;

ALTER TABLE sync_events ADD COLUMN 
  last_retry_at TIMESTAMPTZ;

-- 2. Crear tabla bridge_config (si decisión #8 aprobada)
CREATE TABLE bridge_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Crear tabla bridge_alerts (si decisión #7 aprobada)
CREATE TABLE bridge_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  severity TEXT,
  message TEXT,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Índice para buscar pending sales
CREATE INDEX idx_sales_pending ON sales(status, created_at) 
  WHERE status='pending';
```

**Impacto:** Mínimo. NO destruye tablas, solo extensiones.

---

## PRÓXIMAS SUBFASES

### SUBFASE 12.9 — Implementación del Bridge Windows
**Requisito:** Usuario aprueba las 8 decisiones

**Tareas:**
- [ ] Desarrollar aplicación Windows (C#/.NET)
- [ ] MySQL reader para Sysme
- [ ] HTTP client Supabase
- [ ] Polling engine con reintentos
- [ ] Logging y monitoreo
- [ ] Testing de idempotencia

**Tiempo estimado:** 2-3 semanas (depende de equipo)

---

### SUBFASE 12.10 — Testing e Integración
**Requisito:** Bridge implementado

**Tareas:**
- [ ] Test cases de idempotencia
- [ ] Carga de datos históricos Sysme
- [ ] Validación integridad
- [ ] Runbook de troubleshooting
- [ ] Capacitación usuario

**Tiempo estimado:** 1 semana

---

## CHECKPOINTS PARA USUARIO

### ✅ CHECKLIST APROBACIÓN

Antes de proceder a SUBFASE 12.9, usuario debe validar:

**Decisiones:**
- [ ] ¿Opción D (stock pending) es correcta?
- [ ] ¿Prioridad Sysme-costo es correcta?
- [ ] ¿avgiva como % es correcto?
- [ ] ¿Mapeo 1:1 es suficiente?
- [ ] ¿Cancelación con revertir es correcta?
- [ ] ¿Timeout 7 días es razonable?
- [ ] ¿Alertas son necesarias?
- [ ] ¿Tabla config es útil?

**Esquema:**
- [ ] ¿Cambios SQL mínimos son aceptables?
- [ ] ¿Índices propuestos son correctos?
- [ ] ¿No hay otros cambios requeridos?

**Documentación:**
- [ ] ¿Contrato especifica todo claramente?
- [ ] ¿Hay dudas sobre flujos?
- [ ] ¿Pseudocódigo es suficiente para implementación?

---

## ¿CÓMO USAR ESTOS DOCUMENTOS?

### Para Usuario (Lymarket)
1. Leer **DECISIONES_PENDIENTES_SUBFASE_12_8.md**
2. Validar cada decisión:
   - ¿Tiene sentido?
   - ¿Refleja cómo Sysme funciona?
   - ¿Es práctico para operaciones?
3. Aprobar o solicitar cambios
4. Firmar contrato (CONTRATO_SINCRONIZACION_SYSME.md)

### Para Desarrollador Bridge
1. Leer **CONTRATO_SINCRONIZACION_SYSME.md** (requiere del usuario)
2. Estudiar **PSEUDOCODIGO_BRIDGE_SERVICE.md**
3. Implementar iterando sobre pseudocódigo
4. Validar cada caso de prueba en "APÉNDICE: EJEMPLO COMPLETO"

### Para Arquitecto
1. Leer **AUDITORIA_SUBFASE_12_8.md** (análisis)
2. Revisar **CONTRATO_SINCRONIZACION_SYSME.md** (consistencia)
3. Validar decisiones contra restricciones (DECISIONES_PENDIENTES_SUBFASE_12_8.md)

---

## MATRIZ DE DECISIONES

```
DECISIÓN               RECOMENDACIÓN           IMPACTO                 APROBACIÓN
═════════════════════════════════════════════════════════════════════════════════
1. Stock negativo      Opción D (Pending)      Schema + Bridge logic   ⏳ Usuario
2. Origen costo        Sysme→fallback          Bridge logic            ⏳ Usuario
3. avgiva              Porcentaje (%)          Bridge logic            ⏳ Usuario
4. Mapeo producto      1:1                     Schema                  ⏳ Usuario
5. Cancelación         Revertir                Bridge logic            ⏳ Usuario
6. Reintento timeout   7 días exponencial      Bridge logic            ⏳ Usuario
7. Monitoreo           SÍ con alertas          Schema + Bridge         ⏳ Usuario
8. Config              Tabla bridge_config     Schema                  ⏳ Usuario
```

---

## ARCHIVOS GENERADOS

```
SUBFASE_12_8/
├── AUDITORIA_SUBFASE_12_8.md
├── CONTRATO_SINCRONIZACION_SYSME.md
├── DECISIONES_PENDIENTES_SUBFASE_12_8.md
├── PSEUDOCODIGO_BRIDGE_SERVICE.md
└── RESUMEN_SUBFASE_12_8.md (este)
```

**Ubicación:** Raíz del proyecto Latin POS

**Git state:** Archivos están **untracked** (??), listos para commit en siguiente subfase

---

## FLUJO DE APROBACIÓN

```
┌─ Usuario revisa DECISIONES_PENDIENTES
│  └─ Aprueba cada decisión (SÍ/CAMBIO)
│     ├─ Si CAMBIO: feedback, actualizar documentos
│     └─ Si SÍ: continuar
├─ Usuario firma CONTRATO_SINCRONIZACION_SYSME
├─ Architect valida consistencia
└─ Proceder a SUBFASE 12.9 (Bridge implementation)
```

---

## ESTADO ACTUAL

| Componente | Status | Evidencia | Acción |
|-----------|--------|-----------|--------|
| Schema audit | ✅ Completo | AUDITORIA_SUBFASE_12_8.md | Ninguna |
| Contrato | ✅ Completo | CONTRATO_SINCRONIZACION_SYSME.md | Aprobación usuario |
| Decisiones | ✅ Identificadas | DECISIONES_PENDIENTES_SUBFASE_12_8.md | Aprobación usuario |
| Pseudocódigo | ✅ Completo | PSEUDOCODIGO_BRIDGE_SERVICE.md | Referencia |
| Schema SQL | ✅ Listo | Cambios mínimos identificados | Esperar aprobación |

---

## PRÓXIMO PASO

**Usuario debe:**

1. Leer `DECISIONES_PENDIENTES_SUBFASE_12_8.md`
2. Validar cada una de las 8 decisiones
3. Responder para cada una: **APROBADO** o **CAMBIO SOLICITADO**
4. Si cambio: describir qué cambiar
5. Una vez aprobadas todas: SUBFASE 12.8 cierra, inicia SUBFASE 12.9

---

**SUBFASE 12.8 está LISTA PARA APROBACIÓN.**

Todos los documentos están escritos, auditados y listos. El usuario tiene la palabra.
