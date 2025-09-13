import { distance, booleanPointInPolygon, area, point } from "@turf/turf";
import type { LatLng, MarketPolygon } from "./schema";

/**
 * Calculate distance in miles between two lat/lng points
 */
export function distanceMiles(from: LatLng, to: LatLng): number {
  const fromPoint = point([from.lng, from.lat]);
  const toPoint = point([to.lng, to.lat]);
  
  const distanceKm = distance(fromPoint, toPoint, { units: 'kilometers' });
  return distanceKm * 0.621371; // Convert km to miles
}

/**
 * Check if a point is inside a polygon
 */
export function isInsidePolygon(pointCoords: LatLng, polygon: MarketPolygon): boolean {
  try {
    const turfPoint = point([pointCoords.lng, pointCoords.lat]);
    return booleanPointInPolygon(turfPoint, polygon.geometry);
  } catch (error) {
    // If polygon operations fail, default to true (include the point)
    return true;
  }
}

/**
 * Calculate polygon area in acres
 */
export function polygonAreaAcres(polygon: MarketPolygon): number {
  const areaSqMeters = area(polygon);
  const areaSqFeet = areaSqMeters * 10.7639; // Convert sq meters to sq feet
  return areaSqFeet / 43560; // Convert sq feet to acres
}