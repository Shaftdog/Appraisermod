export interface HiLoSettings {
  centerBasis: 'medianTimeAdj' | 'weightedPrimaries' | 'model';
  boxPct: number;                  // ±% around center
  maxSales: number;                // 10..15
  maxListings: number;             // 5..10
  filters: {
    insidePolygonOnly: boolean;
    statuses: Array<'sold'|'active'|'pending'|'expired'>;
  };
  weights: { distance: number; recency: number; gla: number; quality: number; condition: number; loc: number };
}

export interface HiLoRange {
  center: number;
  lo: number;
  hi: number;
  effectiveDateISO: string;
  basis: 'salePrice'|'ppsf';
}

export interface RankedCompScore {
  compId: string;
  type: 'sale'|'listing';
  insideBox: boolean;
  insidePolygon: boolean;
  timeAdjustedValue?: number; // sale price or $/SF depending on basis
  score: number;              // 0..1
  reasons: Array<{ key: keyof HiLoSettings['weights']; similarity: number; weight: number; contribution: number }>;
}

export interface HiLoResult {
  range: HiLoRange;
  ranked: RankedCompScore[];
  selectedSales: string[];      // top N inside box
  selectedListings: string[];   // top M inside box
  primaries: string[];          // top 3 sales
  listingPrimaries: string[];   // top 2 listings
  generatedAt: string;
}

export interface HiLoState {
  orderId: string;
  settings: HiLoSettings;
  result?: HiLoResult;
  updatedAt: string;
}
