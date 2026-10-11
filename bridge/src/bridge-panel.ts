/**
 * Bridge Panel GUI - Local Express server para control Bridge
 * Puerto: 3333 (local only)
 * Interfaz: HTML + WebSocket para actualizaciones en tiempo real
 */

import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { BridgeContinuous } from './bridge-continuous';
import fs from 'fs';
import path from 'path';

interface PanelState {
  sysmeConnected: boolean;
  supabaseConnected: boolean;
  bridgeRunning: boolean;
  lastSync: Date | null;
  currentlySyncing: boolean;
  lastResults: {
    productsSynced: number;
    productErrors: number;
    imagesSynced: number;
    imageErrors: number;
  };
  errorHistory: Array<{ timestamp: Date; message: string }>;
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let panelState: PanelState = {
  sysmeConnected: false,
  supabaseConnected: false,
  bridgeRunning: false,
  lastSync: null,
  currentlySyncing: false,
  lastResults: {
    productsSynced: 0,
    productErrors: 0,
    imagesSynced: 0,
    imageErrors: 0,
  },
  errorHistory: [],
};

let bridge: BridgeContinuous | null = null;

// Broadcast estado a todos los clientes WebSocket
function broadcastState() {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify({
        type: 'state-update',
        payload: panelState,
      }));
    }
  });
}

// HTML Panel
const htmlPanel = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bridge TPV LATIN PRO - Panel de Control</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 600px;
      width: 100%;
      padding: 40px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 30px;
      border-bottom: 2px solid #f0f0f0;
      padding-bottom: 20px;
    }
    .header h1 {
      font-size: 24px;
      color: #333;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .status-indicator {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    .status-indicator.online { background: #10b981; }
    .status-indicator.offline { background: #ef4444; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .status-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 30px;
    }
    .status-card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 15px;
      text-align: center;
    }
    .status-card h3 {
      font-size: 12px;
      text-transform: uppercase;
      color: #9ca3af;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .status-card .value {
      font-size: 18px;
      font-weight: 700;
      color: #1f2937;
    }
    .status-card.connected .value { color: #10b981; }
    .status-card.disconnected .value { color: #ef4444; }
    .button-group {
      display: flex;
      gap: 10px;
      margin-bottom: 30px;
    }
    button {
      flex: 1;
      padding: 12px 20px;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      font-size: 14px;
    }
    .btn-primary {
      background: #667eea;
      color: white;
    }
    .btn-primary:hover:not(:disabled) {
      background: #5568d3;
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
    }
    .btn-primary:disabled {
      background: #cbd5e1;
      cursor: not-allowed;
    }
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }
    .btn-secondary:hover {
      background: #e5e7eb;
    }
    .results-section {
      background: #f9fafb;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .results-section h3 {
      font-size: 14px;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 15px;
      font-weight: 600;
    }
    .result-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 14px;
    }
    .result-row:last-child { border-bottom: none; }
    .result-row .label { color: #6b7280; }
    .result-row .value { font-weight: 600; color: #1f2937; }
    .last-sync {
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
      margin-top: 20px;
    }
    .error-log {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 15px;
      max-height: 150px;
      overflow-y: auto;
      margin-top: 20px;
    }
    .error-log h4 {
      font-size: 12px;
      color: #991b1b;
      margin-bottom: 10px;
      font-weight: 600;
    }
    .error-item {
      font-size: 11px;
      color: #7f1d1d;
      margin-bottom: 5px;
      padding: 5px;
      background: white;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>
        <span class="status-indicator online" id="bridgeIndicator"></span>
        Bridge TPV LATIN PRO
      </h1>
    </div>

    <div class="status-grid">
      <div class="status-card" id="sysmeCard">
        <h3>Sysme TPV</h3>
        <div class="value" id="sysmeStatus">—</div>
      </div>
      <div class="status-card" id="supabaseCard">
        <h3>Supabase</h3>
        <div class="value" id="supabaseStatus">—</div>
      </div>
      <div class="status-card">
        <h3>Estado Bridge</h3>
        <div class="value" id="bridgeStatus">Parado</div>
      </div>
      <div class="status-card">
        <h3>Sincronizando</h3>
        <div class="value" id="syncingStatus">No</div>
      </div>
    </div>

    <div class="button-group">
      <button class="btn-primary" id="syncButton" onclick="manualSync()">
        🔄 Sincronizar Ahora
      </button>
      <button class="btn-secondary" onclick="refreshPanel()">
        ⟳ Actualizar
      </button>
    </div>

    <div class="results-section" id="resultsSection" style="display: none;">
      <h3>Últimos Resultados</h3>
      <div class="result-row">
        <span class="label">Productos Sincronizados:</span>
        <span class="value" id="productResult">0</span>
      </div>
      <div class="result-row">
        <span class="label">Errores Productos:</span>
        <span class="value" id="productErrorResult">0</span>
      </div>
      <div class="result-row">
        <span class="label">Imágenes Sincronizadas:</span>
        <span class="value" id="imageResult">0</span>
      </div>
      <div class="result-row">
        <span class="label">Errores Imágenes:</span>
        <span class="value" id="imageErrorResult">0</span>
      </div>
      <div class="last-sync" id="lastSyncTime">Última sincronización: —</div>
    </div>

    <div class="error-log" id="errorLog" style="display: none;">
      <h4>Historial de Errores</h4>
      <div id="errorItems"></div>
    </div>
  </div>

  <script>
    const ws = new WebSocket(\`ws://\${window.location.host}\`);

    ws.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data);
      if (type === 'state-update') {
        updatePanel(payload);
      }
    };

    function updatePanel(state) {
      // Estado conexiones
      document.getElementById('sysmeStatus').textContent = state.sysmeConnected ? '✓ Conectado' : '✗ Desconectado';
      document.getElementById('supabaseStatus').textContent = state.supabaseConnected ? '✓ Conectado' : '✗ Desconectado';

      document.getElementById('sysmeCard').className = state.sysmeConnected ? 'status-card connected' : 'status-card disconnected';
      document.getElementById('supabaseCard').className = state.supabaseConnected ? 'status-card connected' : 'status-card disconnected';

      document.getElementById('bridgeStatus').textContent = state.bridgeRunning ? '✓ Activo' : '⊘ Parado';
      document.getElementById('syncingStatus').textContent = state.currentlySyncing ? '✓ Sí' : 'No';
      document.getElementById('syncButton').disabled = state.currentlySyncing;

      // Resultados
      if (state.lastResults.productsSynced > 0 || state.lastResults.productErrors > 0) {
        document.getElementById('resultsSection').style.display = 'block';
        document.getElementById('productResult').textContent = state.lastResults.productsSynced;
        document.getElementById('productErrorResult').textContent = state.lastResults.productErrors;
        document.getElementById('imageResult').textContent = state.lastResults.imagesSynced;
        document.getElementById('imageErrorResult').textContent = state.lastResults.imageErrors;

        if (state.lastSync) {
          const date = new Date(state.lastSync);
          document.getElementById('lastSyncTime').textContent = \`Última sincronización: \${date.toLocaleString('es-ES')}\`;
        }
      }

      // Errores
      if (state.errorHistory.length > 0) {
        document.getElementById('errorLog').style.display = 'block';
        const errorItems = state.errorHistory.map(e =>
          \`<div class="error-item">[\${new Date(e.timestamp).toLocaleTimeString()}] \${e.message}</div>\`
        ).join('');
        document.getElementById('errorItems').innerHTML = errorItems;
      }
    }

    function manualSync() {
      fetch('/api/sync', { method: 'POST' });
    }

    function refreshPanel() {
      fetch('/api/status')
        .then(r => r.json())
        .then(state => updatePanel(state));
    }

    // Actualizar cada 2 segundos
    setInterval(() => {
      if (ws.readyState === 1) refreshPanel();
    }, 2000);

    refreshPanel();
  </script>
</body>
</html>
`;

// API Routes
app.get('/', (req, res) => res.send(htmlPanel));

app.get('/api/status', (req, res) => {
  res.json(panelState);
});

app.post('/api/sync', async (req, res) => {
  if (panelState.currentlySyncing) {
    return res.status(429).json({ error: 'Sincronización ya en progreso' });
  }

  panelState.currentlySyncing = true;
  broadcastState();

  try {
    const { spawn } = await import('child_process');
    const path = await import('path');

    const distDir = path.default.resolve(__dirname);
    const bridgeDir = path.default.resolve(distDir, '..');
    const syncScript = path.default.join(distDir, 'sync-products-once.js');

    console.log(`[PANEL] Ejecutando sincronización desde: ${syncScript}`);
    console.log(`[PANEL] Directorio de trabajo: ${bridgeDir}`);

    const syncProcess = spawn('node', [syncScript], {
      cwd: bridgeDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000,
      env: {
        ...process.env,
        NODE_PATH: path.default.join(bridgeDir, 'dist'),
      },
    });

    let output = '';
    let errors = '';

    syncProcess.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
      console.log('[SYNC]', data.toString().trim());
    });

    syncProcess.stderr?.on('data', (data: Buffer) => {
      errors += data.toString();
      console.error('[SYNC-ERR]', data.toString().trim());
    });

    syncProcess.on('close', (code: number | null) => {
      panelState.lastSync = new Date();
      panelState.currentlySyncing = false;

      if (code === 0 && !errors) {
        panelState.sysmeConnected = true;
        panelState.supabaseConnected = true;
        const match = output.match(/Productos sincronizados: (\d+)/);
        panelState.lastResults.productsSynced = match ? parseInt(match[1]) : 0;

        res.json({
          message: 'Sincronización completada exitosamente',
          output: output.substring(0, 500),
          results: panelState.lastResults,
        });
      } else {
        if (errors) {
          panelState.errorHistory.push({
            timestamp: new Date(),
            message: `Sync error (code ${code}): ${errors.substring(0, 200)}`,
          });
        }
        res.status(500).json({
          error: errors || `Process exited with code ${code}`,
          output: output.substring(0, 500),
        });
      }

      broadcastState();
    });

  } catch (error: any) {
    panelState.currentlySyncing = false;
    panelState.errorHistory.push({
      timestamp: new Date(),
      message: `Sync error: ${String(error).substring(0, 200)}`,
    });
    console.error('[PANEL] Sync setup error:', error);
    res.status(500).json({ error: String(error) });
    broadcastState();
  }
});

// WebSocket conexiones
wss.on('connection', (ws) => {
  console.log('[PANEL] Cliente conectado');
  ws.send(JSON.stringify({
    type: 'state-update',
    payload: panelState,
  }));

  ws.on('close', () => {
    console.log('[PANEL] Cliente desconectado');
  });
});

// Iniciar servidor
const PORT = parseInt(process.env.PANEL_PORT || '3333');
server.listen(PORT, 'localhost', () => {
  console.log(`[PANEL] Bridge GUI disponible en http://localhost:${PORT}`);
  console.log('[PANEL] Presiona Ctrl+C para detener');
});

// Shutdown limpio
process.on('SIGINT', () => {
  console.log('\n[PANEL] Cerrando...');
  server.close(() => process.exit(0));
});
