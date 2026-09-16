# ⚡ QUICK REFERENCE — SUBFASE 12.8
**One-page cheat sheet**

---

## 🚨 CRÍTICO AHORA

| Item | Acción | Plazo |
|------|--------|-------|
| **Usuario** | Aprobar 8 decisiones en DECISIONES_PENDIENTES_SUBFASE_12_8.md | 1-2 días |
| **Formato** | Responder DECISIÓN #1-8: ✅ APROBADO o ⚠️ CAMBIO: [qué cambiar] | Hoy |
| **Enviado a** | Equipo técnico | ASAP |

---

## 📋 8 DECISIONES (SÍ/NO/CAMBIO)

| # | Decisión | Recomendación | Tu Aprobación |
|---|----------|-------|--|
| 1 | Stock negativo | Opción D (pending) | [ ] |
| 2 | Origen costo | Sysme → fallback | [ ] |
| 3 | avgiva | Porcentaje (%) | [ ] |
| 4 | Mapeo producto | 1:1 | [ ] |
| 5 | Cancelación | Revertir (stock_movement) | [ ] |
| 6 | Reintento | 7 días exponencial | [ ] |
| 7 | Monitoreo | SÍ, alertas escaladas | [ ] |
| 8 | Config | bridge_config table | [ ] |

---

## 📊 ESQUEMA ACTUAL: STATUS

```
✅ LISTO (NO CAMBIOS):
  • sales (cabecera)
  • sale_lines (líneas + unit_cost_at_time)
  • stock_movements (historial)
  • sysme_product_map (mapeo compuesto)
  • sync_state (cursor)
  • sync_events (idempotencia)
  • bridge_errors (audit trail)

⏳ ESPERA APROBACIÓN (cambios mínimos):
  • sync_events: agregar retry_count, last_retry_at
  • bridge_config: NEW table
  • bridge_alerts: NEW table
  • idx_sales_pending: NEW index
```

---

## 🔄 FLUJO SYNC (5 pasos)

```
1. Sysme MySQL
   ↓ ID_VENTA (secuencial)
   ↓
2. Bridge Windows (C#/.NET)
   ├─ Valida: producto_id mapeado?
   ├─ Verifica: stock suficiente?
   ├─ Crea: sales (cabecera) + sale_lines (líneas)
   ├─ Actualiza: stock, stock_movements
   └─ Si error: bridge_errors (sin PII)
   ↓ HTTPS
   ↓
3. Supabase PostgreSQL
   ├─ sales.sysme_id_venta (UNIQUE)
   ├─ sale_lines con unit_cost_at_time
   ├─ stock_movements (historial)
   └─ sync_events (idempotencia)
   ↓ Real-time Subscriptions
   ↓
4. Panel React
   └─ Datos actualizados automáticamente
```

---

## 🔐 GARANTÍAS

```
✅ Exactly-Once     → event_key + sysme_id_venta UNIQUE
✅ Stock OK         → resulting_stock >= 0 (pending si falta)
✅ Trazable         → sysme_id_venta en cada registro
✅ Auditable        → bridge_errors sin PII
✅ Idempotente      → Reintentos seguros
```

---

## 💾 CAMPOS CRÍTICOS

| Sysme | Latin POS | Mapeo |
|-------|-----------|-------|
| id_venta | sales.sysme_id_venta | UNIQUE |
| id_linea | sale_lines.sysme_id_linea | Directo |
| id_empresa, id_centro, id_tipo_comg, id_complementog | Lookup sysme_product_map | Composite |
| cantidad | sale_lines.quantity | Directo |
| PVPTiquet | sale_lines.unit_sale_price | Directo |
| avgiva | sale_lines.tax_rate | % |
| costounitar | sale_lines.unit_cost_at_time | Si existe |
| total | sale_lines.total_sale | qty × precio - desc |

---

## 📁 DOCUMENTOS

| Documento | Lectura | Para Quién | Acción |
|-----------|---------|-----------|--------|
| CARTA_DE_ENTREGA | 10 min | Todos | Contexto |
| **DECISIONES_PENDIENTES** | 20 min | **Usuario** | **APROBAR** |
| CONTRATO_SINCRONIZACION | 45 min | Bridge dev | Especificación |
| PSEUDOCODIGO_BRIDGE_SERVICE | 60 min | Bridge dev | Template C# |
| AUDITORIA_SUBFASE_12_8 | 30 min | Architect | Validación |
| RESUMEN_SUBFASE_12_8 | 15 min | Todos | Referencia |
| ESPECIFICACION_BRIDGE (actualizado) | 30 min | Todos | Integración |

---

## ⚙️ PRÓXIMAS SUBFASES

```
NOW (2026-09-16)     SUBFASE 12.8 ENTREGADA
    ↓ (1-2 días)
USER APPROVES        Decisiones aprobadas
    ↓
SUBFASE 12.9         Bridge Windows (C#/.NET)
    ↓ (2-3 semanas)
SUBFASE 12.10        Testing & integration
    ↓ (1 semana)
PRODUCCIÓN          Sysme ↔ Supabase sincronizado
```

---

## 🎯 FORMATO RESPUESTA USUARIO

Envía esto al equipo técnico:

```markdown
## DECISIONES SUBFASE 12.8 — APROBACIÓN

**Usuario:** Lymarket  
**Fecha:** [HOY]

### DECISIONES

- [ ] DECISIÓN #1 (Stock negativo): ✅ APROBADO Opción D
- [ ] DECISIÓN #2 (Origen costo): ✅ APROBADO Sysme→fallback
- [ ] DECISIÓN #3 (avgiva): ✅ APROBADO Porcentaje
- [ ] DECISIÓN #4 (Mapeo producto): ✅ APROBADO 1:1
- [ ] DECISIÓN #5 (Cancelación): ✅ APROBADO Revertir
- [ ] DECISIÓN #6 (Reintento): ✅ APROBADO 7 días
- [ ] DECISIÓN #7 (Monitoreo): ✅ APROBADO SÍ alertas
- [ ] DECISIÓN #8 (Config): ✅ APROBADO bridge_config

**Comentarios:** [Si hay dudas o cambios]

**Firma:** [Usuario]
```

---

## ❓ FAQ RÁPIDO

**P: ¿Cuándo comienza el Bridge?**  
A: Después que apruebes decisiones (1-2 días)

**P: ¿Qué necesito hacer ahora?**  
A: Leer DECISIONES_PENDIENTES, aprobar 8 items

**P: ¿Cambios destructivos al schema?**  
A: NO. Cambios mínimos, extensibles.

**P: ¿Cuánto cuesta el Bridge?**  
A: ~40-50 horas dev (SUBFASE 12.9)

**P: ¿Se sincroniza stock histórico?**  
A: SÍ, en SUBFASE 12.10 (carga bulk)

**P: ¿Qué pasa si venta es cancelada en Sysme?**  
A: Bridge crea movimiento 'sale_cancellation', revierte stock

**P: ¿Qué si producto no está mapeado?**  
A: bridge_errors log, venta skipped, manual mapping fix

---

## 🔗 REFERENCIAS DIRECTAS

```
Leer AHORA:        DECISIONES_PENDIENTES_SUBFASE_12_8.md
Técnica:           CONTRATO_SINCRONIZACION_SYSME.md
Arquitectura:      PSEUDOCODIGO_BRIDGE_SERVICE.md
Validación:        AUDITORIA_SUBFASE_12_8.md
Índice:            INDICE_DOCUMENTOS_SUBFASE_12_8.md
Resumen:           RESUMEN_SUBFASE_12_8.md
Entrega:           CARTA_DE_ENTREGA_SUBFASE_12_8.md
```

---

## ✅ CHECKLIST RÁPIDO

**Usuario:**
- [ ] Leído DECISIONES_PENDIENTES
- [ ] Validadas 8 decisiones
- [ ] Aprobadas decisiones (o cambios solicitados)
- [ ] Enviadas aprobaciones a equipo

**Equipo:**
- [ ] Recibidas aprobaciones
- [ ] Actualizada documentación si cambios
- [ ] Iniciada SUBFASE 12.9

---

**Estado:** SUBFASE 12.8 = ✅ COMPLETADA | ⏳ ESPERA APROBACIÓN USUARIO

*Fin de Quick Reference*
