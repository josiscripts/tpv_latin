# C7.6 - DIAGNÓSTICO: Integración Documentos → Proveedores → Compras

**Fecha**: 2026-10-11  
**Estado**: INVESTIGACIÓN COMPLETADA + PARCIALMENTE REPARADA  
**Próximo Paso**: Implementación de flujo de aprobación y creación de compra

---

## RESUMEN EJECUTIVO

**Problema Reportado**: El documento Kiwi Europa fue procesado correctamente, pero:
- No aparece en Proveedores
- No aparece en Compras  
- UI muestra "Documento ya procesado. Proveedor: null"

**Causa Raíz Identificada**: JSON.stringify() en Edge Function guardaba `raw_response` como JSONB string, no como objeto. Impidió deserialización de campos individuales.

**Reparación Implementada**: ✅ Quitado JSON.stringify() en Edge Function (commit 28fa94c)

**Estado Actual**: Extracción guardada correctamente con todos los datos. Pantalla de revisión existe pero sin funcionalidad de aprobación/integración.

**Trabajo Pendiente**: Implementar flujo de aprobación humana y creación de compra (FASES D-H)

---

## FASES COMPLETADAS

### ✅ FASE A: Verificación de Extracción Real

**Documento**: 05_Factura_Kiwi_Europa_SL.pdf  
**ID**: f197cc1d-a66a-4123-a6f2-fc6fb1f6a62c  
**Estado**: uploaded (no procesado)

**Datos Verificados**:
- Proveedor: KIWI EUROPA SL
- NIF: B56988645
- Dirección: CALLE INDUSTRIAS, 7 - BJ, 28923, Madrid, ALCORCON
- Base imponible: 36,99 €
- IVA: 6,20 €
- Total: 43,19 €
- Líneas: 9 items extraídos correctamente
- Moneda: EUR

**Conclusión**: ✅ Datos de extracción COMPLETOS y CORRECTOS

---

### ✅ FASE B: Localización Causa de "Proveedor: null"

**Problema**: Tabla `document_extractions` tenía campos `vendor_name`, `vendor_tax_id`, etc. VACÍOS, aunque `raw_response` contenía todo.

**Causa Raíz**: 
1. Edge Function hacía `JSON.stringify()` del objeto de extracción
2. RPC `persist_extraction_with_ownership` solo guardaba `raw_response` sin deserializar
3. `raw_response` se guardaba como JSONB string (tipo 'string'), no como objeto
4. RPC no tenía lógica para mapear campos del JSON a columnas individuales

**Reparación**:
1. **Edge Function** (index.ts líneas 726-751):
   - Quitado: `p_extraction_data: JSON.stringify({...})`
   - Nuevo: `p_extraction_data: {...}` (objeto nativo)

2. **RPC `persist_extraction_with_ownership`**:
   - Actualizado para extraer campos de `p_extraction_data` JSON
   - Mapea a columnas: vendor_name, tax_id, subtotal, total, lines_extracted, etc.

3. **Extracción Existente**:
   - Actualizada manualmente parseando string JSONB a objeto
   - Ahora todos los campos están poblados correctamente

**Conclusión**: ✅ Causa identificada y reparada

---

## FASES EN PROGRESO

### ⏳ FASE C: Revisión Humana

**Estado**: PANTALLA EXISTE, FUNCIONALIDAD INCOMPLETA

**Archivos Identificados**:
- [extraction-detail-screen.tsx](src/components/extraction-detail-screen.tsx) - Pantalla de detalles de extracción

**Funcionalidad Existente**: ✅
- Muestra proveedor extraído (nombre, NIF, dirección)
- Muestra factura (número, fecha, vencimiento)
- Muestra totales (base, IVA, total)
- Muestra 9 líneas con descripciones, cantidades, precios
- Muestra confianza de extracción por categoría
- Muestra advertencias/warnings de IA
- Botón para descargar PDF original
- Botón para volver a documentos

**Funcionalidad Faltante**: ❌
- Botones de aprobación/rechazo
- Capacidad de editar campos
- Botón "Crear Compra" está disabled con texto "Funcionalidad próxima: crear compra"
- Sin estado de aprobación visible

**Necesario para Continuar**:
1. Implementar estado de aprobación en tabla `document_extractions` (nueva columna: `approval_status`)
2. Implementar botones de "Aprobar", "Rechazar", "Pendiente"
3. Implementar formulario de edición de extracción
4. Conectar botón "Crear Compra" a FASE D

---

### ⏳ FASE D: Integración Documentos → Proveedores

**Código Identificado**: [document-supplier-integration.service.ts](src/services/document-supplier-integration.service.ts)

**Funcionalidad Existente**: ✅
```typescript
// 1. Vinculación de documento a proveedor
linkDocumentToSupplier(extractionId, vendorName, vendorTaxId)
  - Busca por NIF (Priority 1)
  - Busca por similitud de nombre (Priority 2)
  - Crea nuevo proveedor si es necesario (Priority 3)
  - Detecta conflictos potenciales

// 2. Obtención de datos de proveedor desde extracción
getSupplierFromExtraction(extractionId)
  - Extrae vendor_name, vendor_tax_id, vendor_address, etc.

// 3. Búsqueda de compras existentes
findMatchingPurchases(supplierId, invoiceNumber, invoiceDate)
```

**Uso Actual**: NO SE EJECUTA
- Servicios existen pero pantalla no los llama
- Botón "Crear Compra" está disabled
- No hay flujo que vincule extracción → proveedor automáticamente

**Necesario para Continuar**:
1. Conectar UI a estos servicios
2. Implementar flujo: después de aprobación, vincula a proveedor
3. Mostrar resultado de vinculación (nuevo/existente/conflicto)

---

### ⏳ FASE E: Integración Documentos → Compras

**Código Relacionado**:
- [documents-workflow.service.ts](src/services/documents-workflow.service.ts)
- [purchases.service.ts](src/services/purchases.service.ts)

**Lógica Requerida**:
1. Después de vincular proveedor
2. Crear registro de compra con:
   - supplier_id (del paso anterior)
   - invoice_number (del documento)
   - purchase_date (del documento)
   - subtotal, tax, total (del documento)
   - status: 'draft' (pendiente de recepción)
3. Crear líneas de compra:
   - Para cada línea del documento
   - supplier_code, description, quantity, unit_price, etc.
4. Evitar duplicados (idempotencia)

**Estado**: Parcialmente implementado, NO INTEGRADO en flujo

---

## FASES PENDIENTES

### ❌ FASE F: Reparación del Flujo Completo

**Componentes a Conectar**:
1. Pantalla de extracción → Servicio de integración
2. Botón "Crear Compra" → Validación + Ejecución
3. Flujo de error/éxito
4. Actualización de estado en BD

**Defectos Conocidos**:
- Botón deshabilitado
- Sin flujo de aprobación
- Sin manejo de conflictos
- Sin feedback al usuario

---

### ❌ FASE G: Pruebas Automatizadas

**Tests Requeridos**: (del documento C7.6)
1. Extracción guardada ✅
2. Documento procesado pendiente de aprobación ❌
3. Visualización de datos ✅
4. Edición de extracción ❌
5. Guardado de correcciones ❌
6. Aprobación explícita ❌
7. Rechazo ❌
8. Búsqueda de proveedor por NIF ✅ (código existe)
9. Coincidencia por nombre ✅ (código existe)
10. Conflicto de proveedores ❌
11. Creación de proveedor tras aprobación ❌
12. Creación de compra tras aprobación ❌
13. Persistencia de líneas ❌
14. Idempotencia ❌
15. Doble clic en aprobar ❌
16-20. Más tests de edge cases ❌

---

### ❌ FASE H: Validación del Documento Kiwi Europa

**Paso Anterior a Validación Final**:
Implementar FASES D-G

**Verificaciones Requeridas**:
1. Usuario ve documento con datos extraídos
2. Usuario ve las 9 líneas
3. Usuario puede revisar cada campo
4. Usuario puede editar si es necesario
5. Usuario puede aprobar
6. Sistema crea proveedor automáticamente
7. Sistema crea compra automáticamente
8. Compra aparece en pantalla de Compras
9. Proveedor aparece en pantalla de Proveedores
10. NO hay datos comerciales antes de aprobación

---

## ESTADO DE REPARACIONES

### ✅ Reparadas
- [x] JSON.stringify() en Edge Function (quitado)
- [x] RPC `persist_extraction_with_ownership` (actualizado para mapear campos)
- [x] Extracción existente (campos populados manualmente)
- [x] Pantalla de revisión existe (pero sin funcionalidad)

### ⏳ En Progreso
- [ ] Conectar pantalla a servicios de integración
- [ ] Implementar estado de aprobación
- [ ] Implementar flujo de creación de compra

### ❌ Pendientes
- [ ] UI de edición de extracción
- [ ] UI de aprobación/rechazo
- [ ] Manejo de conflictos de proveedores
- [ ] Tests automatizados
- [ ] Validación E2E con documento Kiwi

---

## GIT STATUS

**Commits Realizados**:
- `28fa94c` - fix(c7.6): remove JSON.stringify to preserve JSONB object type

**Cambios No Committeados**:
- Reparación manual en base de datos (no replicable sin SQL)
- Actualización de extracción existente

**Rama**: lab  
**Destino Remoto**: verificar con `git remote -v`

---

## PRÓXIMOS PASOS DETALLADOS

### Inmediato (FASE D-E):
1. Implementar estado de aprobación en UI
2. Conectar "Crear Compra" a servicio de integración
3. Ejecutar linkDocumentToSupplier()
4. Crear registro de compra
5. Crear líneas de compra

### Corto Plazo (FASE G):
1. Escribir tests unitarios
2. Escribir tests de integración
3. Validar E2E con documento Kiwi

### Medio Plazo:
1. Implementar UI de edición
2. Implementar manejo de conflictos
3. Agregar búsqueda global de proveedores

---

## CONCLUSIÓN

**C7.6 Fase de Investigación**: ✅ COMPLETADA

La causa raíz fue encontrada y parcialmente reparada. El documento Kiwi Europa ahora tiene sus datos correctamente guardados en la base de datos. Falta conectar la UI con los servicios de integración para completar el flujo.

**Recomendación**: Continuar en próximo prompt con FASE D (Integración Docs → Proveedores) y FASE E (Integración Docs → Compras).
