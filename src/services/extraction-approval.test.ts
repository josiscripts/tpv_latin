// Pruebas con mocks (sin Supabase ni IA). Ejecutar: tsx src/services/extraction-approval.test.ts
// El mock de approve simula la función atómica: bloqueo por extracción y compra única.
import assert from 'node:assert/strict';
import { approveExtractionAndCreatePurchase, type ApprovalDeps, type ApprovalRpcResult } from './extraction-approval.service';

function makeAtomicBackend(opts: { failAfterCreateOnce?: boolean } = {}) {
  const purchases = new Map<string, string>(); // extractionId -> purchaseId
  const calls = { approve: 0, createdRows: 0, linkSupplier: 0 };
  let lostResponse = opts.failAfterCreateOnce ?? false;
  let seq = 0;

  const deps: ApprovalDeps = {
    linkSupplier: async () => { calls.linkSupplier++; return { supplierId: 'proveedor-prueba' }; },
    approve: async (extractionId): Promise<ApprovalRpcResult> => {
      calls.approve++;
      // Bloqueo por extracción: las llamadas concurrentes se ejecutan en serie
      await Promise.resolve();
      const existing = purchases.get(extractionId);
      if (existing) return { purchaseId: existing, created: false, linesCopied: 0, linesSkipped: 0 };
      const id = `compra-prueba-${++seq}`;
      purchases.set(extractionId, id); // la compra y el vínculo se confirman juntos
      calls.createdRows++;
      if (lostResponse) {
        lostResponse = false;
        throw new Error('respuesta de red perdida tras confirmar la compra'); // el cliente no la ve
      }
      return { purchaseId: id, created: true, linesCopied: 1, linesSkipped: 0 };
    },
  };
  return { deps, calls, purchases };
}

const tests: Array<[string, () => Promise<void>]> = [
  ['flujo correcto crea una compra', async () => {
    const { deps, calls, purchases } = makeAtomicBackend();
    const r = await approveExtractionAndCreatePurchase(deps, 'ext-1');
    assert.equal(r.status, 'created');
    assert.equal(calls.createdRows, 1);
    assert.equal(purchases.size, 1);
  }],
  ['doble clic concurrente: una sola compra', async () => {
    const { deps, calls } = makeAtomicBackend();
    const [a, b] = await Promise.all([
      approveExtractionAndCreatePurchase(deps, 'ext-1'),
      approveExtractionAndCreatePurchase(deps, 'ext-1'),
    ]);
    assert.deepEqual([a.status, b.status].sort(), ['already_linked', 'created']);
    assert.equal(calls.createdRows, 1);
  }],
  ['respuesta perdida tras crear la compra: el reintento no duplica', async () => {
    const { deps, calls, purchases } = makeAtomicBackend({ failAfterCreateOnce: true });
    const first = await approveExtractionAndCreatePurchase(deps, 'ext-2');
    assert.equal(first.status, 'error');            // el usuario ve error...
    assert.equal(purchases.size, 1);                // ...pero la compra existe
    const retry = await approveExtractionAndCreatePurchase(deps, 'ext-2');
    assert.equal(retry.status, 'already_linked');   // el reintento la reconoce
    assert.equal(calls.createdRows, 1);
  }],
  ['proveedor ambiguo: error y no se llama a la aprobación', async () => {
    const { deps, calls } = makeAtomicBackend();
    const r = await approveExtractionAndCreatePurchase(
      { ...deps, linkSupplier: async () => ({ supplierId: 'x', conflict: 'dos proveedores con el mismo NIF' }) },
      'ext-3',
    );
    assert.equal(r.status, 'error');
    assert.equal(calls.approve, 0);
  }],
  ['error de autorización (no admin) se muestra y no crea nada', async () => {
    const { deps, purchases } = makeAtomicBackend();
    const r = await approveExtractionAndCreatePurchase(
      { ...deps, approve: async () => { throw new Error('Solo administradores pueden aprobar extracciones y crear compras'); } },
      'ext-4',
    );
    assert.equal(r.status, 'error');
    assert.match(r.status === 'error' ? r.message : '', /Solo administradores/);
    assert.equal(purchases.size, 0);
  }],
  ['albarán sin importes: se propagan líneas omitidas y no se inventan valores', async () => {
    const { deps } = makeAtomicBackend();
    const r = await approveExtractionAndCreatePurchase(
      { ...deps, approve: async () => ({ purchaseId: 'c-alb', created: true, linesCopied: 0, linesSkipped: 2 }) },
      'ext-albaran-prueba',
    );
    assert.equal(r.status, 'created');
    assert.ok(r.status === 'created' && r.linesCopied === 0 && r.linesSkipped === 2);
  }],
  ['proveedor elegido en la revisión: no se intenta deducirlo del documento', async () => {
    const { deps, calls } = makeAtomicBackend();
    const r = await approveExtractionAndCreatePurchase(
      { ...deps, linkSupplier: async () => { throw new Error('vendor name required'); } },
      'ext-manual',
      'proveedor-elegido',
    );
    assert.equal(r.status, 'created');
    assert.equal(calls.linkSupplier, 0);
    assert.ok(r.status === 'created' && r.supplierId === 'proveedor-elegido');
  }],
  ['sin proveedor ni elección: error claro y no se crea compra', async () => {
    const { deps, purchases } = makeAtomicBackend();
    const r = await approveExtractionAndCreatePurchase(
      { ...deps, linkSupplier: async () => { throw new Error('vendor name required'); } },
      'ext-sin-proveedor',
    );
    assert.equal(r.status, 'error');
    assert.match(r.status === 'error' ? r.message : '', /vendor name required/);
    assert.equal(purchases.size, 0);
  }],
];

let failed = 0;
(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`PASS  ${name}`); }
    catch (e) { failed++; console.log(`FAIL  ${name}: ${(e as Error).message}`); }
  }
  console.log(`\nResumen: ${tests.length - failed}/${tests.length} pasaron.`);
  process.exit(failed ? 1 : 0);
})();
