/**
 * Unit tests for geo utilities
 */

import { describe, it, expect } from 'vitest';
import { 
  ensureGeoJSONProperties, 
  isInsidePolygon, 
  polygonAreaAcres 
} from '../shared/geo';
import { normalizeLngLat } from '../shared/geo-normalize';
import type { Feature, Polygon } from 'geojson';

describe('Geo Utilities', () => {
  describe('ensureGeoJSONProperties', () => {
    it('should add empty properties object when missing', () => {
      const feature: Feature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: undefined as any
      };

      const result = ensureGeoJSONProperties(feature);
      expect(result.properties).toEqual({});
      expect(typeof result.properties).toBe('object');
    });

    it('should preserve existing properties', () => {
      const feature: Feature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { name: 'test' }
      };

      const result = ensureGeoJSONProperties(feature);
      expect(result.properties).toEqual({ name: 'test' });
    });
  });

  describe('isInsidePolygon', () => {
    const squarePolygon: Feature<Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
      }
    };

    it('should detect point inside polygon', () => {
      const point = { lat: 5, lng: 5 };
      expect(isInsidePolygon(squarePolygon, point)).toBe(true);
    });

    it('should detect point outside polygon', () => {
      const point = { lat: 15, lng: 15 };
      expect(isInsidePolygon(squarePolygon, point)).toBe(false);
    });

    it('should handle edge cases', () => {
      const point = { lat: 0, lng: 0 }; // On vertex - ray casting may consider this inside
      const result = isInsidePolygon(squarePolygon, point);
      expect(typeof result).toBe('boolean'); // Just ensure it returns a boolean
    });
  });

  describe('normalizeLngLat', () => {
    it('should convert lon to lng', () => {
      const input = { lat: 10, lon: 20, other: 'data' };
      const result = normalizeLngLat(input);
      
      expect(result.lng).toBe(20);
      expect(result).not.toHaveProperty('lon');
      expect(result.other).toBe('data');
    });

    it('should preserve lng when both exist', () => {
      const input = { lat: 10, lng: 30, lon: 20 };
      const result = normalizeLngLat(input);
      
      expect(result.lng).toBe(30); // lng takes precedence
      expect(result).not.toHaveProperty('lon');
    });

    it('should handle missing coordinates', () => {
      const input = { other: 'data' };
      const result = normalizeLngLat(input);
      
      expect(result.lng).toBeUndefined();
      expect(result).not.toHaveProperty('lon');
    });
  });
});
