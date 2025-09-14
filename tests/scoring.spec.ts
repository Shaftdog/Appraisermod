/**
 * Unit tests for scoring system
 */

import { describe, it, expect } from 'vitest';
import { 
  validateWeightsSum, 
  validateScoreConsistency, 
  createScorePart, 
  normalizeWeights 
} from '../shared/scoring-types';
import type { ScoreBreakdown } from '../shared/scoring-types';

describe('Scoring System', () => {
  describe('createScorePart', () => {
    it('should create valid score part', () => {
      const part = createScorePart(0.8, 0.3);
      
      expect(part.similarity).toBe(0.8);
      expect(part.weight).toBe(0.3);
      expect(part.contribution).toBe(0.24); // 0.8 * 0.3
    });

    it('should clamp similarity to [0,1]', () => {
      const part1 = createScorePart(-0.5, 0.3);
      const part2 = createScorePart(1.5, 0.3);
      
      expect(part1.similarity).toBe(0);
      expect(part2.similarity).toBe(1);
    });

    it('should ensure non-negative weights', () => {
      const part = createScorePart(0.8, -0.1);
      expect(part.weight).toBe(0);
    });
  });

  describe('normalizeWeights', () => {
    it('should normalize weights to sum to 1.0', () => {
      const weights = { a: 2, b: 3, c: 5 };
      const normalized = normalizeWeights(weights);
      
      expect(normalized.a).toBe(0.2); // 2/10
      expect(normalized.b).toBe(0.3); // 3/10
      expect(normalized.c).toBe(0.5); // 5/10
      
      const sum = Object.values(normalized).reduce((s, w) => s + w, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('should handle zero weights by distributing equally', () => {
      const weights = { a: 0, b: 0, c: 0 };
      const normalized = normalizeWeights(weights);
      
      expect(normalized.a).toBeCloseTo(1/3, 10);
      expect(normalized.b).toBeCloseTo(1/3, 10);
      expect(normalized.c).toBeCloseTo(1/3, 10);
    });
  });

  describe('validateWeightsSum', () => {
    it('should validate weights sum to 1.0', () => {
      const breakdown: ScoreBreakdown = {
        distance: createScorePart(0.8, 0.25),
        recency: createScorePart(0.9, 0.25),
        gla: createScorePart(0.7, 0.25),
        quality: createScorePart(0.6, 0.25),
        condition: createScorePart(0.5, 0.0)
      };

      expect(validateWeightsSum(breakdown)).toBe(true);
    });

    it('should reject invalid weight sums', () => {
      const breakdown: ScoreBreakdown = {
        distance: createScorePart(0.8, 0.5),
        recency: createScorePart(0.9, 0.5),
        gla: createScorePart(0.7, 0.5),
        quality: createScorePart(0.6, 0.5),
        condition: createScorePart(0.5, 0.5)
      };

      expect(validateWeightsSum(breakdown)).toBe(false);
    });
  });

  describe('validateScoreConsistency', () => {
    it('should validate score equals sum of contributions', () => {
      const breakdown: ScoreBreakdown = {
        distance: createScorePart(0.8, 0.3),
        recency: createScorePart(0.9, 0.3),
        gla: createScorePart(0.7, 0.2),
        quality: createScorePart(0.6, 0.1),
        condition: createScorePart(0.5, 0.1)
      };

      const expectedScore = 0.8*0.3 + 0.9*0.3 + 0.7*0.2 + 0.6*0.1 + 0.5*0.1; // 0.76
      expect(validateScoreConsistency(expectedScore, breakdown)).toBe(true);
    });

    it('should detect inconsistent scores', () => {
      const breakdown: ScoreBreakdown = {
        distance: createScorePart(0.8, 0.5),
        recency: createScorePart(0.9, 0.5),
        gla: createScorePart(0.7, 0.0),
        quality: createScorePart(0.6, 0.0),
        condition: createScorePart(0.5, 0.0)
      };

      // Score doesn't match contributions
      expect(validateScoreConsistency(0.5, breakdown)).toBe(false);
    });
  });
});
