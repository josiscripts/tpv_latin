# Plan de implementación — TPV PRO

## Objetivo
Construir el frontend completo de un TPV de escritorio para una tienda de alimentación latina y española. Será totalmente navegable y demostrable con datos locales, sin backend, autenticación ni base de datos, y quedará organizado para una futura integración con Electron y SQLite.

## Experiencia y diseño
- Crear un sistema visual premium inspirado en Square POS, Shopify POS, Lightspeed, Apple, Notion y Stripe Dashboard.
- Optimizar la densidad, jerarquía y tamaño de controles para 1366×768, 1600×900 y 1920×1080.
- Implementar temas claro y oscuro completos mediante tokens semánticos; verde esmeralda para acciones, naranja para alertas y rojo para errores.
- Usar tipografía limpia, bordes discretos, radios contenidos, sombras suaves y transiciones de 150 ms.
- Mantener una estructura fija de escritorio: barra lateral colapsable de 280 px, barra superior y área central con scroll independiente.
- Añadir logo provisional, nombre provisional del negocio y fotografías locales coherentes de los productos de ejemplo.

## Estructura global
- Barra lateral con: Panel, TPV Venta, Productos, Categorías, Stock, Proveedores, Compras, Ventas, Reportes y Configuración.
- Barra superior con búsqueda global, selector Español/English/Català, tema, notificaciones y perfil del administrador.
- Navegación real entre pantallas, estado activo visible y transiciones sutiles.
- Diccionario centralizado para que todo el texto visible cambie de idioma.
- Datos de demostración centralizados y tipados para productos, ventas, proveedores, inventario y gráficos.

## Pantallas

### Panel
- Cuatro indicadores: ventas, beneficio, productos en stock y stock crítico.
- Gráfico de línea de siete días y gráfico donut por categoría.
- Tablas de productos más vendidos y productos con poco stock.

### TPV Venta
- Buscador principal preparado visualmente para texto o código de barras.
- Carrito editable con imagen, categoría, precio, cantidad, subtotal y eliminación.
- Resumen fijo con subtotal, IVA, descuento y total destacado.
- Acciones de cobro en efectivo/tarjeta y cancelación con confirmaciones visuales simuladas.

### Productos
- Tabla profesional con todas las columnas solicitadas y cálculo visible del beneficio.
- Filtros, búsqueda, paginación visual, selector tabla/grid y menú de acciones por producto.
- Vista grid con imagen, nombre, categoría, precio, stock, código y edición.
- Modal completo para crear o editar un producto, incluyendo carga visual de imagen y validación de interfaz.

### Categorías
- Grid de ocho categorías con icono, color, nombre y cantidad de productos.
- Acciones visuales para crear y editar categorías.

### Stock y movimientos
- Indicadores de stock total, entradas, salidas y valor del inventario.
- Tabla con filtros Todos/Bajo/Crítico/Sin stock.
- Vista de movimientos en timeline con hora, producto, tipo, cantidad, empleado y motivo.

### Proveedores
- Grid con logo, contacto, productos, último pedido y acceso al detalle.
- Vista de detalle con información del proveedor y tabla de productos suministrados.

### Compras
- Registro visual de mercancía mediante tabla editable tipo carrito.
- Resumen lateral y acción simulada para registrar la compra.

### Ventas
- Historial con filtros Hoy/Semana/Mes/Personalizado.
- Tabla de tickets y modal de recibo completo al seleccionar una venta.

### Reportes
- Panel analítico con ventas mensuales, beneficio, categorías rentables, top 10 productos y métodos de pago.
- Gráficos compactos, legibles y consistentes con ambos temas.

### Configuración
- Apariencia: tema y color de acento.
- Idioma: Español, English y Català.
- Negocio: logo, nombre, dirección, teléfono y NIF.
- TPV: lector, impresora y métodos de pago como controles de demostración.

## Interacciones de demostración
- Mantener tema, idioma, vista de productos y filtros durante la sesión en memoria del navegador, sin almacenamiento persistente.
- Hacer funcionales los controles esenciales: navegación, búsqueda, filtros, cantidades del carrito, modales, menús, tabs, formularios y cambios de vista.
- Mostrar avisos discretos para acciones simuladas, dejando claro mediante el comportamiento que no existe persistencia real.

## Implementación técnica
- React 19, TypeScript, Tailwind CSS v4, componentes shadcn/ui, Lucide Icons y Recharts ya disponibles en el proyecto.
- Rutas independientes con TanStack Router y metadatos únicos para cada pantalla.
- Componentes compartidos para estructura, tablas, indicadores, estados, filtros, gráficos, formularios y recibos.
- Tokens visuales y tema en la hoja global; sin colores aislados dentro de las pantallas.
- Accesibilidad básica: contraste, foco visible, etiquetas, tooltips y controles operables por teclado.
- Sin llamadas de red, backend, base de datos, autenticación ni integración Electron/SQLite en esta fase.

## Verificación
- Comprobar navegación e interacciones principales en la vista en ejecución.
- Revisar tema claro/oscuro y los tres idiomas.
- Validar visualmente 1366×768, 1600×900 y 1920×1080, evitando solapamientos y scrolls incorrectos.
- Confirmar que el proyecto compila sin errores y que cada ruta tiene sus metadatos.
