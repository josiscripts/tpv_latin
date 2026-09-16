# PSEUDOCÓDIGO — BRIDGE SERVICE
**Referencia para implementación Windows Bridge**

**Estado:** Pseudocódigo arquitectónico (NO código real)  
**Lenguaje esperado:** C# .NET Framework  
**Datos:** Basado en CONTRATO_SINCRONIZACION_SYSME.md

---

## 1. ESTRUCTURA DE CARPETAS (C# Propuesto)

```
BridgeSysme/
├── Core/
│   ├── Models/
│   │   ├── SysmeVenta.cs
│   │   ├── SysmeLinea.cs
│   │   ├── SyncPayload.cs
│   │   └── BridgeConfig.cs
│   ├── Services/
│   │   ├── ISysmeReader.cs
│   │   ├── ISupabaseWriter.cs
│   │   ├── ISyncOrchestrator.cs
│   │   └── IIdempotencyManager.cs
│   └── Exceptions/
│       ├── ProductNotMappedException.cs
│       ├── InsufficientStockException.cs
│       └── SyncException.cs
├── Infrastructure/
│   ├── SysmeRepository.cs (MySQL reader)
│   ├── SupabaseRepository.cs (PostgreSQL writer)
│   └── ConfigManager.cs
├── Worker/
│   ├── SyncWorker.cs (polling loop)
│   └── RetryManager.cs
├── Monitoring/
│   ├── AlertService.cs
│   └── Logger.cs
└── Program.cs (entry point)
```

---

## 2. MODELS

### 2.1 SysmeVenta.cs
```csharp
public class SysmeVenta
{
  public string IdVenta { get; set; }        // '1043291'
  public string SerieTicket { get; set; }    // 'ALZ'
  public string NumTicket { get; set; }      // '001234'
  public DateTime Timestamp { get; set; }    // '2026-09-16T14:30:45Z'
  public string MetodoPago { get; set; }     // 'EFECTIVO' | 'TARJETA'
  
  public decimal Subtotal { get; set; }
  public decimal TotalImpuesto { get; set; }
  public decimal TotalPagar { get; set; }
  
  public bool Cancelada { get; set; }
  public DateTime? TimestampCancelacion { get; set; }
  
  public List<SysmeLinea> Lineas { get; set; }
}

public class SysmeLinea
{
  public string IdLinea { get; set; }
  public string IdEmpresa { get; set; }
  public string IdCentro { get; set; }
  public string IdTipoComg { get; set; }
  public string IdComplementog { get; set; }
  
  public string Descripcion { get; set; }
  public decimal Cantidad { get; set; }
  public decimal PrecioUnitario { get; set; }
  public decimal DescuentoLinea { get; set; }
  public decimal AvgIVA { get; set; }        // Porcentaje
  public decimal TotalLinea { get; set; }
  
  public decimal? CostoUnitario { get; set; }
}
```

### 2.2 SyncPayload.cs
```csharp
public class SyncPayload
{
  public string EventKey { get; set; }
  public string SysmeIdVenta { get; set; }
  public string EventType { get; set; }      // 'sale_created'
  public DateTime OccurredAt { get; set; }
  
  public SysmeVenta Data { get; set; }
  public string ErrorMessage { get; set; }   // Si falló
}
```

### 2.3 BridgeConfig.cs
```csharp
public class BridgeConfig
{
  public int PollingIntervalMs { get; set; } = 300000;    // 5 min
  public int BatchSize { get; set; } = 1000;
  public int BatchTimeoutMs { get; set; } = 30000;        // 30 seg
  public int MaxRetries { get; set; } = 5;
  public int RetryBackoffSeconds { get; set; } = 2;
  public bool AlertOnError { get; set; } = true;
}
```

---

## 3. CORE SERVICES

### 3.1 ISysmeReader.cs (MySQL Interface)
```csharp
public interface ISysmeReader
{
  /// <summary>
  /// Lee ventas de Sysme MySQL incrementalmente
  /// </summary>
  /// <param name="cursor">Último ID procesado (null si primera vez)</param>
  /// <param name="limit">Máximo de ventas a leer</param>
  Task<List<SysmeVenta>> GetSalesIncrementalAsync(
    string cursor, 
    int limit = 1000
  );
  
  /// <summary>
  /// Lee detalle de una venta específica
  /// </summary>
  Task<SysmeVenta> GetSaleDetailAsync(string idVenta);
  
  /// <summary>
  /// Verifica conexión a Sysme MySQL
  /// </summary>
  Task<bool> HealthCheckAsync();
}
```

### 3.2 ISupabaseWriter.cs (PostgreSQL Interface)
```csharp
public interface ISupabaseWriter
{
  /// <summary>
  /// Crear venta + líneas en transacción ACID
  /// </summary>
  Task<Guid> CreateSaleTransactionAsync(
    SysmeVenta sysmeVenta,
    Dictionary<string, Guid> productIdMap
  );
  
  /// <summary>
  /// Buscar producto mapeado
  /// </summary>
  Task<Guid?> LookupProductAsync(
    string idEmpresa,
    string idCentro,
    string idTipoComg,
    string idComplementog
  );
  
  /// <summary>
  /// Cancelar venta existente
  /// </summary>
  Task CancelSaleAsync(string sysmeIdVenta);
  
  /// <summary>
  /// Actualizar cursor de sincronización
  /// </summary>
  Task UpdateSyncCursorAsync(string lastFinalizedSaleId);
  
  /// <summary>
  /// Registrar error en bridge_errors
  /// </summary>
  Task LogErrorAsync(string errorType, string sysmeIdVenta, string message, object payload);
  
  /// <summary>
  /// Buscar ventas pendientes para reintentar
  /// </summary>
  Task<List<(string SysmeIdVenta, Guid SaleId)>> GetPendingSalesAsync();
}

public interface IIdempotencyManager
{
  /// <summary>
  /// Registrar evento de sincronización
  /// </summary>
  Task<bool> RecordEventAsync(string eventKey, SysmeVenta venta);
  
  /// <summary>
  /// Verificar si evento ya fue procesado
  /// </summary>
  Task<bool> IsEventProcessedAsync(string eventKey);
  
  /// <summary>
  /// Obtener status de un evento
  /// </summary>
  Task<string> GetEventStatusAsync(string eventKey);
}
```

### 3.3 ISyncOrchestrator.cs
```csharp
public interface ISyncOrchestrator
{
  /// <summary>
  /// Orquesta el ciclo completo de sincronización
  /// </summary>
  Task<SyncResult> SyncAsync(CancellationToken ct);
}

public class SyncResult
{
  public bool Success { get; set; }
  public int SalesProcessed { get; set; }
  public int Errors { get; set; }
  public List<string> ErrorMessages { get; set; }
  public string LastProcessedSaleId { get; set; }
  public DateTime Timestamp { get; set; }
}
```

---

## 4. IMPLEMENTACIÓN PRINCIPAL

### 4.1 SyncOrchestrator.cs (Core Logic)

```csharp
public class SyncOrchestrator : ISyncOrchestrator
{
  private readonly ISysmeReader _sysmeReader;
  private readonly ISupabaseWriter _supabaseWriter;
  private readonly IIdempotencyManager _idempotency;
  private readonly BridgeConfig _config;
  private readonly ILogger<SyncOrchestrator> _logger;
  private readonly IAlertService _alertService;

  public async Task<SyncResult> SyncAsync(CancellationToken ct)
  {
    var result = new SyncResult { Timestamp = DateTime.UtcNow };
    
    try
    {
      // 1. Health checks
      if (!await _sysmeReader.HealthCheckAsync())
      {
        _logger.LogError("Sysme MySQL unreachable");
        await _alertService.AlertAsync("CRITICAL: Sysme unreachable");
        return result with { Success = false };
      }

      // 2. Get cursor
      var cursor = await _supabaseWriter.GetLastCursorAsync();
      _logger.LogInformation($"Sync cursor: {cursor ?? "NULL (first time)"}");

      // 3. Fetch incremental batch
      var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
      cts.CancelAfter(_config.BatchTimeoutMs);
      
      var ventas = await _sysmeReader.GetSalesIncrementalAsync(
        cursor,
        _config.BatchSize
      );
      
      if (ventas.Count == 0)
      {
        _logger.LogInformation("No new sales to sync");
        return result with { Success = true };
      }

      // 4. Process each sale
      var lastProcessedSale = cursor;
      var errors = new List<(SysmeVenta, Exception)>();

      foreach (var venta in ventas)
      {
        try
        {
          // 4.1 Idempotency check
          var eventKey = GenerateEventKey(venta);
          if (await _idempotency.IsEventProcessedAsync(eventKey))
          {
            _logger.LogInformation($"Event {eventKey} already processed, skipping");
            result.SalesProcessed++;
            lastProcessedSale = venta.IdVenta;
            continue;
          }

          // 4.2 Record event as pending
          await _idempotency.RecordEventAsync(eventKey, venta);

          // 4.3 Check if cancellation
          if (venta.Cancelada)
          {
            await HandleCancellationAsync(venta);
          }
          else
          {
            // 4.4 Map products
            var productIdMap = new Dictionary<string, Guid>();
            foreach (var linea in venta.Lineas)
            {
              var key = $"{linea.IdEmpresa}|{linea.IdCentro}|{linea.IdTipoComg}|{linea.IdComplementog}";
              var productId = await _supabaseWriter.LookupProductAsync(
                linea.IdEmpresa,
                linea.IdCentro,
                linea.IdTipoComg,
                linea.IdComplementog
              );

              if (productId == null)
              {
                throw new ProductNotMappedException(
                  $"Product {key} not found in sysme_product_map"
                );
              }
              productIdMap[key] = productId.Value;
            }

            // 4.5 Create sale transaction
            await _supabaseWriter.CreateSaleTransactionAsync(venta, productIdMap);
          }

          // 4.6 Update event as processed
          await _idempotency.UpdateEventStatusAsync(eventKey, "processed");

          result.SalesProcessed++;
          lastProcessedSale = venta.IdVenta;
        }
        catch (ProductNotMappedException ex)
        {
          _logger.LogError($"Product not mapped: {ex.Message}");
          await _supabaseWriter.LogErrorAsync(
            "product_not_found",
            venta.IdVenta,
            ex.Message,
            new { venta.IdVenta, lineas = venta.Lineas.Count }
          );
          errors.Add((venta, ex));
          result.Errors++;
        }
        catch (InsufficientStockException ex)
        {
          // Stock insuficiente → venta PENDING, NO error
          _logger.LogWarning($"Insufficient stock, marking sale as PENDING: {ex.Message}");
          await _supabaseWriter.LogErrorAsync(
            "insufficient_stock",
            venta.IdVenta,
            ex.Message,
            new { venta.IdVenta, required = ex.Quantity, available = ex.Available }
          );
          // Venta queda en status='pending' en DB, se reintenta después
        }
        catch (Exception ex)
        {
          _logger.LogError($"Unexpected error processing {venta.IdVenta}: {ex}");
          await _supabaseWriter.LogErrorAsync(
            "transaction_failed",
            venta.IdVenta,
            ex.Message,
            new { venta.IdVenta, exception = ex.GetType().Name }
          );
          errors.Add((venta, ex));
          result.Errors++;
        }
      }

      // 5. Update cursor
      if (!string.IsNullOrEmpty(lastProcessedSale))
      {
        await _supabaseWriter.UpdateSyncCursorAsync(lastProcessedSale);
      }

      // 6. Retry pending sales if any new stock arrived
      await RetryPendingSalesAsync();

      // 7. Alert if too many errors
      if (result.Errors > 10)
      {
        await _alertService.AlertAsync(
          $"ALTO: {result.Errors} errores en sincronización Bridge"
        );
      }

      result.Success = result.Errors == 0;
      result.LastProcessedSaleId = lastProcessedSale;

      return result;
    }
    catch (Exception ex)
    {
      _logger.LogError($"Sync orchestration failed: {ex}");
      await _alertService.AlertAsync("CRITICAL: Sync orchestration failed");
      return result with { Success = false };
    }
  }

  private async Task HandleCancellationAsync(SysmeVenta venta)
  {
    _logger.LogInformation($"Processing cancellation for sale {venta.IdVenta}");
    
    // Buscar venta existente en Latin POS
    // Si existe: UPDATE status='cancelled', crear movimientos de reversión
    // Si NO existe: Log warning (venta cancelada antes de llegar a sincronizar)
    
    await _supabaseWriter.CancelSaleAsync(venta.IdVenta);
  }

  private async Task RetryPendingSalesAsync()
  {
    var pendingSales = await _supabaseWriter.GetPendingSalesAsync();
    if (pendingSales.Count == 0) return;

    _logger.LogInformation($"Retrying {pendingSales.Count} pending sales");

    // Para cada venta pendiente:
    // 1. Buscar los sale_lines originales
    // 2. Verificar si hay stock
    // 3. Si sí: UPDATE sales status='completed', INSERT stock movements
    // 4. Si no: Leave pending
  }

  private string GenerateEventKey(SysmeVenta venta)
  {
    var key = $"sysme_sale_{venta.IdVenta}";
    using (var md5 = System.Security.Cryptography.MD5.Create())
    {
      var hash = md5.ComputeHash(System.Text.Encoding.UTF8.GetBytes(key));
      return Convert.ToHexString(hash).ToLower();
    }
  }
}
```

### 4.2 SyncWorker.cs (Polling Loop)

```csharp
public class SyncWorker : BackgroundService
{
  private readonly ISyncOrchestrator _orchestrator;
  private readonly BridgeConfig _config;
  private readonly ILogger<SyncWorker> _logger;

  protected override async Task ExecuteAsync(CancellationToken stoppingToken)
  {
    _logger.LogInformation("SyncWorker started");

    while (!stoppingToken.IsCancellationRequested)
    {
      try
      {
        var result = await _orchestrator.SyncAsync(stoppingToken);
        
        if (result.Success)
        {
          _logger.LogInformation(
            $"Sync completed: {result.SalesProcessed} sales, " +
            $"{result.Errors} errors"
          );
        }
        else
        {
          _logger.LogWarning($"Sync failed: {string.Join(", ", result.ErrorMessages)}");
        }

        // Esperar antes de siguiente ciclo
        await Task.Delay(_config.PollingIntervalMs, stoppingToken);
      }
      catch (OperationCanceledException)
      {
        _logger.LogInformation("SyncWorker stopped");
        break;
      }
      catch (Exception ex)
      {
        _logger.LogError($"Unhandled error in SyncWorker: {ex}");
        await Task.Delay(_config.PollingIntervalMs, stoppingToken);
      }
    }
  }
}
```

---

## 5. INFRAESTRUCTURA

### 5.1 SysmeRepository.cs (MySQL Reader)

```csharp
public class SysmeRepository : ISysmeReader
{
  private readonly string _connectionString;
  private readonly ILogger<SysmeRepository> _logger;

  public async Task<List<SysmeVenta>> GetSalesIncrementalAsync(
    string cursor, 
    int limit = 1000)
  {
    // SQL PSEUDOCÓDIGO:
    // SELECT * FROM ventas 
    // WHERE id_venta > cursor OR cursor IS NULL
    // ORDER BY id_venta ASC
    // LIMIT limit;
    
    // Para CADA venta:
    //   SELECT * FROM ventadir_comg WHERE id_venta = ?
    //   Mapear a SysmeLinea con (id_empresa, id_centro, id_tipo_comg, id_complementog)

    using (var conn = new MySqlConnection(_connectionString))
    {
      await conn.OpenAsync();
      
      var query = @"
        SELECT id_venta, serie, num_tiquet, fecha_hora, 
               metodo_pago, subtotal, total_impuesto, total,
               cancelada, fecha_cancelacion
        FROM ventas
        WHERE (@cursor IS NULL OR id_venta > @cursor)
        ORDER BY id_venta ASC
        LIMIT @limit
      ";

      using (var cmd = new MySqlCommand(query, conn))
      {
        cmd.Parameters.AddWithValue("@cursor", cursor ?? (object)DBNull.Value);
        cmd.Parameters.AddWithValue("@limit", limit);

        var ventas = new List<SysmeVenta>();
        using (var reader = await cmd.ExecuteReaderAsync())
        {
          while (await reader.ReadAsync())
          {
            var venta = new SysmeVenta
            {
              IdVenta = reader["id_venta"].ToString(),
              SerieTicket = reader["serie"].ToString(),
              NumTicket = reader["num_tiquet"].ToString(),
              Timestamp = Convert.ToDateTime(reader["fecha_hora"]),
              MetodoPago = reader["metodo_pago"].ToString(),
              Subtotal = Convert.ToDecimal(reader["subtotal"]),
              TotalImpuesto = Convert.ToDecimal(reader["total_impuesto"]),
              TotalPagar = Convert.ToDecimal(reader["total"]),
              Cancelada = Convert.ToBoolean(reader["cancelada"]),
              TimestampCancelacion = reader["fecha_cancelacion"] as DateTime?,
              Lineas = new List<SysmeLinea>()
            };

            // Leer líneas
            var lineas = await GetSaleLineas(conn, venta.IdVenta);
            venta.Lineas.AddRange(lineas);

            ventas.Add(venta);
          }
        }

        return ventas;
      }
    }
  }

  private async Task<List<SysmeLinea>> GetSaleLineas(MySqlConnection conn, string idVenta)
  {
    var query = @"
      SELECT id_linea, id_empresa, id_centro, id_tipo_comg, id_complementog,
             descripcion, cantidad, precio_unitario, descuento, avgiva, total,
             costounitar
      FROM ventadir_comg
      WHERE id_venta = @idVenta
      ORDER BY id_linea ASC
    ";

    var lineas = new List<SysmeLinea>();
    using (var cmd = new MySqlCommand(query, conn))
    {
      cmd.Parameters.AddWithValue("@idVenta", idVenta);

      using (var reader = await cmd.ExecuteReaderAsync())
      {
        while (await reader.ReadAsync())
        {
          lineas.Add(new SysmeLinea
          {
            IdLinea = reader["id_linea"].ToString(),
            IdEmpresa = reader["id_empresa"].ToString(),
            IdCentro = reader["id_centro"].ToString(),
            IdTipoComg = reader["id_tipo_comg"].ToString(),
            IdComplementog = reader["id_complementog"].ToString(),
            Descripcion = reader["descripcion"].ToString(),
            Cantidad = Convert.ToDecimal(reader["cantidad"]),
            PrecioUnitario = Convert.ToDecimal(reader["precio_unitario"]),
            DescuentoLinea = Convert.ToDecimal(reader["descuento"]),
            AvgIVA = Convert.ToDecimal(reader["avgiva"]),
            TotalLinea = Convert.ToDecimal(reader["total"]),
            CostoUnitario = reader["costounitar"] as decimal?
          });
        }
      }
    }

    return lineas;
  }

  public async Task<bool> HealthCheckAsync()
  {
    try
    {
      using (var conn = new MySqlConnection(_connectionString))
      {
        await conn.OpenAsync();
        using (var cmd = new MySqlCommand("SELECT 1", conn))
        {
          await cmd.ExecuteScalarAsync();
          return true;
        }
      }
    }
    catch (Exception ex)
    {
      _logger.LogError($"Sysme health check failed: {ex.Message}");
      return false;
    }
  }
}
```

### 5.2 SupabaseRepository.cs (PostgreSQL Writer)

```csharp
public class SupabaseRepository : ISupabaseWriter
{
  private readonly string _connectionString;
  private readonly ILogger<SupabaseRepository> _logger;

  public async Task<Guid> CreateSaleTransactionAsync(
    SysmeVenta sysmeVenta,
    Dictionary<string, Guid> productIdMap)
  {
    using (var conn = new NpgsqlConnection(_connectionString))
    {
      await conn.OpenAsync();
      using (var tx = await conn.BeginTransactionAsync())
      {
        try
        {
          // 1. Crear venta (cabecera)
          var saleId = await InsertSaleAsync(conn, sysmeVenta);

          // 2. Crear líneas
          var allLineasOk = true;
          foreach (var linea in sysmeVenta.Lineas)
          {
            var key = $"{linea.IdEmpresa}|{linea.IdCentro}|{linea.IdTipoComg}|{linea.IdComplementog}";
            var productId = productIdMap[key];

            try
            {
              await InsertSaleLineAsync(conn, saleId, productId, linea, sysmeVenta);
            }
            catch (InsufficientStockException)
            {
              // No fallar la transacción, solo marcar sale como pending
              allLineasOk = false;
              break;
            }
          }

          // 3. Si alguna línea no tuvo stock: UPDATE sale status='pending'
          if (!allLineasOk)
          {
            await UpdateSaleStatusAsync(conn, saleId, "pending");
            // NO actualizar stock
          }
          else
          {
            // 4. Actualizar stock
            foreach (var linea in sysmeVenta.Lineas)
            {
              await DeductStockAsync(conn, productIdMap[...], linea.Cantidad);
            }
          }

          await tx.CommitAsync();
          return saleId;
        }
        catch (Exception)
        {
          await tx.RollbackAsync();
          throw;
        }
      }
    }
  }

  private async Task<Guid> InsertSaleAsync(IDbConnection conn, SysmeVenta venta)
  {
    var query = @"
      INSERT INTO sales (
        source, status, sysme_id_venta, sysme_serie, sysme_id_tiquet,
        sale_date, subtotal, tax, total, payment_method, created_at, updated_at
      ) VALUES (
        'sysme', 'completed', @sysmeIdVenta, @serie, @tiquet,
        @saleDate, @subtotal, @tax, @total, @paymentMethod, NOW(), NOW()
      )
      ON CONFLICT (sysme_id_venta) DO NOTHING
      RETURNING id;
    ";

    using (var cmd = new NpgsqlCommand(query, (NpgsqlConnection)conn))
    {
      cmd.Parameters.AddWithValue("@sysmeIdVenta", venta.IdVenta);
      cmd.Parameters.AddWithValue("@serie", venta.SerieTicket ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@tiquet", venta.NumTicket ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@saleDate", venta.Timestamp);
      cmd.Parameters.AddWithValue("@subtotal", venta.Subtotal);
      cmd.Parameters.AddWithValue("@tax", venta.TotalImpuesto);
      cmd.Parameters.AddWithValue("@total", venta.TotalPagar);
      cmd.Parameters.AddWithValue("@paymentMethod", venta.MetodoPago ?? (object)DBNull.Value);

      var result = await cmd.ExecuteScalarAsync();
      if (result == null || result == DBNull.Value)
      {
        // Ya existe, reutilizar
        var getQuery = "SELECT id FROM sales WHERE sysme_id_venta = @sysmeIdVenta";
        using (var getCmd = new NpgsqlCommand(getQuery, (NpgsqlConnection)conn))
        {
          getCmd.Parameters.AddWithValue("@sysmeIdVenta", venta.IdVenta);
          result = await getCmd.ExecuteScalarAsync();
        }
      }

      return (Guid)result;
    }
  }

  private async Task InsertSaleLineAsync(
    IDbConnection conn,
    Guid saleId,
    Guid productId,
    SysmeLinea linea,
    SysmeVenta venta)
  {
    // Verificar stock
    var stock = await GetProductStockAsync(conn, productId);
    if (stock < linea.Cantidad)
    {
      throw new InsufficientStockException(
        $"Product {productId} requires {linea.Cantidad} but only {stock} available",
        linea.Cantidad,
        stock
      );
    }

    var totalCost = (linea.CostoUnitario ?? 0) * linea.Cantidad;
    var totalSale = linea.TotalLinea - linea.DescuentoLinea;
    var grossProfit = totalSale - totalCost;
    var grossMarginPercent = totalSale > 0 ? (grossProfit / totalSale) * 100 : 0;

    var query = @"
      INSERT INTO sale_lines (
        sale_id, product_id, sysme_id_venta, sysme_id_linea,
        quantity, unit_sale_price, unit_cost_at_time, tax_rate,
        discount, total_sale, total_cost, gross_profit, gross_margin_percent,
        created_at
      ) VALUES (
        @saleId, @productId, @sysmeIdVenta, @sysmeIdLinea,
        @quantity, @unitPrice, @costAtTime, @taxRate,
        @discount, @totalSale, @totalCost, @grossProfit, @grossMargin,
        NOW()
      );
    ";

    using (var cmd = new NpgsqlCommand(query, (NpgsqlConnection)conn))
    {
      cmd.Parameters.AddWithValue("@saleId", saleId);
      cmd.Parameters.AddWithValue("@productId", productId);
      cmd.Parameters.AddWithValue("@sysmeIdVenta", venta.IdVenta);
      cmd.Parameters.AddWithValue("@sysmeIdLinea", linea.IdLinea);
      cmd.Parameters.AddWithValue("@quantity", linea.Cantidad);
      cmd.Parameters.AddWithValue("@unitPrice", linea.PrecioUnitario);
      cmd.Parameters.AddWithValue("@costAtTime", linea.CostoUnitario ?? (object)DBNull.Value);
      cmd.Parameters.AddWithValue("@taxRate", linea.AvgIVA);
      cmd.Parameters.AddWithValue("@discount", linea.DescuentoLinea);
      cmd.Parameters.AddWithValue("@totalSale", totalSale);
      cmd.Parameters.AddWithValue("@totalCost", totalCost);
      cmd.Parameters.AddWithValue("@grossProfit", grossProfit);
      cmd.Parameters.AddWithValue("@grossMargin", grossMarginPercent);

      await cmd.ExecuteNonQueryAsync();
    }

    // Crear stock_movement
    await InsertStockMovementAsync(conn, productId, -linea.Cantidad, "sale", saleId.ToString(), venta.IdVenta);
  }

  private async Task InsertStockMovementAsync(
    IDbConnection conn,
    Guid productId,
    decimal quantity,
    string movementType,
    string referenceId,
    string sysmeIdVenta)
  {
    var previousStock = await GetProductStockAsync(conn, productId);
    var resultingStock = previousStock + quantity;

    var query = @"
      INSERT INTO stock_movements (
        product_id, movement_type, quantity, previous_stock, resulting_stock,
        reference_type, reference_id, source, reason, created_at
      ) VALUES (
        @productId, @movementType, @quantity, @previousStock, @resultingStock,
        'sale', @referenceId, 'sysme_bridge', @reason, NOW()
      );
    ";

    using (var cmd = new NpgsqlCommand(query, (NpgsqlConnection)conn))
    {
      cmd.Parameters.AddWithValue("@productId", productId);
      cmd.Parameters.AddWithValue("@movementType", movementType);
      cmd.Parameters.AddWithValue("@quantity", quantity);
      cmd.Parameters.AddWithValue("@previousStock", previousStock);
      cmd.Parameters.AddWithValue("@resultingStock", resultingStock);
      cmd.Parameters.AddWithValue("@referenceId", referenceId);
      cmd.Parameters.AddWithValue("@reason", $"Sysme venta {sysmeIdVenta}");

      await cmd.ExecuteNonQueryAsync();
    }
  }

  private async Task<decimal> GetProductStockAsync(IDbConnection conn, Guid productId)
  {
    var query = "SELECT stock FROM products WHERE id = @productId";
    using (var cmd = new NpgsqlCommand(query, (NpgsqlConnection)conn))
    {
      cmd.Parameters.AddWithValue("@productId", productId);
      var result = await cmd.ExecuteScalarAsync();
      return result == null ? 0 : Convert.ToDecimal(result);
    }
  }

  public async Task<Guid?> LookupProductAsync(
    string idEmpresa,
    string idCentro,
    string idTipoComg,
    string idComplementog)
  {
    var query = @"
      SELECT product_id FROM sysme_product_map
      WHERE id_empresa = @idEmpresa
        AND id_centro = @idCentro
        AND id_tipo_comg = @idTipoComg
        AND id_complementog = @idComplementog
        AND active = true
    ";

    using (var conn = new NpgsqlConnection(_connectionString))
    {
      await conn.OpenAsync();
      using (var cmd = new NpgsqlCommand(query, conn))
      {
        cmd.Parameters.AddWithValue("@idEmpresa", idEmpresa);
        cmd.Parameters.AddWithValue("@idCentro", idCentro);
        cmd.Parameters.AddWithValue("@idTipoComg", idTipoComg);
        cmd.Parameters.AddWithValue("@idComplementog", idComplementog);

        var result = await cmd.ExecuteScalarAsync();
        return result == null ? null : (Guid)result;
      }
    }
  }

  public async Task LogErrorAsync(string errorType, string sysmeIdVenta, string message, object payload)
  {
    var query = @"
      INSERT INTO bridge_errors (
        error_type, source, sysme_id_venta, message, payload, occurred_at
      ) VALUES (
        @errorType, 'sysme_bridge', @sysmeIdVenta, @message, @payload::jsonb, NOW()
      );
    ";

    using (var conn = new NpgsqlConnection(_connectionString))
    {
      await conn.OpenAsync();
      using (var cmd = new NpgsqlCommand(query, conn))
      {
        cmd.Parameters.AddWithValue("@errorType", errorType);
        cmd.Parameters.AddWithValue("@sysmeIdVenta", sysmeIdVenta ?? (object)DBNull.Value);
        cmd.Parameters.AddWithValue("@message", message);
        cmd.Parameters.AddWithValue("@payload", JsonConvert.SerializeObject(payload));

        await cmd.ExecuteNonQueryAsync();
      }
    }
  }

  // ... más métodos (UpdateSyncCursorAsync, CancelSaleAsync, GetPendingSalesAsync)
}
```

---

## 6. DEPENDENCY INJECTION (Program.cs)

```csharp
public class Program
{
  public static void Main(string[] args)
  {
    var builder = Host.CreateDefaultBuilder(args);

    builder.ConfigureServices((context, services) =>
    {
      // Config
      var config = new BridgeConfig();
      context.Configuration.GetSection("BridgeConfig").Bind(config);
      services.AddSingleton(config);

      // Repositories
      services.AddScoped<ISysmeReader, SysmeRepository>();
      services.AddScoped<ISupabaseWriter, SupabaseRepository>();
      services.AddScoped<IIdempotencyManager, IdempotencyManager>();

      // Orchestrator
      services.AddScoped<ISyncOrchestrator, SyncOrchestrator>();

      // Worker
      services.AddHostedService<SyncWorker>();

      // Alerts
      services.AddScoped<IAlertService, AlertService>();

      // Logging
      services.AddLogging(logging =>
      {
        logging.AddConsole();
        logging.AddFile("logs/bridge-{Date}.log");
      });
    });

    builder.Build().Run();
  }
}
```

---

## 7. CONFIGURACIÓN (appsettings.json)

```json
{
  "BridgeConfig": {
    "PollingIntervalMs": 300000,
    "BatchSize": 1000,
    "BatchTimeoutMs": 30000,
    "MaxRetries": 5,
    "RetryBackoffSeconds": 2,
    "AlertOnError": true
  },
  "Sysme": {
    "Host": "192.168.x.x",
    "Port": 3306,
    "User": "sysme_sync_user",
    "Password": "***",
    "Database": "sysme"
  },
  "Supabase": {
    "Url": "https://xxx.supabase.co",
    "AnonKey": "eyJ...",
    "ServiceKey": "eyJ..."
  }
}
```

---

## PUNTOS CLAVE PARA LA IMPLEMENTACIÓN

1. **Transacciones ACID** — TODO sale+líneas+stock en una transacción
2. **Idempotencia** — Dos niveles (event_key + sysme_id_venta UNIQUE)
3. **Gestión de errores** — bridge_errors para audit trail
4. **Cursor incremental** — last_finalized_sale_id para próxima sincronización
5. **Reintentos con backoff** — Exponencial, máx 5 intentos
6. **Alertas** — Notificar si errores > umbral
7. **Health checks** — Verificar MySQL y PostgreSQL antes de sincronizar
8. **Logging** — Completo para troubleshooting

---

**Próximo paso:** Usuario aprueba decisiones → Implementación efectiva del Bridge Windows (SUBFASE 12.9)
