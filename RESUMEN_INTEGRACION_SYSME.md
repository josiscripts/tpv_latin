# 📑 RESUMEN EJECUTIVO: INTEGRACIÓN SYSME TPV → PANEL

**Proyecto:** Latin POS + Sysme TPV Bridge  
**Fecha:** 16 de septiembre de 2026  
**Tipo:** Auditoría de LECTURA - Sin cambios  

---

## 🎯 OBJETIVO

Integrar stock en tiempo real desde Sysme TPV Local al Panel React mediante:
- Bridge Windows (Node.js)
- Supabase PostgreSQL  
- HTTPS + Polling cada 5 minutos

---

## 📊 ESTADO ACTUAL DEL PANEL

### Tabla de Productos
```
Archivo: src/lib/pos-data.ts
Estructura: export const products: Product[]
Total productos: 8 (demostración)
Almacenamiento: En memoria (se pierden al recargar)
```

### Campos Disponibles

| Campo | Tipo | Ejemplo | Único |
|-------|------|---------|-------|
| id | number | 1 | ✅ |
| sku | string | BEB-INK-300 | ✅ |
| barcode | string | 7750011001847 | ✅ |
| name | string | Inca Kola 300 ml | ❌ |
| **stock** | **number** | **42** | **-** |
| min | number | 12 | ❌ |
| price | number | 2.50 | ❌ |
| cost | number | 1.35 | ❌ |
| state | string | ok/low/critical/out | - |

### Stock Actual

```
Inca Kola:      42 unidades
Maltín Polar:    8 unidades  (⚠️ bajo)
Chifles:        24 unidades
Panela:          5 unidades  (⚠️ crítico)
Ají amarillo:   16 unidades
Dulce de leche: 11 unidades  (⚠️ bajo)
Harina PAN:     36 unidades
Yuca:            0 unidades  (⚠️ sin stock)
```

### Actualización de Stock

```
Cómo se actualiza ACTUALMENTE:
  ❌ NO SE ACTUALIZA
  
Botones que intenta hacerlo:
  • "Cobrar en efectivo" → solo toast, no persiste
  • "Cobrar con tarjeta" → solo toast, no persiste
  • "Registrar compra" → botón vacío sin handler
  • "Registrar ajuste" → botón vacío sin handler

Persistencia:
  ❌ NO EXISTE
```

---

## 🔄 FLUJO DE SINCRONIZACIÓN PROPUESTO

```
SYSME TPV              Bridge Windows         Panel React
(Local)                (Node.js)              (Web)
   │                      │                     │
   ├─ Lee cada 5 min ─────→│                     │
   │  Tabla Productos      │                     │
   │                       ├─ Mapea IDs ─────────→│
   │                       │                     │
   │                       ├─ Supabase ──────────→│
   │                       │  UPDATE products    │
   │                       │  INSERT stock_moves │
   │                       │                     │
   └─────────────────────────────────────────────→│
                                             Muestra stock
                                             actualizado
```

---

## 🗺️ MAPEO RECOMENDADO

### Problema
```
Sysme identifica por:  (id_empresa, id_centro, id_tipo_comg, id_complementog)
Ejemplo:               (001,         01,         0001,         00001)

Panel identifica por:  id
Ejemplo:              1
```

### Solución: Tabla de Mapeo
```sql
sysme_product_map
├─ panel_product_id: 1
├─ panel_sku: BEB-INK-300
├─ panel_barcode: 7750011001847
├─ sysme_empresa: 001
├─ sysme_centro: 01
├─ sysme_tipo_comg: 0001
├─ sysme_complementog: 00001
├─ sysme_codbarras: 000100001
└─ sync_status: synced
```

### Identificador Recomendado
```
PRIMARY: Barcode (EAN13)
  - Universal
  - Estándar internacional
  - Ambos sistemas lo tienen

ALTERNATIVE: (empresa, centro, tipo, complemento) compuesto
  - Si barcode no está disponible
  - Más preciso pero complejo
```

---

## 📁 ARCHIVOS QUE NECESITAN CAMBIOS

### Para funcionar ANTES del Bridge

```
✅ src/lib/pos-data.ts
   └─ Agregar campo: sysme_id

✅ Crear tabla en Supabase
   └─ sysme_product_map
   └─ stock_movements (si no existe)
   └─ sync_log
```

### Para el Bridge

```
🆕 bridge-sysme-panel/ (nueva carpeta)
   ├─ src/
   │  ├─ services/sysme/
   │  ├─ services/mapper/
   │  ├─ services/supabase/
   │  └─ api/routes.ts
   ├─ package.json
   └─ .env
```

### NO MODIFICAR

```
❌ src/components/ (por ahora)
❌ Supabase RLS (solo agregar policy)
❌ Frontend React (será automático)
```

---

## 🛠️ COMPONENTES A CONSTRUIR

### 1. SysmeConnector
```typescript
// Conecta a Sysme DB o API
connect()
query(sql)
disconnect()
```

### 2. SysmeReader  
```typescript
// Lee datos de Sysme
getProducts()
getStockMovements(since)
getProductById()
```

### 3. ProductMapper
```typescript
// Mapea IDs Sysme ↔ Panel
mapSysmeToPanel(product)
detectNewProducts()
```

### 4. SupabaseSync
```typescript
// Sincroniza a Supabase
syncProduct(mapped)
handleConflicts()
logSync()
```

### 5. Express API
```typescript
POST /api/bridge/sync
GET /api/bridge/status
PUT /api/bridge/product/:id
```

---

## 📋 TABLA COMPARATIVA

### Sysme TPV

```
Ubicación:   Windows local
BD:          MSSQL (probablemente)
API:         ¿Disponible?
Identifica:  (empresa, centro, tipo, complemento)
Stock:       stock_actual, stock_minimo
Movimientos: ¿Existe tabla?
```

### Panel React

```
Ubicación:   Browser / Supabase
BD:          PostgreSQL (Supabase)
API:         React Query
Identifica:  id (numérico)
Stock:       products.stock
Movimientos: ❌ NO EXISTE
```

---

## 🚀 PLAN DE IMPLEMENTACIÓN

### Fase 1: Preparación (3 días)
- [ ] Obtener info de API/BD de Sysme
- [ ] Crear tablas en Supabase
- [ ] Setup Node.js + librerías

### Fase 2: Connectors (5 días)
- [ ] SysmeConnector (MSSQL/API)
- [ ] SysmeReader
- [ ] Testing de conexión

### Fase 3: Mapper + Sync (5 días)
- [ ] ProductMapper
- [ ] SupabaseSync
- [ ] ConflictResolver

### Fase 4: API + Deploy (4 días)
- [ ] Express routes
- [ ] Polling automático
- [ ] Windows Service setup

### Fase 5: Testing (3 días)
- [ ] End-to-end testing
- [ ] Performance
- [ ] Documentación

**Total: ~3-4 semanas**

---

## ❓ INFORMACIÓN QUE FALTA

### De Sysme (CRÍTICO)

```
□ ¿Cómo acceder a Sysme?
  □ IP: _______
  □ Puerto: _______
  □ Usuario/Password: _______
  □ ¿Tiene API REST? SÍ / NO
  □ ¿Acceso directo a BD? SÍ / NO (MSSQL/MySQL/Otra)

□ Tabla de Productos en Sysme:
  □ Nombre exacto: _______
  □ Estructura (columnas): _______
  □ ¿Hay tabla de movimientos? SÍ / NO
  □ ¿Hay timestamps? SÍ / NO

□ Identificación de Productos:
  □ ¿Usa barcode? SÍ / NO
  □ ¿Usa código interno? SÍ / NO
  □ PK: _______
```

### Del Panel (RESPONDIDO)

```
✅ Tabla: products (src/lib/pos-data.ts)
✅ Stock: products.stock (number)
✅ IDs: numéricos (1-8) + SKU + Barcode
✅ Actualización: NO IMPLEMENTADA
✅ Persistencia: NO EXISTE
```

---

## 🎯 OBJETIVOS ALCANZABLES

### Corto Plazo (Sin Bridge)
```
✅ Conectar Frontend a Supabase
✅ Persistencia de datos
✅ Autenticación de usuarios
✅ Historial de movimientos
```

### Largo Plazo (Con Bridge)
```
✅ Sincronización automática Sysme
✅ Stock en tiempo real
✅ Transacciones bidireccionales
✅ Reportes consolidados
```

---

## 📊 COMPLEJIDAD VS BENEFICIO

| Tarea | Complejidad | Beneficio | ROI |
|-------|-------------|----------|-----|
| Conectar Supabase | ⭐⭐ | ⭐⭐⭐⭐ | Alto |
| Bridge Windows | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Muy Alto |
| Actualizar Panel UI | ⭐ | ⭐⭐ | Medio |
| Reportes avanzados | ⭐⭐ | ⭐⭐⭐ | Medio-Alto |

---

## 💰 ESTIMACIÓN DE COSTOS

### Desarrollo Bridge
```
Connectors:        40 horas  (~$800)
Mapper + Sync:     30 horas  (~$600)
API + Testing:     30 horas  (~$600)
Documentación:     10 horas  (~$200)
────────────────────────────
Total:            110 horas  (~$2,200)
```

### Infraestructura
```
Supabase Pro:      $25/mes   (~$300/año)
Windows Server:    Existente
Node.js Runtime:   Gratis
```

---

## ✅ CHECKLIST PARA EMPEZAR

### Antes de Desarrollo

```
□ Entender estructura actual del panel
  ✅ HECHO: Auditoría completada
  
□ Obtener documentación de Sysme
  ⏳ PENDIENTE: Obtener de Sysme
  
□ Crear proyecto Supabase
  ⏳ PENDIENTE: Crear tablas necesarias
  
□ Decidir: ¿MSSQL directo o API de Sysme?
  ⏳ PENDIENTE: Aclarar con Sysme
```

### Durante Desarrollo

```
□ Setup Node.js + TypeScript
□ Crear connectors
□ Testing de lectura
□ Implementar mapper
□ Implementar sync
□ Deploy a Windows Service
```

### Después de Deploy

```
□ Training del equipo
□ Monitoreo de logs
□ Optimización de performance
□ Backup de datos
□ Documentación final
```

---

## 📞 CONTACTOS NECESARIOS

### De Sysme
```
Responsable técnico: _________________
Email: _________________
Teléfono: _________________

API Documentation: _________________
DB Credentials: _________________
```

### Del Panel
```
Dueño del proyecto: Josias
Email: josiasquispeprofessional@gmail.com

Supabase Project: (crear)
Supabase URL: (obtener)
Supabase Key: (obtener)
```

---

## 🎓 DOCUMENTACIÓN GENERADA

1. **AUDITORIA_TECNICA.md** (70+ pages)
   - Análisis completo del proyecto
   - Esquema de BD propuesto
   - Datos para integrar Sysme

2. **AUDITORIA_STOCK_Y_MAPEO.md** (40+ pages)
   - Modelado actual de productos
   - Campo de stock real
   - Mapeo Sysme ↔ Panel
   - Archivos que intervienen
   - Plan del Bridge

3. **ESPECIFICACION_BRIDGE_WINDOWS.md** (30+ pages)
   - Arquitectura detallada
   - Componentes a construir
   - Código ejemplo TypeScript
   - Setup como Windows Service

4. **RESUMEN_INTEGRACION_SYSME.md** (este)
   - Referencia rápida
   - Checklist de tareas
   - Estimaciones

---

## 🔐 SEGURIDAD

### Consideraciones

```
✅ Bridge usa SERVICE_ROLE_KEY (no expone a público)
✅ Frontend usa ANON_KEY (lectura + escritura controlada)
✅ Supabase RLS protege datos por usuario
⚠️ Sysme DB debe estar protegida (IP whitelist)
⚠️ Bridge debe correr en máquina local con Sysme
```

---

## 🎯 PRÓXIMOS PASOS INMEDIATOS

### Esta Semana
1. **Contactar Sysme** con la lista de preguntas
2. **Leer AUDITORIA_STOCK_Y_MAPEO.md** completamente
3. **Obtener datos técnicos** de conexión a Sysme
4. **Crear proyecto Supabase** (si no existe)

### Semana Siguiente
1. **Iniciar desarrollo del Bridge**
2. **Setup Node.js + repositorio**
3. **Crear connectors a Sysme**
4. **Testing de conexión**

---

## 📈 MÉTRICAS DE ÉXITO

```
✅ Stock sincronizado cada 5 minutos
✅ 99% de productos correctamente mapeados
✅ 0 downtime del servicio
✅ Latencia < 10 segundos
✅ Errores logeados y rastreables
✅ Recovery automático de fallos
```

---

**Auditoría completada. Listo para integración.**

Próximo paso: Obtener especificación de Sysme para proceder.

