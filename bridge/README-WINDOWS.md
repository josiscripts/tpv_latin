# Bridge Sysme → Supabase — Guía de instalación en Windows

## Requisitos

- **Node.js 18+** (descargar desde https://nodejs.org)
- **npm** (incluido con Node.js)
- **Sysme TPV** corriendo en la misma máquina en `localhost:4306`
- **Acceso a internet** para conectar a Supabase

## Instalación

### 1. Preparar el código

```bash
cd bridge
npm install
```

### 2. Crear archivo de configuración

Crear archivo `.env.bridge` en la carpeta `bridge/` con las siguientes variables:

```env
# Sysme MySQL (READ-ONLY)
SYSME_HOST=127.0.0.1
SYSME_PORT=4306
SYSME_DATABASE=sysmehotel
SYSME_USER=root
SYSME_PASSWORD=<contraseña real de Sysme>

# Supabase
SUPABASE_URL=https://nqqdflyuzfvsctajvxgn.supabase.co
SUPABASE_SERVICE_KEY=<clave de servicio Supabase>

# Intervalo de sincronización (en milisegundos)
SYNC_INTERVAL_MS=30000
```

**IMPORTANTE**: 
- NO compartir el archivo `.env.bridge` por Git ni email
- NO poner credenciales reales en repositorio
- Proteger este archivo en el PC de la tienda

### 3. Compilar

```bash
npm run build
```

Esto genera archivos compilados en la carpeta `dist/`.

### 4. Ejecutar

```bash
npm start
```

El Bridge iniciará y mostrará:

```
╔════════════════════════════════════════════════════════════╗
║        BRIDGE CONTINUO AUTOMÁTICO                           ║
╚════════════════════════════════════════════════════════════╝

[BRIDGE] ✓ Sysme MySQL: OK
[BRIDGE] ✓ Supabase: OK
[BRIDGE] Intervalo: 30000ms
[BRIDGE] Sysme: 127.0.0.1:4306/sysmehotel

[BRIDGE] ✓ Iniciando loop continuo...

[HH:MM:SS] Ciclo: X ventas, Y productos (cursor: N → N) [Zms]
[HH:MM:SS] Ciclo: 0 ventas, 2 productos (cursor: 6 → 6) [500ms]
```

## ¿Cómo sé que está sincronizando?

### En cada ciclo verás:

1. **Con cambios**: `[HH:MM:SS] Ciclo: 2 ventas, 2 productos (cursor: 6 → 8)`
   - Indica que se procesaron 2 ventas nuevas
   - El cursor avanzó de 6 a 8

2. **Sin cambios**: `[HH:MM:SS] Sin cambios (cursor: 8)`
   - El Bridge está activo pero no hay nuevas ventas
   - Está sincronizando productos automáticamente

3. **Errores**: `[HH:MM:SS] ✗ Errores: - Productos: ...`
   - Algo falló, verifica la configuración

### Prueba manual

Para forzar una sincronización manual de productos:

```bash
node dist/phase-12-17-product-sync.js
```

## Detener el Bridge

Presionar **Ctrl+C** en la terminal.

El Bridge mostrará:

```
[BRIDGE] Cerrando...
[BRIDGE] Pool MySQL cerrado

[BRIDGE] Resumen de sesión:
  Ciclos: 5
  Ventas sincronizadas: 2
  Productos sincronizados: 10
  Errores: 0

[BRIDGE] ✓ Cerrado
```

## Flujo de sincronización

```
Sysme TPV (localhost:4306)
    ↓ (READ-ONLY)
Bridge (Node.js)
    ↓ (HTTPS)
Supabase Edge Function
    ↓
Supabase PostgreSQL
    ↓ (Realtime)
Latin POS (TPV PRO)
```

## Qué sincroniza el Bridge

### Ventas cerradas
- Detecta automáticamente nuevas ventas cerradas en Sysme
- Las procesa mediante Edge Function transaccional
- Mantiene idempotencia (no duplica)
- Actualiza stock una sola vez por venta

### Productos
- Lee datos reales: nombre, precio, coste, stock
- Sincroniza con Supabase en cada ciclo
- NO crea movimientos falsos
- Stock viene de `almacen_complementg.cantidad`

## Qué NO modifica el Bridge

✅ **100% READ-ONLY en Sysme**
- Nunca INSERT
- Nunca UPDATE
- Nunca DELETE
- Nunca ALTER
- Solo SELECT

Los datos de Sysme permanecen intactos.

## Troubleshooting

### Error: "Cannot connect to Sysme"
- Verificar que Sysme TPV está corriendo
- Verificar `SYSME_HOST`, `SYSME_PORT`, `SYSME_PASSWORD` en `.env.bridge`
- Verificar que el usuario MySQL tiene permisos de lectura

### Error: "Cannot connect to Supabase"
- Verificar `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`
- Verificar conexión a internet

### El Bridge se detiene inesperadamente
- Ver logs en terminal
- Reiniciar con `npm start`
- El cursor se mantiene automáticamente, no hay pérdida de datos

### Sincronización lenta
- Aumentar `SYNC_INTERVAL_MS` en `.env.bridge`
- Valor por defecto: 30000ms (30 segundos)
- Valores permitidos: 5000-300000 (5 segundo a 5 minutos)

## Logs y monitoreo

El Bridge imprime un log en cada ciclo. Puedes redirigir a archivo:

```bash
npm start > bridge.log 2>&1
```

Luego monitorizador con:

```bash
tail -f bridge.log
```

## Próximos pasos

Una vez funcionando en el PC de la tienda:
- Instalación como Windows Service (opcional)
- Monitoreo automático
- Alertas de error
