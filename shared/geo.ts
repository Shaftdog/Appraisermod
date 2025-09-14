/**
 * GeoJSON/Leaflet typing adapters and utilities
 * Centralizes geo operations and fixes type mismatches
 */

import type { Feature, Polygon } from 'geojson';
import type { MarketPolygon } from './schema';

/**
 * Convert Leaflet polygon rings to GeoJSON Feature
 */
export function leafletPolygonToGeoJSON(rings: Array<Array<{ lat: number; lng: number }>>): Feature<Polygon> {
  const coords = rings.map(r => r.map(p => [p.lng, p.lat]));
  return { 
    type: 'Feature', 
    properties: {}, // Always provide empty object for compatibility
    geometry: { 
      type: 'Polygon', 
      coordinates: [coords[0]] 
    } 
  };
}

/**
 * Point-in-polygon check with safe GeoJSON handling
 * Uses ray-casting algorithm for reliable results
 */
export function isInsidePolygon(poly: Feature<Polygon>, point: { lat: number; lng: number }): boolean {
  // Ensure properties exists for GeoJSON compatibility
  if (!poly.properties) {
    poly.properties = {};
  }

  const coordinates = poly.geometry.coordinates[0]; // First ring (exterior)
  if (!coordinates || coordinates.length < 3) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
    const xi = coordinates[i][0], yi = coordinates[i][1];
    const xj = coordinates[j][0], yj = coordinates[j][1];
    
    const intersect = ((yi > point.lat) !== (yj > point.lat)) && 
                     (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Ensure GeoJSON Feature has valid properties
 */
export function ensureGeoJSONProperties<T extends Feature>(feature: T): T & { properties: Record<string, any> } {
  return {
    ...feature,
    properties: feature.properties || {}
  };
}

/**
 * Calculate polygon area in square meters using shoelace formula
 * Fallback for when @turf/area is not available
 */
export function calculatePolygonArea(coordinates: number[][]): number {
  if (coordinates.length < 3) return 0;
  
  let area = 0;
  const n = coordinates.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coordinates[i][0] * coordinates[j][1];
    area -= coordinates[j][0] * coordinates[i][1];
  }
  
  return Math.abs(area) / 2;
}

/**
 * Convert square meters to acres
 */
export function sqMetersToAcres(sqMeters: number): number {
  return sqMeters * 0.000247105; // 1 sq meter = 0.000247105 acres
}

/**
 * Safe polygon area calculation in acres
 */
export function polygonAreaAcres(polygon: Feature<Polygon>): number {
  const safePolygon = ensureGeoJSONProperties(polygon);
  const coordinates = safePolygon.geometry.coordinates[0];
  
  if (!coordinates || coordinates.length < 3) {
    return 0;
  }

  const areaSqMeters = calculatePolygonArea(coordinates);
  return sqMetersToAcres(areaSqMeters);
}

/**
 * Legacy compatibility: Check if a point is inside a MarketPolygon
 * Adapts to the new GeoJSON-safe functions
 */
export function isPointInPolygon(
  point: { lat: number; lng: number },
  polygon: MarketPolygon
): boolean {
  try {
    // Ensure MarketPolygon has properties for GeoJSON compatibility
    const safePolygon = ensureGeoJSONProperties(polygon) as Feature<Polygon>;
    return isInsidePolygon(safePolygon, point);
  } catch (error) {
    console.warn('Point-in-polygon check failed:', error);
    return false;
  }
}