/**
 * Coordinate field normalization utilities
 * Prevents drift between lon/lng field naming
 */

export function normalizeLngLat<T extends { lat?: number; lng?: number; lon?: number }>(p: T): Omit<T, 'lon'> & { lng?: number } {
  const lng = p.lng ?? (p as any).lon;
  const { lon, ...rest } = p;  // Remove lon field
  return { ...rest, lng };
}

/**
 * Normalize an array of coordinate objects
 */
export function normalizeLngLatArray<T extends { lat?: number; lng?: number; lon?: number }>(
  items: T[]
): Array<Omit<T, 'lon'> & { lng?: number }> {
  return items.map(normalizeLngLat);
}

/**
 * Type guard to check if object has coordinate fields
 */
export function hasCoordinates(obj: any): obj is { lat: number; lng: number } {
  return typeof obj?.lat === 'number' && typeof obj?.lng === 'number';
}
