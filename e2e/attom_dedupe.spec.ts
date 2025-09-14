import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock data for ATTOM API responses
const mockAttomSalesData = [
  {
    identifier: { apn: '12-34-56-789' },
    address: { 
      line1: '123 Test St', 
      city: 'Orlando', 
      state: 'FL', 
      zip: '32801' 
    },
    saleTransDate: '2024-01-15',
    saleAmount: 450000,
    building: { size: { livingsize: 2000 } },
    location: { latitude: 28.5383, longitude: -81.3792 }
  },
  {
    identifier: { apn: '98-76-54-321' },
    address: { 
      line1: '456 Sample Ave', 
      city: 'Orlando', 
      state: 'FL', 
      zip: '32802' 
    },
    saleTransDate: '2024-02-01',
    saleAmount: 525000,
    building: { size: { livingsize: 2200 } },
    location: { latitude: 28.5000, longitude: -81.4000 }
  }
];

test.describe('ATTOM Deduplication Real Integration', () => {
  let tempDataRoot: string;
  let originalEnv: any;
  
  // Mock client function for testing
  const mockClient = async (endpoint: string, key: string, params: any) => {
    if (endpoint.includes('saleshistory')) {
      return Promise.resolve({ sales: mockAttomSalesData });
    }
    return Promise.resolve({ sales: [] });
  };
  
  test.beforeEach(async () => {
    // Create isolated temp directory for each test
    tempDataRoot = mkdtempSync(join(tmpdir(), 'attom-test-'));
    
    // Store original environment
    originalEnv = { ...process.env };
    
    // Set test environment
    process.env.ATTOM_API_KEY = 'test-key-12345';
    process.env.ATTOM_DATA_ROOT = tempDataRoot;
  });

  test.afterEach(async () => {
    // Clean up temp directory
    if (existsSync(tempDataRoot)) {
      rmSync(tempDataRoot, { recursive: true, force: true });
    }
    
    // Restore original environment
    process.env = originalEnv;
  });

  test('should prevent duplicate closed sales on re-import using real importer', async () => {
    // Import the real importer function after environment is set up
    const { importClosedSales } = await import('../server/attom/importer');
    
    // First import - should add all records
    const firstResult = await importClosedSales('Orange', 12, mockClient);
    
    // Verify first import results
    expect(firstResult.county).toBe('Orange');
    expect(firstResult.added).toBe(2); // Should add 2 new records
    expect(firstResult.total).toBe(2); // Total should be 2
    expect(firstResult.file).toContain('FL_Orange.json');
    
    // Verify data file was created in our temp directory
    expect(firstResult.file).toContain(tempDataRoot);
    expect(existsSync(firstResult.file)).toBeTruthy();
    
    const firstData = JSON.parse(readFileSync(firstResult.file, 'utf8'));
    expect(firstData).toHaveLength(2);
    
    // Verify all records have stable saleIds (16-char hex)
    firstData.forEach((sale: any) => {
      expect(sale.saleId).toMatch(/^[a-f0-9]{16}$/);
      expect(sale.id).toBe(sale.saleId);
    });
    
    // Store first saleIds for comparison
    const firstSaleIds = firstData.map((sale: any) => sale.saleId).sort();

    // Second import with same mock data - should not add duplicates
    const secondResult = await importClosedSales('Orange', 12, mockClient);
    
    // Verify deduplication worked
    expect(secondResult.county).toBe('Orange');
    expect(secondResult.added).toBe(0); // Should add 0 new records (deduplication working)
    expect(secondResult.total).toBe(2); // Total should still be 2
    
    // Verify data file still contains only 2 unique records
    const secondData = JSON.parse(readFileSync(secondResult.file, 'utf8'));
    expect(secondData).toHaveLength(2);
    
    // Verify saleIds are identical (stable generation)
    const secondSaleIds = secondData.map((sale: any) => sale.saleId).sort();
    expect(secondSaleIds).toEqual(firstSaleIds);
    
    // Verify record content is preserved
    const prices = secondData.map((sale: any) => sale.closePrice).sort();
    expect(prices).toEqual([450000, 525000]);
  });

  test('should handle partial overlaps correctly with real importer', async () => {
    const { importClosedSales } = await import('../server/attom/importer');
    
    // First import
    const firstResult = await importClosedSales('Orange', 6, mockClient);
    expect(firstResult.added).toBe(2);
    expect(firstResult.total).toBe(2);
    const firstTotal = firstResult.total;

    // Modify mock to return overlapping + one new record
    const extendedMockSales = [
      ...mockAttomSalesData, // Original records (should dedupe)
      {
        identifier: { apn: '11-22-33-444' },
        address: { 
          line1: '789 New Property Ln', 
          city: 'Orlando', 
          state: 'FL', 
          zip: '32803' 
        },
        saleTransDate: '2024-03-01',
        saleAmount: 485000,
        building: { size: { livingsize: 1800 } },
        location: { latitude: 28.5100, longitude: -81.3900 }
      }
    ];
    
    // Create extended mock client for second call
    const extendedMockClient = async (endpoint: string, key: string, params: any) => {
      if (endpoint.includes('saleshistory')) {
        return Promise.resolve({ sales: extendedMockSales });
      }
      return Promise.resolve({ sales: [] });
    };

    // Second import with extended data
    const secondResult = await importClosedSales('Orange', 12, extendedMockClient);
    
    // Verify that total increases only by newly added records
    expect(secondResult.total).toBe(3); // 2 original + 1 new
    expect(secondResult.added).toBe(1); // Only 1 new record should be added
    
    // Verify the new record was added
    const secondData = JSON.parse(readFileSync(secondResult.file, 'utf8'));
    const newRecord = secondData.find((sale: any) => sale.apn === '11-22-33-444');
    expect(newRecord).toBeDefined();
    expect(newRecord.closePrice).toBe(485000);
  });

  test('should verify atomic writes with real importer', async () => {
    const { importClosedSales } = await import('../server/attom/importer');
    
    // Run import
    const result = await importClosedSales('Orange', 12, mockClient);
    
    // Verify the import succeeded
    expect(result.total).toBe(2);
    expect(existsSync(result.file)).toBeTruthy();
    
    // Verify no temp files remain after completion (proves atomic write worked)
    expect(existsSync(result.file + '.tmp')).toBeFalsy();
    
    // Verify manifest file exists (also proves atomic write of manifest)
    const manifestFile = join(tempDataRoot, 'manifest.json');
    expect(existsSync(manifestFile)).toBeTruthy();
    expect(existsSync(manifestFile + '.tmp')).toBeFalsy();
    
    // Verify file contents are valid (proves complete atomic operation)
    const data = JSON.parse(readFileSync(result.file, 'utf8'));
    expect(data).toHaveLength(2);
    
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    expect(manifest.counts.Orange).toBe(2);
  });

  test('should handle API errors gracefully with real importer', async () => {
    const { importClosedSales } = await import('../server/attom/importer');
    
    // Mock client to fail
    const failingMockClient = async () => {
      throw new Error('ATTOM API error');
    };

    // Import should complete but with no records
    const result = await importClosedSales('Orange', 12, failingMockClient);
    
    // Should handle error gracefully
    expect(result.county).toBe('Orange');
    expect(result.total).toBe(0);
    expect(result.added).toBe(0);
    
    // File should exist but be empty array
    expect(existsSync(result.file)).toBeTruthy();
    const data = JSON.parse(readFileSync(result.file, 'utf8'));
    expect(data).toEqual([]);
  });

  test('should maintain stable saleIds across multiple imports with real importer', async () => {
    const { importClosedSales } = await import('../server/attom/importer');
    
    // Run same import 3 times
    const results = [];
    for (let i = 0; i < 3; i++) {
      results.push(await importClosedSales('Orange', 12, mockClient));
    }
    
    // All should report same totals and no additional records after first
    expect(results[0].added).toBe(2);
    expect(results[1].added).toBe(0);
    expect(results[2].added).toBe(0);
    
    expect(results[0].total).toBe(2);
    expect(results[1].total).toBe(2);
    expect(results[2].total).toBe(2);
    
    // Verify all files contain identical saleIds
    const allData = results.map(r => JSON.parse(readFileSync(r.file, 'utf8')));
    const allSaleIds = allData.map(data => data.map((sale: any) => sale.saleId).sort());
    
    // All should be identical
    expect(allSaleIds[1]).toEqual(allSaleIds[0]);
    expect(allSaleIds[2]).toEqual(allSaleIds[0]);
    
    // Verify saleIds are deterministic 16-char hex
    allSaleIds[0].forEach((saleId: string) => {
      expect(saleId).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  test('should verify manifest tracking with real importer', async () => {
    const { importClosedSales } = await import('../server/attom/importer');
    
    // Run import
    const result = await importClosedSales('Orange', 12, mockClient);
    
    // The manifest should be created in the temp data root
    const manifestFile = join(tempDataRoot, 'manifest.json');
    
    // Debug: Check if file exists and log the actual temp directory structure
    console.log('Temp data root:', tempDataRoot);
    console.log('Looking for manifest at:', manifestFile);
    console.log('Manifest exists:', existsSync(manifestFile));
    
    // Verify manifest file was created
    expect(existsSync(manifestFile)).toBeTruthy();
    
    // Verify manifest content
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    expect(manifest.counts).toBeDefined();
    expect(manifest.counts.Orange).toBe(2);
    expect(manifest.lastRunISO).toBeDefined();
    
    // Verify timestamp is recent (within last minute)
    const lastRun = new Date(manifest.lastRunISO);
    const now = new Date();
    const timeDiff = now.getTime() - lastRun.getTime();
    expect(timeDiff).toBeLessThan(60000); // Less than 1 minute
  });
});