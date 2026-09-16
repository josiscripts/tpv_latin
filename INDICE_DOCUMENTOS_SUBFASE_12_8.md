# 📑 ÍNDICE DE DOCUMENTOS
## SUBFASE 12.8 — Preparación del modelo para sincronización Sysme

**Fecha:** 2026-09-16  
**Total documentos:** 7

---

## DOCUMENTACIÓN GENERADA

### 1. CARTA_DE_ENTREGA_SUBFASE_12_8.md
**Punto de entrada — Lectura obligatoria PRIMERO**

- Resumen ejecutivo de toda la subfase
- Entregables completados
- Matriz de validación del esquema
- Próximas acciones por rol
- Checklist de aprobación
- Cronograma

**Lectura:** 10 minutos  
**Para:** Todos  
**Siguiente paso:** Leer según tu rol

---

### 2. DECISIONES_PENDIENTES_SUBFASE_12_8.md
**Lectura obligatoria para USUARIO (Lymarket)**

**8 decisiones que requieren aprobación:**

1. **Stock negativo** — Opción D (Pending + Reconciliation)
   - Si stock insuficiente: venta queda pending
   - Se reintenta cuando compra llega

2. **Origen de costo** — Sysme → fallback a local
   - Prioridad: costounitar de Sysme
   - Fallback: products.cost_price si no disponible

3. **Interpretación avgiva** — Porcentaje (%)
   - avgiva = 10 → 10%
   - tax_rate = avgiva (directo)

4. **Mapeo de productos** — 1:1 (mantener actual)
   - product_id UNIQUE en sysme_product_map
   - Cada producto local = exactamente 1 Sysme

5. **Cancelación** — Revertir completamente
   - UPDATE sales status='cancelled'
   - INSERT stock_movement type='sale_cancellation'

6. **Reintento timeout** — 7 días con backoff exponencial
   - 1s, 1m, 1h, 6h, 24h
   - Max 5 intentos

7. **Monitoreo** — SÍ, con alertas escaladas
   - CRÍTICO: sync_state='error'
   - ALTO: > 10 errores / 5 min
   - MEDIO: pending_sales > 100

8. **Tabla de configuración** — bridge_config
   - Parámetros runtime sin hardcoding
   - polling_interval, batch_size, max_retries, etc.

**Para cada decisión, usuario responde:**
```
DECISIÓN #1 (Stock negativo):  ✅ APROBADO  o  ⚠️ CAMBIO: [descripción]
```

**Lectura:** 20 minutos  
**Para:** Usuario (Lymarket)  
**Acción:** Aprobar o solicitar cambios  
**Plazo:** 1-2 días

---

### 3. CONTRATO_SINCRONIZACION_SYSME.md
**Especificación formal VINCULANTE**

**Tabla de contenidos:**
- Resumen ejecutivo
- Identidad y autenticación (Sysme → Latin POS)
- Esquema de datos (JSON de Sysme)
- Mapeo a Supabase
- Flujo de sincronización (4 pasos)
- Transacción ACID por venta
- Idempotencia (2 niveles)
- Casos especiales (cancelación, stock insuficiente, mapeo faltante)
- Garantías del sistema
- Errores y manejo (7 tipos de error)
- Retry strategy
- Información de configuración
- Monitoreo y alertas
- Testing y validación
- Hoja de ruta de implementación
- Apéndice: Ejemplo completo paso a paso

**Lectura:** 45 minutos  
**Para:** Desarrollador Bridge, Architect  
**Importancia:** CRÍTICA — Este es el contrato vinculante  
**Uso:** Template para implementación SUBFASE 12.9

---

### 4. AUDITORIA_SUBFASE_12_8.md
**Análisis técnico del esquema actual**

**Validaciones incluidas:**
1. Estado actual del esquema (13 tablas)
2. Validación de campos Sysme presentes
3. Análisis de identidad del producto
4. Análisis de identidad de venta
5. Precio y total (fórmulas)
6. Costo e historial (unit_cost_at_time)
7. IVA/impuestos (tax_rate variable)
8. Stock — restricción crítica (resulting_stock >= 0)
9. Cursor de sincronización incremental
10. Idempotencia (2 niveles)
11. Cancelaciones (flujo reversal)
12. Errores y no-repudio (bridge_errors)

**Matriz de tipos de movimiento:**
- purchase, sale, sale_cancellation, sysme_reconciliation, adjustment

**Matriz de decisiones:**
- 8 decisiones con opciones y recomendaciones

**Lectura:** 30 minutos  
**Para:** Architect, Técnicos  
**Uso:** Referencia técnica del análisis

---

### 5. PSEUDOCODIGO_BRIDGE_SERVICE.md
**Arquitectura C#/.NET para Bridge**

**Contenido:**
- Estructura de carpetas
- Models (SysmeVenta, SysmeLinea, SyncPayload, BridgeConfig)
- Core Services (interfaces y contratos)
- SyncOrchestrator completo (orquestación)
- SyncWorker (polling loop 5 min)
- SysmeRepository (MySQL reader)
- SupabaseRepository (PostgreSQL writer)
- Dependency injection (Program.cs)
- Configuración (appsettings.json)
- 8 puntos clave

**Código:**
- Pseudocódigo en C# real (compilable)
- Transacciones ACID
- Manejo de errores
- Reintentos con backoff
- Health checks
- Logging

**Lectura:** 60 minutos  
**Para:** Desarrollador Bridge  
**Uso:** Template para iteración (NOT copia-pega)  
**Importante:** Es pseudocódigo, requiere ajustes

---

### 6. RESUMEN_SUBFASE_12_8.md
**Resumen ejecutivo y próximos pasos**

**Secciones:**
- ¿Qué se ha hecho? (Documentos generados)
- Validación del esquema (✅ Listo)
- 8 decisiones pendientes (⏳ Espera aprobación)
- Cambios SQL requeridos (mínimos)
- Próximas subfases (12.9, 12.10)
- Checkpoints de aprobación
- Cómo usar estos documentos (por rol)
- Matriz de decisiones
- Flujo de aprobación
- Estado actual

**Lectura:** 15 minutos  
**Para:** Todos  
**Uso:** Referencia rápida

---

### 7. Este Índice (INDICE_DOCUMENTOS_SUBFASE_12_8.md)
**Navegación de documentos**

- Descripción de cada documento
- Audiencia recomendada
- Tiempo de lectura
- Orden de lectura sugerido
- Tabla de uso por rol

---

## 🎯 ORDEN DE LECTURA RECOMENDADO

### Para Usuario (Lymarket)
```
1. CARTA_DE_ENTREGA_SUBFASE_12_8.md         (10 min)
   ↓
2. DECISIONES_PENDIENTES_SUBFASE_12_8.md    (20 min) ← APROBAR AQUÍ
   ↓
3. CONTRATO_SINCRONIZACION_SYSME.md         (45 min, opcional)
   ↓
ENVIAR APROBACIONES A EQUIPO TÉCNICO
```
**Total:** 30-75 minutos

---

### Para Desarrollador Bridge
```
1. CARTA_DE_ENTREGA_SUBFASE_12_8.md         (10 min)
   ↓
2. CONTRATO_SINCRONIZACION_SYSME.md         (45 min) ← LECTURA OBLIGATORIA
   ↓
3. PSEUDOCODIGO_BRIDGE_SERVICE.md           (60 min) ← TEMPLATE
   ↓
4. AUDITORIA_SUBFASE_12_8.md                (30 min, referencia)
   ↓
INICIAR SUBFASE 12.9 (Implementación)
```
**Total:** 2-3 horas

---

### Para Architect
```
1. CARTA_DE_ENTREGA_SUBFASE_12_8.md         (10 min)
   ↓
2. AUDITORIA_SUBFASE_12_8.md                (30 min) ← ANÁLISIS TÉCNICO
   ↓
3. DECISIONES_PENDIENTES_SUBFASE_12_8.md    (20 min) ← VALIDAR CONSISTENCIA
   ↓
4. CONTRATO_SINCRONIZACION_SYSME.md         (45 min, verificación)
   ↓
VALIDAR ESPECIFICACIÓN
```
**Total:** 1.5-2 horas

---

## 📍 MATRIZ DE USO POR ROL

| Rol | Lectura Obligatoria | Lectura Recomendada | Referencia |
|-----|-------------------|-------------------|-----------|
| **Usuario** | DECISIONES_PENDIENTES | CONTRATO | RESUMEN |
| **Developer Bridge** | CONTRATO, PSEUDO | AUDITORIA | CARTA |
| **Architect** | AUDITORIA | CONTRATO, DECISIONES | PSEUDO |
| **Project Manager** | RESUMEN, CARTA | DECISIONES | CONTRATO |

---

## 📊 ESTADÍSTICAS

| Métrica | Valor |
|---------|-------|
| **Documentos generados** | 7 |
| **Páginas totales** | ~150 |
| **Palabras totales** | ~35,000 |
| **Decisiones documentadas** | 8 |
| **Tablas analizadas** | 13 |
| **Casos especiales cubiertos** | 7 |
| **Test cases definidos** | 5 |
| **Líneas pseudocódigo** | ~500 |

---

## 🔗 REFERENCIAS CRUZADAS

**CONTRATO_SINCRONIZACION_SYSME.md**
- → Referencias a AUDITORIA (justificación técnica)
- → Referencias a DECISIONES_PENDIENTES (#3, #5, #6)
- → Usa decisiones de DECISIONES_PENDIENTES

**PSEUDOCODIGO_BRIDGE_SERVICE.md**
- → Implementa flujos del CONTRATO
- → Usa decisiones de DECISIONES_PENDIENTES
- → Referencia campos de AUDITORIA

**ESPECIFICACION_BRIDGE_WINDOWS.md (actualizado)**
- → Nueva sección "Contrato de Sincronización"
- → Referencias a CONTRATO_SINCRONIZACION_SYSME.md
- → Validación de DECISIONES_PENDIENTES

---

## ✅ CHECKLIST DE LECTURA

### Usuario
- [ ] CARTA_DE_ENTREGA — Entendido resumen ejecutivo
- [ ] DECISIONES_PENDIENTES — Validadas 8 decisiones
- [ ] (Opcional) CONTRATO — Entendido flujo completo

### Developer
- [ ] CARTA_DE_ENTREGA — Entendido contexto
- [ ] CONTRATO — Leído completamente
- [ ] PSEUDO — Entendida arquitectura
- [ ] AUDITORIA — Referencia para dudas

### Architect
- [ ] CARTA_DE_ENTREGA — Entendido resumen
- [ ] AUDITORIA — Validado análisis técnico
- [ ] DECISIONES — Validada consistencia
- [ ] (Opcional) CONTRATO — Verificación spot check

---

## 🚀 PRÓXIMOS PASOS

1. **Usuario:** Aprueba decisiones (plazo 1-2 días)
2. **Equipo:** Recibe aprobaciones
3. **Developer:** Inicia SUBFASE 12.9 (Implementation)
4. **Team:** Construye Bridge Windows

---

## 📝 NOTAS FINALES

Todos los documentos están **interconectados** pero pueden leerse independientemente.

**Flujo lógico:**
- CARTA de ENTREGA → Punto de entrada
- DECISIONES → Aprobación usuario
- CONTRATO → Especificación vinculante
- PSEUDO → Implementación
- AUDITORIA → Justificación técnica
- RESUMEN → Referencia rápida

**Actualización:** Si usuario solicita cambios en DECISIONES, todos los documentos se actualizan antes de SUBFASE 12.9.

---

**Generado:** 2026-09-16  
**Estado:** ✅ COMPLETO Y LISTO

---

*Fin del índice de documentos.*
