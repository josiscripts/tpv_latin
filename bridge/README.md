# Sysme Bridge

Bridge Windows que sincroniza ventas de Sysme TPV local hacia Supabase.

## Setup

### 1. Configuración

Crear archivo `.env.bridge` en la carpeta `bridge/`:

```bash
cp .env.example .env.bridge
```

Editar `.env.bridge` y proporcionar:

```env
SYSME_PASSWORD=<obtener de C:\SYSME\SGC\sysmetpv.ini>
SUPABASE_SERVICE_KEY=<obtener de supabase status --local>
```

### 2. Verificar Sysme corriendo

```bash
"C:\SYSME\sysmeserver\bin\mysql.exe" -h 127.0.0.1 -P 4306 -u root -p -e "SELECT 1;"
```

### 3. Verificar Supabase corriendo

```bash
cd ..
supabase status
```

### 4. Compilar Bridge

```bash
cd bridge
npm run build
```

### 5. Ejecutar Bridge

```bash
npm start
```

Debería ver:

```
[BRIDGE] ============================================
[BRIDGE] Sysme → Bridge → Supabase Synchronizer
[BRIDGE] ============================================
[BRIDGE] Initializing connections...
[BRIDGE] ✓ Sysme MySQL connection successful
[BRIDGE] ✓ Supabase connection successful
[BRIDGE] ✓ All connections healthy

[BRIDGE] ═══ Sync cycle #1 at ... ═══
[BRIDGE] Starting sync with cursor: null
...
```

## Prueba Rápida

### 1. Crear producto de prueba en Supabase

```sql
-- En Supabase studio
INSERT INTO products (sku, name, sale_price, cost_price, category_id)
VALUES ('TEST001', 'Producto Test', 100.00, 50.00, <category_id>);
```

### 2. Mapear producto Sysme

```sql
-- Obtener product_id del paso anterior
INSERT INTO sysme_product_map (product_id, id_empresa, id_centro, id_tipo_comg, id_complementog, active)
VALUES ('<product_id>', 'LYMARKET', 'LOCAL-01', '01', '00001', true);
```

### 3. Crear venta en Sysme

```bash
"C:\SYSME\sysmeserver\bin\mysql.exe" -h 127.0.0.1 -P 4306 -u root -p sysmehotel
```

Insertar venta:

```sql
INSERT INTO ventadirecta (id_venta, cerrada, id_empresa, id_centro, id_cliente, id_vendedor, fecha_hora)
VALUES (9999, 'S', 'LYMARKET', 'LOCAL-01', 1, 1, NOW());

INSERT INTO ventadir_comg (id_venta, id_linea, id_tipo_comg, id_complementog, cantidad, precio, PVPTiquet, total, avgiva)
VALUES (9999, '001', '01', '00001', 2, 100, 100, 200, 21);
```

### 4. Ejecutar Bridge y observar sync

El Bridge debe detectar y sincronizar la venta.

Verificar en Supabase:

- `sales`: debe existir con `sysme_id_venta='9999'`
- `sale_lines`: debe existir la línea
- `stock_movements`: debe registrar `-2`
- `products.stock`: debe decrementar en 2
- `sync_state`: `last_finalized_sale_id` debe ser `'9999'`

## Logs Importantes

- `[SYSME]` - Operaciones MySQL
- `[SUPABASE]` - Operaciones Supabase
- `[SYNC]` - Procesamiento de sincronización
- `[BRIDGE]` - Control general

## Detener Bridge

```
Ctrl+C
```

## Troubleshooting

### "Cannot connect to Sysme MySQL"

- Verificar que Sysme está corriendo
- Verificar credenciales en `.env.bridge`
- Probar: `mysql -h 127.0.0.1 -P 4306 -u root -p`

### "Cannot connect to Supabase"

- Ejecutar `supabase status` en la carpeta padre
- Verificar `SUPABASE_SERVICE_KEY` es correcta
- Verificar `SUPABASE_URL` es correcta

### "Product not mapped"

- El producto Sysme no tiene mapeo en `sysme_product_map`
- Crear el mapeo siguiendo la sección "Prueba Rápida"

## Próximas mejoras (SUBFASE 12.10+)

- [ ] Edge Function transaccional para atomicidad
- [ ] Cancelaciones de ventas
- [ ] Devoluciones
- [ ] Compras desde Sysme
- [ ] Proveedores desde Sysme
- [ ] Instalación como Windows Service
- [ ] UI de configuración
- [ ] Sistema de alertas
