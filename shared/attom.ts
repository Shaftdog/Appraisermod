export interface AttomProperty {
  attomId?: string;
  apn?: string;
  address: { line1?: string; city?: string; state?: string; zip?: string };
  location?: { lat?: number; lon?: number };
  char?: { yearBuilt?: number; sqft?: number; lotSizeSqft?: number; beds?: number; baths?: number };
  assessment?: { landValue?: number; improvementValue?: number; totalValue?: number; taxYear?: number };
  lastSale?: { price?: number; date?: string; docNum?: string };
}

export interface ParcelShape {
  apn?: string;
  wkt?: string;         // store WKT or GeoJSON; v1 keep WKT string for simplicity
  bbox?: number[];      // [minX,minY,maxX,maxY]
}

export interface ClosedSale {
  id: string; // Stable unique identifier for backend tracking
  apn?: string;
  address: string;
  city?: string; 
  state?: string; 
  zip?: string;
  closeDate: string;
  closePrice: number;
  gla?: number;
  lotSizeSqft?: number;
  lat?: number; 
  lon?: number;
}