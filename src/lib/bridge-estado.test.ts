// Pruebas de la lógica de estado del Bridge. Ejecutar: tsx src/lib/bridge-estado.test.ts
import assert from 'node:assert/strict';
import { estadoBridge, type LatidoBridge } from './bridge-estado';

const AHORA = Date.parse('2026-10-13T10:00:00Z');
const base = (over: Partial<LatidoBridge> = {}): LatidoBridge => ({
  environment: 'PROD',
  last_seen_at: new Date(AHORA - 30_000).toISOString(),
  process_running: true,
  sysme_connected: true,
  consecutive_sysme_failures: 0,
  sync_status: 'running',
  last_successful_sync_at: null,
  last_error_summary: null,
  ...over,
});

const tests: Array<[string, () => void]> = [
  ['sin latido: desconocido', () => assert.equal(estadoBridge(null, AHORA).estado, 'desconocido')],
  ['latido vencido (4 min): desconocido, no sin_sysme', () => {
    const r = estadoBridge(base({ last_seen_at: new Date(AHORA - 4 * 60_000).toISOString() }), AHORA);
    assert.equal(r.estado, 'desconocido');
    assert.match(r.detalle, /No se puede saber/);
  }],
  ['proceso detenido: desconocido', () => assert.equal(estadoBridge(base({ process_running: false, sync_status: 'stopped' }), AHORA).estado, 'desconocido')],
  ['Sysme OK con señal reciente: activa', () => assert.equal(estadoBridge(base(), AHORA).estado, 'activa')],
  ['Sysme caído 1 vez: reconectando', () => assert.equal(estadoBridge(base({ sysme_connected: false, consecutive_sysme_failures: 1 }), AHORA).estado, 'reconectando')],
  ['Sysme caído 2 veces: reconectando', () => assert.equal(estadoBridge(base({ sysme_connected: false, consecutive_sysme_failures: 2 }), AHORA).estado, 'reconectando')],
  ['Sysme caído 3 veces: sin conexión con Sysme', () => {
    const r = estadoBridge(base({ sysme_connected: false, consecutive_sysme_failures: 3, last_error_summary: 'Sysme no responde: ECONNREFUSED' }), AHORA);
    assert.equal(r.estado, 'sin_sysme');
    assert.equal(r.texto, 'Sin conexión con Sysme');
  }],
  ['sysme no comprobado: desconocido', () => assert.equal(estadoBridge(base({ sysme_connected: null }), AHORA).estado, 'desconocido')],
  ['fecha inválida: desconocido', () => assert.equal(estadoBridge(base({ last_seen_at: 'no-es-fecha' }), AHORA).estado, 'desconocido')],
];

let fallos = 0;
for (const [nombre, fn] of tests) {
  try { fn(); console.log(`PASS  ${nombre}`); }
  catch (e) { fallos++; console.log(`FAIL  ${nombre}: ${(e as Error).message}`); }
}
console.log(`\nResumen: ${tests.length - fallos}/${tests.length} pasaron.`);
process.exit(fallos ? 1 : 0);
