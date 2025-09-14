/**
 * Unit tests for market time adjustments compatibility
 */

import { describe, it, expect } from 'vitest';
import { 
  migrateLegacyTimeAdjustments, 
  normalizeMarketBasis 
} from '../types/compat';

describe('Market Time Adjustments', () => {
  describe('migrateLegacyTimeAdjustments', () => {
    it('should preserve V2 format when already correct', () => {
      const v2Data = {
        orderId: 'test-123',
        basis: 'salePrice' as const,
        pctPerMonth: 0.007,
        effectiveDateISO: '2025-01-01',
        computedAt: '2025-01-01T10:00:00Z'
      };

      const result = migrateLegacyTimeAdjustments(v2Data);
      expect(result.basis).toBe('salePrice');
      expect(result.pctPerMonth).toBe(0.007);
    });

    it('should migrate from legacy monthlyRate', () => {
      const legacyData = {
        orderId: 'test-123',
        monthlyRate: 0.005,
        method: 'regression',
        confidence: 0.85,
        dataPoints: 24
      };

      const result = migrateLegacyTimeAdjustments(legacyData);
      
      expect(result.pctPerMonth).toBe(0.005);
      expect(result.basis).toBe('salePrice'); // default
      expect(result.legacy?.monthlyRate).toBe(0.005);
      expect(result.legacy?.method).toBe('regression');
      expect(result.legacy?.confidence).toBe(0.85);
      expect(result.legacy?.dataPoints).toBe(24);
    });

    it('should migrate from legacy monthlyAdjustment', () => {
      const legacyData = {
        orderId: 'test-123',
        monthlyAdjustment: 0.012,
        basis: 'ppsf'
      };

      const result = migrateLegacyTimeAdjustments(legacyData);
      
      expect(result.pctPerMonth).toBe(0.012);
      expect(result.basis).toBe('ppsf');
      expect(result.legacy?.monthlyAdjustment).toBe(0.012);
    });

    it('should handle missing data with defaults', () => {
      const emptyData = { orderId: 'test-123' };
      const result = migrateLegacyTimeAdjustments(emptyData);
      
      expect(result.pctPerMonth).toBe(0);
      expect(result.basis).toBe('salePrice');
      expect(result.effectiveDateISO).toBeDefined();
      expect(result.computedAt).toBeDefined();
    });
  });

  describe('normalizeMarketBasis', () => {
    it('should normalize various basis formats', () => {
      expect(normalizeMarketBasis('salePrice')).toBe('salePrice');
      expect(normalizeMarketBasis('sale_price')).toBe('salePrice');
      expect(normalizeMarketBasis('ppsf')).toBe('ppsf');
      expect(normalizeMarketBasis('$/SF')).toBe('ppsf');
      expect(normalizeMarketBasis('psf')).toBe('ppsf');
    });

    it('should default to salePrice for unknown formats', () => {
      expect(normalizeMarketBasis('unknown')).toBe('salePrice');
      expect(normalizeMarketBasis('')).toBe('salePrice');
    });
  });
});
