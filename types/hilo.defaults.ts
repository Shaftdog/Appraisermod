export const DEFAULT_HILO_SETTINGS: import('./hilo').HiLoSettings = {
  centerBasis: 'medianTimeAdj',
  boxPct: 10,
  maxSales: 12,
  maxListings: 6,
  filters: { insidePolygonOnly: true, statuses: ['sold','active','pending'] },
  weights: { distance: 0.25, recency: 0.20, gla: 0.20, quality: 0.15, condition: 0.10, loc: 0.10 }
};
