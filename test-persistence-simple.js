import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient('http://127.0.0.1:54321', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU');

const createdIds = {
  suppliers: [],
  documents: [],
  extractions: [],
  purchases: [],
  purchase_lines: [],
};

const testId = crypto.randomBytes(4).toString('hex');
console.log(`\n=== PERSISTENCE TEST (Simplified) ===`);
console.log(`Test ID: ${testId}\n`);

async function createPurchaseFromExtractionLogic(supplierId, extractionId) {
  // Get extraction
  const { data: extraction, error: extractionError } = await supabase
    .from('document_extractions')
    .select('*')
    .eq('id', extractionId)
    .single();

  if (extractionError) throw extractionError;

  // Find matching purchases (idempotency)
  let existingPurchaseId = null;
  if (extraction.invoice_number && extraction.invoice_date) {
    const { data: existing, error: findError } = await supabase
      .from('purchases')
      .select('id')
      .eq('supplier_id', supplierId)
      .eq('invoice_number', extraction.invoice_number)
      .eq('purchase_date', extraction.invoice_date)
      .order('purchase_date', { ascending: false });

    if (!findError && existing && existing.length > 0) {
      existingPurchaseId = existing[0].id;
    }
  }

  // If purchase exists, check lines
  if (existingPurchaseId) {
    const { data: existingLines, error: lineError } = await supabase
      .from('purchase_lines')
      .select('id, quantity, unit_cost, total')
      .eq('purchase_id', existingPurchaseId);

    if (!lineError && existingLines) {
      const expectedLines = extraction.lines_extracted || [];

      // Create signatures
      const expectedSignatures = expectedLines.map(line =>
        `${line.quantity}|${line.unit_price || line.price}|${line.total || line.quantity * (line.unit_price || line.price)}`
      );
      const existingSignatures = existingLines.map(line =>
        `${line.quantity}|${line.unit_cost}|${line.total}`
      );

      const expectedCounts = new Map();
      expectedSignatures.forEach(sig => {
        expectedCounts.set(sig, (expectedCounts.get(sig) ?? 0) + 1);
      });

      const existingCounts = new Map();
      existingSignatures.forEach(sig => {
        existingCounts.set(sig, (existingCounts.get(sig) ?? 0) + 1);
      });

      // Check if all expected lines exist
      let allComplete = true;
      for (const [sig, expectedCount] of expectedCounts) {
        const existingCount = existingCounts.get(sig) ?? 0;
        if (existingCount !== expectedCount) {
          allComplete = false;
          break;
        }
      }

      if (allComplete) {
        return existingPurchaseId;
      }

      // Insert missing lines
      const linesToInsert = [];
      for (const [sig, expectedCount] of expectedCounts) {
        const existingCount = existingCounts.get(sig) ?? 0;
        const missingCount = expectedCount - existingCount;

        if (missingCount > 0) {
          // Find matching template line
          for (let i = 0; i < missingCount; i++) {
            const lineData = expectedLines[expectedSignatures.indexOf(sig)];
            linesToInsert.push({
              purchase_id: existingPurchaseId,
              product_id: null,
              quantity: lineData.quantity,
              unit_cost: lineData.unit_price || lineData.price,
              tax_rate: 0,
              total: lineData.total || lineData.quantity * (lineData.unit_price || lineData.price),
            });
          }
        }
      }

      if (linesToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('purchase_lines')
          .insert(linesToInsert);

        if (insertError) throw insertError;
      }

      return existingPurchaseId;
    }
  }

  // Create new purchase
  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .insert([{
      supplier_id: supplierId,
      purchase_date: extraction.invoice_date,
      invoice_number: extraction.invoice_number,
      type: 'factura',
      total: extraction.total,
      status: 'draft',
    }])
    .select()
    .single();

  if (purchaseError) throw purchaseError;

  // Insert lines
  const { data: insertedLines, error: linesError } = await supabase
    .from('purchase_lines')
    .insert(
      extraction.lines_extracted.map(line => ({
        purchase_id: purchase.id,
        product_id: null,
        quantity: line.quantity,
        unit_cost: line.unit_price || line.price,
        tax_rate: 0,
        total: line.total || line.quantity * (line.unit_price || line.price),
      }))
    )
    .select();

  if (linesError) throw linesError;

  return purchase.id;
}

(async () => {
  try {
    // PHASE 1: Create supplier
    console.log('PHASE 1: Create supplier...');
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .insert([{ name: `TEST_${testId}`, tax_id: `TAX-${testId}`, active: true }])
      .select()
      .single();

    if (supplierError) throw supplierError;
    createdIds.suppliers.push(supplier.id);
    console.log(`✓ Supplier: ${supplier.id}\n`);

    // PHASE 2: Create document & extraction
    console.log('PHASE 2: Create extraction...');
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert([{ original_name: `test_${testId}.pdf`, file_path: `/test/${testId}`, document_type: 'invoice' }])
      .select()
      .single();

    if (docError) throw docError;
    createdIds.documents.push(doc.id);

    const { data: extraction, error: extractError } = await supabase
      .from('document_extractions')
      .insert([{
        document_id: doc.id,
        vendor_name: supplier.name,
        vendor_tax_id: supplier.tax_id,
        invoice_number: `INV-${testId}`,
        invoice_date: '2026-10-10',
        extraction_model: 'test',
        document_type_detected: 'invoice',
        total: 140,
        lines_extracted: [
          { quantity: 5, unit_price: 10, total: 50, description: 'Line 1' },
          { quantity: 3, unit_price: 20, total: 60, description: 'Line 2' },
          { quantity: 2, unit_price: 15, total: 30, description: 'Line 3' },
        ],
        raw_response: {},
      }])
      .select()
      .single();

    if (extractError) throw extractError;
    createdIds.extractions.push(extraction.id);
    console.log(`✓ Extraction: ${extraction.id}\n`);

    // TEST 1: Create purchase with 3 lines
    console.log('TEST 1: Create purchase with 3 lines...');
    const purchaseId1 = await createPurchaseFromExtractionLogic(supplier.id, extraction.id);
    createdIds.purchases.push(purchaseId1);
    console.log(`✓ Purchase created: ${purchaseId1}`);

    const { data: lines1 } = await supabase.from('purchase_lines').select('id').eq('purchase_id', purchaseId1);
    lines1?.forEach(l => createdIds.purchase_lines.push(l.id));
    console.log(`✓ Lines created: ${lines1?.length}\n`);

    if ((lines1?.length || 0) !== 3) {
      throw new Error(`Expected 3 lines, got ${lines1?.length}`);
    }

    // TEST 2: Reintent (idempotence)
    console.log('TEST 2: Reintent (idempotence)...');
    const purchaseId2 = await createPurchaseFromExtractionLogic(supplier.id, extraction.id);
    console.log(`✓ Reintent returned: ${purchaseId2}`);

    if (purchaseId2 !== purchaseId1) {
      throw new Error(`Expected same ID, got different`);
    }

    const { data: lines2 } = await supabase.from('purchase_lines').select('id').eq('purchase_id', purchaseId2);
    if ((lines2?.length || 0) !== 3) {
      throw new Error(`Reintent changed line count: ${lines2?.length}`);
    }
    console.log(`✓ No duplication, line count stable\n`);

    // TEST 3: Recover partial lines
    console.log('TEST 3: Recover partial lines...');

    // Delete 1 line to simulate partial failure
    const lineToDelete = lines1?.[0];
    if (lineToDelete) {
      await supabase.from('purchase_lines').delete().eq('id', lineToDelete.id);
      console.log(`  Deleted 1 line to simulate partial state`);
    }

    // Reintent should recover
    const purchaseId3 = await createPurchaseFromExtractionLogic(supplier.id, extraction.id);
    const { data: lines3 } = await supabase.from('purchase_lines').select('id').eq('purchase_id', purchaseId3);

    lines3?.forEach(l => {
      if (!createdIds.purchase_lines.includes(l.id)) {
        createdIds.purchase_lines.push(l.id);
      }
    });

    if ((lines3?.length || 0) !== 3) {
      throw new Error(`Recovery failed: expected 3, got ${lines3?.length}`);
    }
    console.log(`✓ Missing line recovered\n`);

    // CLEANUP
    console.log('CLEANUP: Deleting test records...');
    for (const lineId of createdIds.purchase_lines) {
      await supabase.from('purchase_lines').delete().eq('id', lineId);
    }
    for (const purchaseId of createdIds.purchases) {
      await supabase.from('purchases').delete().eq('id', purchaseId);
    }
    for (const extractionId of createdIds.extractions) {
      await supabase.from('document_extractions').delete().eq('id', extractionId);
    }
    for (const docId of createdIds.documents) {
      await supabase.from('documents').delete().eq('id', docId);
    }
    for (const supplierId of createdIds.suppliers) {
      await supabase.from('suppliers').delete().eq('id', supplierId);
    }

    console.log(`✓ All test records deleted\n`);
    console.log('=== PERSISTENCE TEST PASSED ===\n');
    console.log('Summary:');
    console.log('  ✓ New purchase with 3 lines created');
    console.log('  ✓ Reintent returned same purchase without duplicating');
    console.log('  ✓ Partial lines recovered successfully');
    console.log('  ✓ All test records cleaned up (isolated)\n');

  } catch (error) {
    console.error(`\n❌ TEST FAILED: ${error.message}\n`);

    // Emergency cleanup
    console.log('Attempting emergency cleanup...');
    for (const lineId of createdIds.purchase_lines) {
      try {
        await supabase.from('purchase_lines').delete().eq('id', lineId);
      } catch (e) {}
    }
    for (const purchaseId of createdIds.purchases) {
      try {
        await supabase.from('purchases').delete().eq('id', purchaseId);
      } catch (e) {}
    }
    for (const supplierId of createdIds.suppliers) {
      try {
        await supabase.from('suppliers').delete().eq('id', supplierId);
      } catch (e) {}
    }
    process.exit(1);
  }
})();
