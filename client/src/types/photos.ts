/**
 * Frontend photo types aligned with backend schema
 */

export type PhotoCategory =
  | 'exteriorFront' | 'exteriorLeft' | 'exteriorRight' | 'exteriorRear'
  | 'street' | 'addressUnit'
  | 'kitchen' | 'bath' | 'living' | 'bedroom'
  | 'mechanical' | 'deficiency' | 'viewWaterfront' | 'outbuilding' | 'other';

export interface PhotoMeta {
  id: string;
  orderId: string;
  originalPath: string;
  displayPath: string;
  thumbPath: string;
  width: number;
  height: number;
  exif?: {
    takenAt?: string;
    gps?: { lat: number; lng: number };
    orientation?: number;
  };
  category?: PhotoCategory;
  caption?: string;
  masks?: {
    rects: Array<{ x: number; y: number; w: number; h: number; radius?: number }>;
    brush: Array<{ points: Array<{x: number; y: number}>; radius: number; strength: number }>;
    autoDetections?: Array<{ 
      type: 'face'; 
      x: number; 
      y: number; 
      w: number; 
      h: number; 
      accepted: boolean;
      confidence?: number;
    }>;
  };
  processing?: { 
    blurredPath?: string; 
    lastProcessedAt?: string; 
  };
  createdAt: string;
  updatedAt: string;
}

export type AddendaLayout = '2up' | '4up' | '6up';

export interface AddendaCell { 
  photoId?: string; 
  caption?: string; 
}

export interface AddendaPage { 
  id: string; 
  layout: AddendaLayout; 
  cells: AddendaCell[];
  title?: string;
}

export interface PhotoAddenda { 
  orderId: string; 
  pages: AddendaPage[]; 
  updatedAt: string; 
}

export interface PhotosQcSummary {
  requiredPresent: boolean;
  missingCategories: PhotoCategory[];
  unresolvedDetections: number;
  status: 'green' | 'yellow' | 'red';
}

// UI-specific types
export interface BlurRect {
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
}

export interface BlurBrushStroke {
  points: Array<{x: number; y: number}>;
  radius: number;
  strength: number;
}

export interface FaceDetection {
  type: 'face';
  x: number;
  y: number;
  w: number;
  h: number;
  accepted: boolean;
  confidence?: number;
}

export interface PhotoUploadProgress {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

export interface BulkUpdateRequest {
  photoIds: string[];
  updates: {
    category?: PhotoCategory;
    captionPrefix?: string;
  };
}

// Category display names
export const CATEGORY_LABELS: Record<PhotoCategory, string> = {
  exteriorFront: 'Exterior Front',
  exteriorLeft: 'Exterior Left', 
  exteriorRight: 'Exterior Right',
  exteriorRear: 'Exterior Rear',
  street: 'Street View',
  addressUnit: 'Address/Unit',
  kitchen: 'Kitchen',
  bath: 'Bathroom',
  living: 'Living Room',
  bedroom: 'Bedroom',
  mechanical: 'Mechanical',
  deficiency: 'Deficiency',
  viewWaterfront: 'View/Waterfront',
  outbuilding: 'Outbuilding',
  other: 'Other'
};

// Required photo categories for QC
export const REQUIRED_CATEGORIES: PhotoCategory[] = [
  'exteriorFront',
  'kitchen', 
  'bath',
  'living'
];