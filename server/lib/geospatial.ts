import * as turf from '@turf/turf';
import type { MarketPolygon, LatLng } from '@shared/schema';

export function isPointInPolygon(point: LatLng, polygon: MarketPolygon): boolean {
  const turfPoint = turf.point([point.lng, point.lat]);
  const turfPolygon = turf.polygon(polygon.geometry.coordinates);
  return turf.booleanPointInPolygon(turfPoint, turfPolygon);
}

export function findSubmarketForPoint(
  point: LatLng,
  submarkets: Array<{ id: string; polygon: MarketPolygon }>
): string | null {
  for (const submarket of submarkets) {
    if (isPointInPolygon(point, submarket.polygon)) {
      return submarket.id;
    }
  }
  return null;
}
