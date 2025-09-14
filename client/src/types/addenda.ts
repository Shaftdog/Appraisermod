/**
 * Types for photo addenda system - page layouts and PDF generation
 */

import { PhotoMeta } from './photos';
import type { AddendaElement } from '@shared/addenda';

// Layout and positioning types
export interface Position {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface Transform {
  position: Position;
  dimensions: Dimensions;
  rotation?: number;
  zIndex?: number;
}

// Addenda element types
export type AddendaElementType = 'photo' | 'text' | 'heading' | 'spacer' | 'pageBreak';

export interface BaseAddendaElement {
  id: string;
  type: AddendaElementType;
  transform: Transform;
  locked?: boolean;
}

export interface PhotoElement extends BaseAddendaElement {
  type: 'photo';
  photoId: string;
  photo?: PhotoMeta; // Resolved photo data
  caption?: string;
  showMetadata?: boolean;
  variant?: 'original' | 'blurred';
  aspectRatio?: 'original' | 'square' | '4:3' | '16:9';
}

export interface TextElement extends BaseAddendaElement {
  type: 'text';
  content: string;
  style: {
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    textAlign: 'left' | 'center' | 'right';
    color: string;
  };
}

export interface HeadingElement extends BaseAddendaElement {
  type: 'heading';
  content: string;
  level: 1 | 2 | 3; // h1, h2, h3
  style: {
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    textAlign: 'left' | 'center' | 'right';
    color: string;
    marginBottom: number;
  };
}

export interface SpacerElement extends BaseAddendaElement {
  type: 'spacer';
  height: number;
}

export interface PageBreakElement extends BaseAddendaElement {
  type: 'pageBreak';
}

// Legacy AddendaElement - now using discriminated union from @shared/addenda
// export type AddendaElement = PhotoElement | TextElement | HeadingElement | SpacerElement | PageBreakElement;

// Page and layout configuration
export interface PageSettings {
  size: 'letter' | 'a4' | 'legal';
  orientation: 'portrait' | 'landscape';
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  background?: string;
}

export interface AddendaPage {
  id: string;
  elements: AddendaElement[];
  settings: PageSettings;
}

// Addenda document
export interface AddendaDocument {
  id: string;
  orderId: string;
  title: string;
  description?: string;
  pages: AddendaPage[];
  createdAt: Date;
  updatedAt: Date;
  templateId?: string; // Reference to template used
}

// Templates for common layouts
export interface AddendaTemplate {
  id: string;
  name: string;
  description: string;
  category: 'interior' | 'exterior' | 'comparison' | 'details' | 'overview' | 'custom';
  thumbnail?: string;
  pages: Omit<AddendaPage, 'id'>[];
  isDefault?: boolean;
}

// Grid and snapping
export interface GridSettings {
  enabled: boolean;
  size: number; // Grid cell size in pixels
  snap: boolean; // Snap to grid
  visible: boolean; // Show grid lines
}

// Layout constraints
export interface LayoutConstraints {
  minPhotoSize: Dimensions;
  maxPhotoSize: Dimensions;
  defaultPhotoSize: Dimensions;
  textMinSize: Dimensions;
  snapTolerance: number;
}

// Export settings
export interface PDFExportSettings {
  title: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  quality: 'low' | 'medium' | 'high';
  includeMetadata: boolean;
  includeBlurredPhotos: boolean;
  watermark?: {
    text: string;
    opacity: number;
    position: 'center' | 'corner';
  };
}

// Editor state
export interface AddendaEditorState {
  selectedElements: Set<string>;
  clipboard: AddendaElement[];
  history: {
    past: AddendaDocument[];
    present: AddendaDocument;
    future: AddendaDocument[];
  };
  tool: 'select' | 'photo' | 'text' | 'heading';
  grid: GridSettings;
  zoom: number;
  panOffset: Position;
}

// Common template configurations
export const DEFAULT_PAGE_SETTINGS: PageSettings = {
  size: 'letter',
  orientation: 'portrait',
  margins: {
    top: 72,    // 1 inch
    right: 72,
    bottom: 72,
    left: 72,
  },
};

export const LAYOUT_CONSTRAINTS: LayoutConstraints = {
  minPhotoSize: { width: 100, height: 100 },
  maxPhotoSize: { width: 600, height: 600 },
  defaultPhotoSize: { width: 300, height: 200 },
  textMinSize: { width: 100, height: 30 },
  snapTolerance: 10,
};

export const DEFAULT_GRID_SETTINGS: GridSettings = {
  enabled: true,
  size: 20,
  snap: true,
  visible: true,
};

// Utility types
export type AddendaOperation = 
  | { type: 'ADD_ELEMENT'; element: AddendaElement; pageId: string }
  | { type: 'UPDATE_ELEMENT'; elementId: string; updates: Partial<AddendaElement>; pageId: string }
  | { type: 'DELETE_ELEMENT'; elementId: string; pageId: string }
  | { type: 'DUPLICATE_ELEMENT'; elementId: string; pageId: string }
  | { type: 'MOVE_ELEMENT'; elementId: string; newPosition: Position; pageId: string }
  | { type: 'RESIZE_ELEMENT'; elementId: string; newDimensions: Dimensions; pageId: string }
  | { type: 'ADD_PAGE'; page: AddendaPage }
  | { type: 'DELETE_PAGE'; pageId: string }
  | { type: 'REORDER_PAGES'; pageIds: string[] };

export interface AddendaStats {
  totalPages: number;
  totalPhotos: number;
  totalElements: number;
  estimatedPDFSize: string;
}