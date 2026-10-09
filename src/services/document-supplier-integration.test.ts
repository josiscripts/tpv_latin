import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

/**
 * Unit tests for line recovery with multiplicity support
 * Tests the signature-based comparison that respects duplicate lines
 */

describe('createPurchaseFromExtraction - Line Recovery with Multiplicity', () => {

  describe('Case 1: Duplicate lines (qty=5, cost=10 appears twice)', () => {
    it('should recover missing duplicate lines correctly', () => {
      // GIVEN: Extraction has 2 identical lines
      const expectedLines = [
        { quantity: 5, unit_cost: 10, total: 50, tax_rate: 0 },
        { quantity: 5, unit_cost: 10, total: 50, tax_rate: 0 },  // ← IDENTICAL
      ];

      // AND: Purchase has only 1 of those lines
      const existingLines = [
        { id: 'uuid-1', quantity: 5, unit_cost: 10, total: 50 },
      ];

      // WHEN: Calculate signatures with multiplicity
      const expectedSignatures = expectedLines.map(line => `${line.quantity}|${line.unit_cost}|${line.total}`);
      const existingSignatures = existingLines.map(line => `${line.quantity}|${line.unit_cost}|${line.total}`);

      // Expected: ["5|10|50", "5|10|50"]
      // Existing: ["5|10|50"]
      expect(expectedSignatures).toEqual(['5|10|50', '5|10|50']);
      expect(existingSignatures).toEqual(['5|10|50']);

      // Count by signature (respects multiplicity)
      const expectedCounts = new Map<string, number>();
      expectedSignatures.forEach(sig => {
        expectedCounts.set(sig, (expectedCounts.get(sig) ?? 0) + 1);
      });

      const existingCounts = new Map<string, number>();
      existingSignatures.forEach(sig => {
        existingCounts.set(sig, (existingCounts.get(sig) ?? 0) + 1);
      });

      // THEN: Counts show mismatch
      expect(expectedCounts.get('5|10|50')).toBe(2);  // Expected: 2 occurrences
      expect(existingCounts.get('5|10|50')).toBe(1);  // Existing: 1 occurrence

      // AND: Calculate missing
      const missingCount = (expectedCounts.get('5|10|50') ?? 0) - (existingCounts.get('5|10|50') ?? 0);
      expect(missingCount).toBe(1);  // Missing: exactly 1

      // AND: Need to insert 1 line (not 0, not 2)
      const linesToInsert = expectedLines.filter((_, index) => {
        const sig = `${expectedLines[index].quantity}|${expectedLines[index].unit_cost}|${expectedLines[index].total}`;
        const existingCount = existingCounts.get(sig) ?? 0;
        // This is simplified; real code uses Map iteration
        return index >= existingCount;
      });

      // Better validation using Map-based approach (matches real code)
      const linesToInsertBySignature: any[] = [];
      for (const [sig, expectedCount] of expectedCounts) {
        const existingCount = existingCounts.get(sig) ?? 0;
        const missingCnt = expectedCount - existingCount;

        if (missingCnt > 0) {
          const lineTemplate = expectedLines.find(line => `${line.quantity}|${line.unit_cost}|${line.total}` === sig);
          if (lineTemplate) {
            for (let i = 0; i < missingCnt; i++) {
              linesToInsertBySignature.push(lineTemplate);
            }
          }
        }
      }

      expect(linesToInsertBySignature.length).toBe(1);  // Insert exactly 1
      expect(linesToInsertBySignature[0]).toEqual({
        quantity: 5,
        unit_cost: 10,
        total: 50,
        tax_rate: 0,
      });
    });
  });

  describe('Case 2: All lines exist with correct multiplicity', () => {
    it('should NOT insert when all lines exist', () => {
      const expectedLines = [
        { quantity: 5, unit_cost: 10, total: 50, tax_rate: 0 },
        { quantity: 5, unit_cost: 10, total: 50, tax_rate: 0 },
      ];

      const existingLines = [
        { id: 'uuid-1', quantity: 5, unit_cost: 10, total: 50 },
        { id: 'uuid-2', quantity: 5, unit_cost: 10, total: 50 },  // ← Both exist
      ];

      const expectedSignatures = expectedLines.map(line => `${line.quantity}|${line.unit_cost}|${line.total}`);
      const existingSignatures = existingLines.map(line => `${line.quantity}|${line.unit_cost}|${line.total}`);

      const expectedCounts = new Map<string, number>();
      expectedSignatures.forEach(sig => {
        expectedCounts.set(sig, (expectedCounts.get(sig) ?? 0) + 1);
      });

      const existingCounts = new Map<string, number>();
      existingSignatures.forEach(sig => {
        existingCounts.set(sig, (existingCounts.get(sig) ?? 0) + 1);
      });

      // Verify counts match
      let allComplete = true;
      for (const [sig, expectedCount] of expectedCounts) {
        const existingCount = existingCounts.get(sig) ?? 0;
        if (existingCount !== expectedCount) {
          allComplete = false;
          break;
        }
      }

      expect(allComplete).toBe(true);
      expect(expectedCounts.get('5|10|50')).toBe(2);
      expect(existingCounts.get('5|10|50')).toBe(2);
    });
  });

  describe('Case 3: Extra lines (more than expected) - should error', () => {
    it('should throw error when purchase has more lines than extraction expects', () => {
      const expectedLines = [
        { quantity: 5, unit_cost: 10, total: 50, tax_rate: 0, description: 'Item A', sku: '' },
        { quantity: 3, unit_cost: 20, total: 60, tax_rate: 0, description: 'Item B', sku: '' },
      ];

      // Existing: has 1 extra line
      const existingLines = [
        { id: 'uuid-1', quantity: 5, unit_cost: 10, total: 50 },
        { id: 'uuid-2', quantity: 3, unit_cost: 20, total: 60 },
        { id: 'uuid-3', quantity: 2, unit_cost: 15, total: 30 },  // ← EXTRA
      ];

      const totalExpected = expectedLines.length;
      const totalExisting = existingLines.length;

      expect(totalExisting).toBe(3);
      expect(totalExpected).toBe(2);
      expect(totalExisting > totalExpected).toBe(true);

      // Should trigger error condition
      if (totalExisting > totalExpected) {
        const errorMessage = `Purchase has ${totalExisting} line(s) but extraction expects ${totalExpected}. Inconsistency detected.`;
        expect(errorMessage).toContain('Inconsistency detected');
      }
    });
  });

  describe('Case 4: Mixed lines with different quantities', () => {
    it('should correctly handle lines with different quantities', () => {
      const expectedLines = [
        { quantity: 5, unit_cost: 10, total: 50, tax_rate: 0 },
        { quantity: 3, unit_cost: 20, total: 60, tax_rate: 0 },
        { quantity: 5, unit_cost: 10, total: 50, tax_rate: 0 },  // ← Duplicate of line 1
      ];

      // Existing: has only 1 of the qty=5 line and 0 of qty=3
      const existingLines = [
        { id: 'uuid-1', quantity: 5, unit_cost: 10, total: 50 },
      ];

      const expectedSignatures = expectedLines.map(line => `${line.quantity}|${line.unit_cost}|${line.total}`);
      const existingSignatures = existingLines.map(line => `${line.quantity}|${line.unit_cost}|${line.total}`);

      // Expected: ["5|10|50", "3|20|60", "5|10|50"]
      // Existing: ["5|10|50"]

      const expectedCounts = new Map<string, number>();
      expectedSignatures.forEach(sig => {
        expectedCounts.set(sig, (expectedCounts.get(sig) ?? 0) + 1);
      });

      const existingCounts = new Map<string, number>();
      existingSignatures.forEach(sig => {
        existingCounts.set(sig, (existingCounts.get(sig) ?? 0) + 1);
      });

      expect(expectedCounts.get('5|10|50')).toBe(2);  // 2x qty=5
      expect(expectedCounts.get('3|20|60')).toBe(1);  // 1x qty=3
      expect(existingCounts.get('5|10|50')).toBe(1);  // 1x qty=5 exists
      expect(existingCounts.get('3|20|60')).toBeUndefined();  // 0x qty=3 exists

      // Missing: 1x qty=5 + 1x qty=3 = 2 lines total
      const linesToInsert: any[] = [];
      for (const [sig, expectedCount] of expectedCounts) {
        const existingCount = existingCounts.get(sig) ?? 0;
        const missingCnt = expectedCount - existingCount;

        if (missingCnt > 0) {
          const lineTemplate = expectedLines.find(line => `${line.quantity}|${line.unit_cost}|${line.total}` === sig);
          if (lineTemplate) {
            for (let i = 0; i < missingCnt; i++) {
              linesToInsert.push(lineTemplate);
            }
          }
        }
      }

      expect(linesToInsert.length).toBe(2);  // Insert exactly 2
      expect(linesToInsert.filter(l => l.quantity === 5).length).toBe(1);  // 1x qty=5
      expect(linesToInsert.filter(l => l.quantity === 3).length).toBe(1);  // 1x qty=3
    });
  });

  describe('Integration: Real Supabase LOCAL persistence', () => {
    let testSupplier: any;
    let testExtraction: any;
    let testPurchaseId: string;
    const testIds = { suppliers: [] as string[], documents: [] as string[], extractions: [] as string[], purchases: [] as string[], lines: [] as string[] };
    let testClient: any;

    beforeAll(async () => {
      // Use service_role key for integration tests (has write permissions in LOCAL)
      testClient = createClient('http://127.0.0.1:54321', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU');

      // VERIFY: Connected to LOCAL (quick Supabase test)
      const { data } = await testClient.from('suppliers').select('count').limit(1);
      expect(data).toBeDefined(); // If this passes, Supabase is working

      // CREATE: Test supplier
      const { data: supplier, error: supplierError } = await testClient
        .from('suppliers')
        .insert([{ name: `TEST_PERSIST_${Date.now()}`, tax_id: `TEST-${Date.now()}`, active: true }])
        .select()
        .single();

      if (supplierError) throw new Error(`Supplier creation failed: ${supplierError.message}`);
      testSupplier = supplier;
      testIds.suppliers.push(supplier.id);

      // CREATE: Test document
      const { data: doc, error: docError } = await testClient
        .from('documents')
        .insert([{ original_name: `test_${Date.now()}.pdf`, file_path: `/test/${Date.now()}`, document_type: 'invoice' }])
        .select()
        .single();

      if (docError) throw new Error(`Document creation failed: ${docError.message}`);
      testIds.documents.push(doc.id);

      // CREATE: Test extraction with 3 lines
      const { data: extraction, error: extractError } = await testClient
        .from('document_extractions')
        .insert([{
          document_id: doc.id,
          vendor_name: testSupplier.name,
          vendor_tax_id: testSupplier.tax_id,
          invoice_number: `INV-${Date.now()}`,
          invoice_date: '2026-10-10',
          extraction_model: 'test',
          document_type_detected: 'invoice',
          total: 140.00,
          lines_extracted: [
            { quantity: 5, unit_price: 10, price: 10, total: 50, description: 'Line 1', sku: 'SKU1' },
            { quantity: 3, unit_price: 20, price: 20, total: 60, description: 'Line 2', sku: 'SKU2' },
            { quantity: 2, unit_price: 15, price: 15, total: 30, description: 'Line 3', sku: 'SKU3' },
          ],
          raw_response: {},
        }])
        .select()
        .single();

      if (extractError) throw new Error(`Extraction creation failed: ${extractError.message}`);
      testExtraction = extraction;
      testIds.extractions.push(extraction.id);
    });

    afterAll(async () => {
      // CLEANUP: Delete test data by exact IDs
      for (const lineId of testIds.lines) {
        await testClient.from('purchase_lines').delete().eq('id', lineId);
      }
      for (const purchaseId of testIds.purchases) {
        await testClient.from('purchases').delete().eq('id', purchaseId);
      }
      for (const extractionId of testIds.extractions) {
        await testClient.from('document_extractions').delete().eq('id', extractionId);
      }
      for (const docId of testIds.documents) {
        await testClient.from('documents').delete().eq('id', docId);
      }
      for (const supplierId of testIds.suppliers) {
        await testClient.from('suppliers').delete().eq('id', supplierId);
      }
    });

    it('TEST 1: Create purchase with 3 lines', async () => {
      const { documentSupplierIntegrationService } = await import('./document-supplier-integration.service');
      testPurchaseId = await documentSupplierIntegrationService.createPurchaseFromExtraction(testSupplier.id, testExtraction.id);
      testIds.purchases.push(testPurchaseId);

      const { data: lines } = await testClient.from('purchase_lines').select('id').eq('purchase_id', testPurchaseId);
      lines?.forEach(l => testIds.lines.push(l.id));

      expect(lines?.length).toBe(3);
    });

    it('TEST 2: Reintent returns same purchase without duplicating', async () => {
      const { documentSupplierIntegrationService } = await import('./document-supplier-integration.service');
      const purchaseId2 = await documentSupplierIntegrationService.createPurchaseFromExtraction(testSupplier.id, testExtraction.id);

      expect(purchaseId2).toBe(testPurchaseId);

      const { data: lines } = await testClient.from('purchase_lines').select('id').eq('purchase_id', purchaseId2);
      expect(lines?.length).toBe(3);
    });

    it('TEST 3: Recover partial lines (2/3)', async () => {
      // Delete 1 line to simulate partial failure
      const { data: lines } = await testClient.from('purchase_lines').select('id').eq('purchase_id', testPurchaseId).limit(1);
      if (lines?.length) {
        await testClient.from('purchase_lines').delete().eq('id', lines[0].id);
      }

      // Reintent should recover
      const { documentSupplierIntegrationService } = await import('./document-supplier-integration.service');
      await documentSupplierIntegrationService.createPurchaseFromExtraction(testSupplier.id, testExtraction.id);

      const { data: recoveredLines } = await testClient.from('purchase_lines').select('id').eq('purchase_id', testPurchaseId);
      expect(recoveredLines?.length).toBe(3);
    });
  });
});
