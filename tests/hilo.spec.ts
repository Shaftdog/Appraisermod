import { describe, it, expect } from 'vitest';
import { DEFAULT_HILO_SETTINGS } from '../types/hilo.defaults';
import { 
  rankCandidatesForHiLo, 
  calculateCenterValue, 
  computeHiLoRange,
  calculateTimeAdjustedValue,
  type HiLoCandidate,
  type HiLoComputeContext
} from '../shared/hilo-utils';

describe('Hi-Lo selection', () => {
  const mockEffectiveDate = '2025-01-01T00:00:00.000Z';
  const mockPctPerMonth = 0.005; // 0.5% per month

  const createMockCandidate = (
    id: string,
    salePrice: number,
    saleDate: string,
    gla: number = 2000,
    insidePolygon: boolean = true
  ): HiLoCandidate => ({
    id,
    type: 'sale',
    salePrice,
    saleDate,
    gla,
    insidePolygon,
    distanceMiles: 0.5,
    monthsSinceSale: 3,
    quality: 4,
    condition: 4
  });

  const createMockContext = (
    center: number,
    boxPct: number = 10
  ): HiLoComputeContext => ({
    center,
    boxPct,
    effectiveDateISO: mockEffectiveDate,
    basis: 'salePrice',
    pctPerMonth: mockPctPerMonth,
    settings: DEFAULT_HILO_SETTINGS,
    subjectGla: 2000,
    subjectQuality: 4,
    subjectCondition: 4
  });

  describe('computeHiLoRange', () => {
    it('computes lo/hi bounds from center and boxPct', () => {
      const center = 400000;
      const boxPct = 10;
      const range = computeHiLoRange(center, boxPct, mockEffectiveDate, 'salePrice');
      
      expect(range.center).toBe(400000);
      expect(range.lo).toBe(360000); // 400000 * 0.9
      expect(range.hi).toBeCloseTo(440000); // 400000 * 1.1
      expect(range.basis).toBe('salePrice');
      expect(range.effectiveDateISO).toBe(mockEffectiveDate);
    });

    it('handles different box percentages', () => {
      const center = 500000;
      const boxPct = 15;
      const range = computeHiLoRange(center, boxPct, mockEffectiveDate, 'ppsf');
      
      expect(range.lo).toBe(425000); // 500000 * 0.85
      expect(range.hi).toBe(575000); // 500000 * 1.15
      expect(range.basis).toBe('ppsf');
    });
  });

  describe('calculateTimeAdjustedValue', () => {
    it('adjusts sale price based on time', () => {
      const candidate = createMockCandidate('A', 400000, '2024-10-01T00:00:00.000Z');
      
      // 3 months ago, 0.5% per month = 1.5% total adjustment
      const adjustedValue = calculateTimeAdjustedValue(
        candidate,
        mockEffectiveDate,
        mockPctPerMonth,
        'salePrice'
      );
      
      expect(adjustedValue).toBeCloseTo(406030, 0); // 400000 * (1.005^3)
    });

    it('returns null for $/SF basis without GLA', () => {
      const candidate = createMockCandidate('A', 400000, '2024-10-01T00:00:00.000Z', 0);
      
      const adjustedValue = calculateTimeAdjustedValue(
        candidate,
        mockEffectiveDate,
        mockPctPerMonth,
        'ppsf'
      );
      
      expect(adjustedValue).toBeNull();
    });

    it('calculates $/SF with valid GLA', () => {
      const candidate = createMockCandidate('A', 400000, '2024-10-01T00:00:00.000Z', 2000);
      
      const adjustedValue = calculateTimeAdjustedValue(
        candidate,
        mockEffectiveDate,
        mockPctPerMonth,
        'ppsf'
      );
      
      // Adjusted price: 406030, $/SF: 406030 / 2000 = 203.015
      expect(adjustedValue).toBeCloseTo(203.015, 2);
    });
  });

  describe('calculateCenterValue', () => {
    const candidates = [
      createMockCandidate('A', 380000, '2024-10-01T00:00:00.000Z'),
      createMockCandidate('B', 420000, '2024-10-01T00:00:00.000Z'),
      createMockCandidate('C', 400000, '2024-10-01T00:00:00.000Z'),
      createMockCandidate('D', 390000, '2024-10-01T00:00:00.000Z', 2000, false), // outside polygon
    ];

    it('calculates median time-adjusted value', () => {
      const context = {
        effectiveDateISO: mockEffectiveDate,
        basis: 'salePrice' as const,
        pctPerMonth: mockPctPerMonth,
        settings: DEFAULT_HILO_SETTINGS,
        subjectGla: 2000,
        subjectQuality: 4,
        subjectCondition: 4
      };

      const center = calculateCenterValue(candidates, 'medianTimeAdj', context);
      
      // Should be median of time-adjusted values
      // All candidates adjusted by ~1.5% (3 months * 0.5%)
      expect(center).toBeGreaterThan(400000);
      expect(center).toBeLessThan(410000);
    });

    it('respects inside polygon filter', () => {
      const settings = {
        ...DEFAULT_HILO_SETTINGS,
        filters: { ...DEFAULT_HILO_SETTINGS.filters, insidePolygonOnly: true }
      };

      const context = {
        effectiveDateISO: mockEffectiveDate,
        basis: 'salePrice' as const,
        pctPerMonth: mockPctPerMonth,
        settings,
        subjectGla: 2000,
        subjectQuality: 4,
        subjectCondition: 4
      };

      const center = calculateCenterValue(candidates, 'medianTimeAdj', context);
      
      // Should only use candidates A, B, C (inside polygon)
      expect(center).toBeDefined();
    });

    it('falls back to all candidates when no inside polygon candidates', () => {
      const outsideCandidates = candidates.map(c => ({ ...c, insidePolygon: false }));
      
      const settings = {
        ...DEFAULT_HILO_SETTINGS,
        filters: { ...DEFAULT_HILO_SETTINGS.filters, insidePolygonOnly: true }
      };

      const context = {
        effectiveDateISO: mockEffectiveDate,
        basis: 'salePrice' as const,
        pctPerMonth: mockPctPerMonth,
        settings,
        subjectGla: 2000,
        subjectQuality: 4,
        subjectCondition: 4
      };

      const center = calculateCenterValue(outsideCandidates, 'medianTimeAdj', context);
      
      expect(center).toBeDefined();
    });
  });

  describe('rankCandidatesForHiLo', () => {
    const candidates = [
      createMockCandidate('A', 395000, '2024-10-01T00:00:00.000Z'), // inside box
      createMockCandidate('B', 460000, '2024-10-01T00:00:00.000Z'), // outside box (high)
      createMockCandidate('C', 405000, '2024-10-01T00:00:00.000Z'), // inside box
      createMockCandidate('D', 320000, '2024-10-01T00:00:00.000Z'), // outside box (low)
    ];

    it('selects only inside-box candidates and ranks by score', () => {
      const context = createMockContext(400000, 10); // center: 400k, ±10%
      
      const result = rankCandidatesForHiLo(candidates, context);
      
      // Should include all candidates in ranked list
      expect(result.ranked).toHaveLength(4);
      
      // Should select only candidates A and C (inside box)
      expect(result.selectedSales).toContain('A');
      expect(result.selectedSales).toContain('C');
      expect(result.selectedSales).not.toContain('B');
      expect(result.selectedSales).not.toContain('D');
      
      // Should have primaries from selected sales
      expect(result.primaries).toHaveLength(Math.min(2, 3)); // min of selected sales count and max primaries
      expect(result.primaries.every(id => result.selectedSales.includes(id))).toBe(true);
    });

    it('respects maxSales and maxListings limits', () => {
      const settings = {
        ...DEFAULT_HILO_SETTINGS,
        maxSales: 1,
        maxListings: 0
      };

      const context = {
        ...createMockContext(400000, 10),
        settings
      };
      
      const result = rankCandidatesForHiLo(candidates, context);
      
      expect(result.selectedSales).toHaveLength(1);
      expect(result.selectedListings).toHaveLength(0);
      expect(result.primaries).toHaveLength(1);
    });

    it('filters by polygon when insidePolygonOnly is true', () => {
      const mixedCandidates = [
        createMockCandidate('A', 395000, '2024-10-01T00:00:00.000Z', 2000, true),  // inside polygon
        createMockCandidate('B', 405000, '2024-10-01T00:00:00.000Z', 2000, false), // outside polygon
      ];

      const settings = {
        ...DEFAULT_HILO_SETTINGS,
        filters: { ...DEFAULT_HILO_SETTINGS.filters, insidePolygonOnly: true }
      };

      const context = {
        ...createMockContext(400000, 10),
        settings
      };
      
      const result = rankCandidatesForHiLo(mixedCandidates, context);
      
      // Should only include candidate A in ranked results
      expect(result.ranked).toHaveLength(1);
      expect(result.ranked[0].compId).toBe('A');
    });

    it('calculates score reasons correctly', () => {
      const context = createMockContext(400000, 10);
      
      const result = rankCandidatesForHiLo([candidates[0]], context);
      
      expect(result.ranked[0].reasons).toBeDefined();
      expect(result.ranked[0].reasons).toHaveLength(6); // distance, recency, gla, quality, condition, loc
      
      const reasons = result.ranked[0].reasons;
      expect(reasons.every(r => r.similarity >= 0 && r.similarity <= 1)).toBe(true);
      expect(reasons.every(r => r.weight >= 0 && r.weight <= 1)).toBe(true);
      expect(reasons.every(r => r.contribution >= 0)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty candidate list', () => {
      const context = createMockContext(400000, 10);
      
      expect(() => {
        calculateCenterValue([], 'medianTimeAdj', context);
      }).toThrow('No valid candidates for center calculation');
    });

    it('handles single candidate', () => {
      const candidate = createMockCandidate('A', 400000, '2024-10-01T00:00:00.000Z');
      const context = createMockContext(400000, 10);
      
      const result = rankCandidatesForHiLo([candidate], context);
      
      expect(result.ranked).toHaveLength(1);
      expect(result.selectedSales).toHaveLength(1);
      expect(result.primaries).toHaveLength(1);
    });

    it('handles zero box percentage', () => {
      const range = computeHiLoRange(400000, 0, mockEffectiveDate, 'salePrice');
      
      expect(range.lo).toBe(400000);
      expect(range.hi).toBe(400000);
    });
  });
});
