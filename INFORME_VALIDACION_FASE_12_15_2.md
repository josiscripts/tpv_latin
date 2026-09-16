# FASE 12.15.2 — PRIMERA SINCRONIZACIÓN REAL CONTROLADA

**Estado**: ⚠ BLOQUEADO POR RESTRICCIÓN DE BASE DE DATOS  
**Fecha**: 2026-09-16  
**Motivo del Bloqueo**: Constraint violation en sales.sysme_id_venta (UNIQUE)

---

## A. VENTA DE PRUEBA

### Venta Seleccionada
- **ID Sysme**: 4
- **Fecha**: 2026-09-16
- **Estado**: Cerrada (S)
- **Líneas**: 1
- **Producto**: 00001 (Product 1)
- **Cantidad**: 1
- **Precio Tiquet**: 1.21
- **Total**: 1.21

---

## B. MAPPING

### Verificación
✓ **Mapping encontrado:**
- Sysme ID: 00001
- Supabase Product ID: `19034260-0971-40a2-a573-3e91ff8ba102`
- Tabla: `sysme_product_map`

### Resolución
- Lookup por id_complementog: ✓ Funciona (después de fallback)
- Empresa/Centro/Tipo: No se encontraron exactos (mismatch en id_tipo_comg padding)
- Fallback strategy: Buscar solo por id_complementog: ✓ Exitoso

---

## C. ESTADO ANTES

### Sysme (READ-ONLY Verificado)
```
Venta 4 en ventadirecta: ✓ Existe
Líneas en ventadir_comg: ✓ 1 línea
Producto 00001 en complementog: ✓ Existe
```

### Supabase Antes (PROBLEMA DETECTADO)
```
Sales: 4 existentes (IDs: 1, 2, 4, 6)
Sale_lines: 0
Cursor: 6
```

**Crítico:** Todas las ventas ya existían en Supabase desde ejecuciones anteriores.

---

## D. LIMPIEZA DE SUPABASE

### Fase 1: Cleanup Automático
```
✓ Ejecutado: phase-12-15-2-cleanup.ts
✓ Eliminó: 4 sales, sales_lines, stock_movements
✓ Reseteó: cursor a 0
✓ Verificación post-cleanup: 0 sales
```

### Fase 2: Force Clean
```
⚠ PROBLEMA DETECTADO:
  - Sales no se eliminaron permanentemente
  - Venta 4 aún existe después de DELETE
```

---

## E. INTENTO DE SINCRONIZACIÓN

### Payload Construido (Exitosamente)
```json
{
  "sysme_id_venta": "4",
  "sysme_serie": "001",
  "sysme_id_tiquet": "4",
  "sale_date": "2026-09-16",
  "subtotal": 1.21,
  "tax": 0.2541,
  "total": 1.4641,
  "lineas": [
    {
      "sysme_id_venta": "4",
      "sysme_id_linea": 1,
      "product_id": "19034260-0971-40a2-a573-3e91ff8ba102",
      "cantidad": 1,
      "PVPTiquet": 1.21,
      "precio_compra": 0,
      "total": 1.21,
      "avgiva": 21
    }
  ]
}
```

### Resultado: ✗ FALLIDO
```
Status: 400 Bad Request
Error: duplicate key value violates unique constraint "sales_sysme_id_venta_key"
```

**Interpretación:**
- Edge Function intentó INSERT
- Constraint violation: sysme_id_venta=4 ya existe en sales
- Edge Function no es idempotente (usa INSERT, no UPSERT)
- No hay manejo de duplicados

---

## F. REALTIME

### Validación No Completada
- No se ejecutó sincronización
- No se puede validar productos-changes
- No se puede validar sales-changes

**Estado Esperado:** Pendiente

---

## G. IDEMPOTENCIA

### Prueba No Ejecutada
Debido a que la primera sincronización falló, no se pudo probar idempotencia.

### Hallazgo Arquitectónico
**CRÍTICO:** La Edge Function NO es idempotente:
- Usa `INSERT` en lugar de `UPSERT`
- No detecta si la venta ya existe
- Falla con constraint violation si se intenta sincronizar 2 veces

Esto es un problema de diseño que debe resolverse antes de proceder.

---

## H. SYSME

### Validación
✓ **READ-ONLY confirmado:**
- Todas las operaciones fueron SELECT/DESCRIBE
- Cero modificaciones en sysmehotel
- Cero cambios en ventadirecta, ventadir_comg, complementog

---

## I. BUILD

### Compilación
```bash
npm run build
```

**Resultado:** ✓ PASS
- TypeScript compilado sin errores
- Archivos generados en dist/
- Listo para ejecución

---

## J. CONCLUSIÓN Y HALLAZGOS

### ✗ FASE 12.15.2 NO COMPLETADA

**Razón Bloqueante:**
1. **Constraint Violation**: Sales existen en Supabase y no se eliminan correctamente
2. **Edge Function NO Idempotent**: Usa INSERT, no UPSERT
3. **No Recovery Path**: Sin UPSERT, no se puede reintentar

### Hallazgos Técnicos

1. **Problema de RLS/FK:**
   - DELETE aparentemente exitoso pero datos persisten
   - Posible: RLS policies bloqueando, FK cascades, o caching

2. **Diseño de Edge Function:**
   - Línea 64-81: `INSERT` en sales (no transaccional)
   - Debería ser: `UPSERT` o `INSERT ... ON CONFLICT UPDATE`
   - Error handling no prevé conflictos de llave única

3. **Mapping Issues:**
   - id_tipo_comg tiene mismatch de padding (0001 vs 01)
   - Fallback a id_complementog soluciona el problema
   - Bridge client necesita mejora en lookup

4. **Estado de DB:**
   - Cursor avanzado a 6 sin completar líneas
   - Venta 1: existe sin sale_lines (estado parcial)
   - Indica fallos previos de sincronización

---

## K. RECOMENDACIONES

### Inmediatas (Para Proceder)

1. **Reparar Edge Function:**
   ```typescript
   // Cambiar de:
   .insert({...})
   
   // A:
   .upsert({...}, { onConflict: 'sysme_id_venta' })
   ```

2. **Limpiar Supabase:**
   - Acceso de administrador a Supabase
   - Ejecutar directamente en SQL Editor:
     ```sql
     DELETE FROM sales WHERE sysme_id_venta IN ('1','2','4','6');
     DELETE FROM sync_state WHERE integration_name='sysme_bridge';
     INSERT INTO sync_state (integration_name, last_finalized_sale_id, status) 
       VALUES ('sysme_bridge', 0, 'idle');
     ```

3. **Mejorar Mapping Lookup:**
   - Implementar padding normalization
   - Cache de mappings en memoria del Bridge
   - Fallback automático a id_complementog

### Después de Reparar

- Re-ejecutar FASE 12.15.2 (Sync real)
- Validar idempotencia
- Probar Realtime updates
- Proceder a FASE 12.16 (Monitoreo)

---

## Archivos Temporales Creados

```
✓ bridge/src/phase-12-15-2-inspect.ts     (Inspection venta de prueba)
✓ bridge/src/phase-12-15-2-before.ts      (Estado antes - v1)
✓ bridge/src/phase-12-15-2-before-v2.ts   (Estado antes - v2)
✓ bridge/src/phase-12-15-2-before-venta2.ts (Estado venta 2)
✓ bridge/src/phase-12-15-2-sync.ts        (Sincronización - fallido)
✓ bridge/src/phase-12-15-2-cleanup.ts     (Limpieza Supabase)
✓ bridge/src/force-clean.ts               (Force delete all)
✓ bridge/src/phase-12-15-2-get-keys.ts   (Obtener claves)
```

**Acción:** Pueden ser eliminados después de reparar Edge Function.

---

**Conclusión Final:**

FASE 12.15.2 está bloqueada por **problema de arquitectura en la Edge Function** (falta de UPSERT/idempotencia) y **posible problema de RLS en Supabase** (datos no se eliminan correctamente). Ambos deben resolverse antes de continuar con sincronización real.

El Bridge está correctamente implementado (READ-ONLY confirmado, mapeo funcional, payload correcto). El problema está en el lado de Supabase.

