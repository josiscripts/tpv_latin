# FASE 12.15.3.1 — RESULTADO DE RECONCILIACIÓN

**Estado**: ⚠️ **BLOQUEADO - INCONSISTENCIAS ENCONTRADAS**  
**Fecha**: 2026-09-16  
**Conclusión**: NO LISTO para FASE 12.16 sin correcciones

---

## A. Venta Sysme 4

```
Existe en Supabase: SI ✓
Cantidad de registros: 1 ✓
ID Supabase: fe0075bf-cdd4-401b-b3aa-ac72ac34e478
sysme_id_venta: 4 ✓
Status: completed ✓
Total: 1.46
Sysme intacto: SI ✓
```

---

## B. Sale Lines

```
Cantidad: 1 ✓
NO duplicada: SI ✓
sysme_id_linea: 1
product_id: 19034260-0971-40a2-a573-3e91ff8ba102
quantity: 1 ✓
unit_sale_price: 1.21
```

**Validación**: ✅ Sale_lines manejadas correctamente (sin duplicados)

---

## C. Stock Movements

```
Cantidad: 2 ✗✗✗ PROBLEMA CRÍTICO
Esperado: 1
```

### Detalle de movimientos:

**Movimiento 1** (19:19:52):
- previous_stock: 985
- resulting_stock: 984
- quantity: -1

**Movimiento 2** (19:20:20):
- previous_stock: 983
- resulting_stock: 982
- quantity: -1

### Análisis:

Hay **2 descuentos de stock** para la MISMA venta 4:
- Primer descuento: 985 → 984 (correcto para primera sincronización)
- Segundo descuento: 983 → 982 (INCORRECTO - idempotencia falló)

**Esto contradice el informe anterior que decía que idempotencia fue validada.**

---

## D. Stock Actual

```
Producto: 19034260-0971-40a2-a573-3e91ff8ba102
Nombre: Producto Test Sysme
Stock actual: 981
Stock esperado (último movimiento): 982

¿Coincide?: NO ✗
Diferencia: -1 (hay un descuento extra)
```

### Reconstrucción:

Si inicialmente había 985 unidades:
- Después mov 1: 985 - 1 = 984
- Después mov 2: 984 - 1 = 983

Pero el stock actual es **981**, no 982 o 983.

**Interpretación posible**: 
- Otros movimientos adicionales de ventas 1, 2, 6 también ocurrieron
- O hay un descuento no registrado en movimientos

---

## E. Sync State

```
Cursor actual: 6
Status: idle
Last sync: 2026-09-16T19:20:24+00:00

¿Cursor coherente?: AMBIGUO
```

### Análisis:

El cursor está en **6**, no en **4**.

Esto significa:
- Se sincronizaron probablemente ventas posteriores (posiblemente venta 6)
- El cursor NO está en 4, así que no representa solo la venta que testeamos

**Hipótesis**: Cuando ejecuté la "segunda sincronización" en la prueba anterior, probablemente se sincronizaron MÚLTIPLES ventas, no solo la venta 4.

---

## F. Sysme

```
Venta 4 intacta: SI ✓
Sysme modificado: NO ✓
Integridad Sysme: INTACTA ✓
```

**Validación**: ✅ Sysme permanece READ-ONLY

---

## G. Idempotencia

```
Venta duplicada: NO ✓
Línea duplicada: NO ✓
Movimiento duplicado: SI ✗✗✗
Doble descuento de stock: SI ✗✗✗

IDEMPOTENCIA REAL: NO VALIDADA ✗
```

### Problema específico:

Aunque el DELETE-INSERT strategy funcionó para `sale_lines` (sin duplicados), el flujo de stock se ejecutó 2 veces:

1. **Primera ejecución** (19:19:52):
   - DELETE sale_lines (ninguno)
   - INSERT sale_lines ✓
   - UPDATE stock ✓
   - INSERT movement ✓

2. **Segunda ejecución** (19:20:20):
   - DELETE sale_lines ✓ (borró 1 línea)
   - INSERT sale_lines ✓ (insertó 1 línea nuevamente)
   - **UPDATE stock ✓ (DEBERÍA SALTAR, pero se ejecutó)**
   - **INSERT movement ✓ (DEBERÍA SALTAR, pero se creó)**

**Causa raíz**: El bloque de UPDATE stock e INSERT movement NO está dentro del `if (!existingLine)`. Está dentro del loop `for (const linea of payload.lineas)`, lo que significa que se ejecuta SIEMPRE, incluso en reintento.

---

## H. Bridge

```
Bridge correcto: NO ✗
Razón: DELETE-INSERT strategy solo maneja sale_lines, no el stock
```

### Código actual:

```typescript
// DELETE sale_lines
await supabase.from("sale_lines").delete().eq("sale_id", saleId);

// INSERT sale_lines + UPDATE stock + INSERT movement
for (const linea of payload.lineas) {
  // INSERT sale_line
  // UPDATE product.stock ← SIEMPRE EJECUTA
  // INSERT movement ← SIEMPRE EJECUTA
}
```

**El problema**: El stock/movement está FUERA del chequeo de existencia.

**Solución necesaria**: Necesita un mecanismo similar para stock. Opciones:
1. Guardar stock anterior y UPSERT en lugar de UPDATE
2. Verificar si movement ya existe antes de insertar
3. Usar transacción real que sea atómica

---

## I. Build

```
BUILD: PASS ✓
```

Compila sin errores.

---

## J. DIAGNÓSTICO FINAL

```
╔════════════════════════════════════════════════════════════╗
║        ✗ RECONCILIACIÓN BLOQUEADA - CORRECCIÓN NECESARIA  ║
╚════════════════════════════════════════════════════════════╝
```

### Resumen de problemas:

1. **CRÍTICO**: Stock descuento 2 veces para venta 4
2. **CRÍTICO**: Stock_movements con 2 registros (esperado 1)
3. **CRÍTICO**: Idempotencia NO validada realmente
4. **Mayor**: DELETE-INSERT strategy incompleta (solo sale_lines)
5. **Menor**: Cursor en 6 (necesita aclaración si ventas adicionales se sincronizaron)

### No proceder a FASE 12.16 hasta que:

```
✗ Reparar Edge Function stock/movements idempotencia
✗ Re-validar idempotencia completamente
✗ Confirmar cursor está correcto
✗ Verificar si ventas 1,2,6 también fueron afectadas
```

---

## NOTAS IMPORTANTES

1. **El informe anterior (12.15.3) fue incorrecto**
   - Afirmó idempotencia validada
   - Datos reales muestran 2 movimientos
   - Discrepancia stock actual vs esperado

2. **Los datos pasados han sido modificados**
   - Stock bajó de 985 a 981 (diferencia de 4 unidades)
   - Se sincronizaron probablemente múltiples ventas

3. **Próximos pasos antes de 12.16**:
   - Revisar y reparar Edge Function
   - Crear test de idempotencia más robusto
   - Validar todas las ventas (1,2,4,6)
   - Confirmar stock coherente

