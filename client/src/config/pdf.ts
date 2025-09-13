export type PageSizeName = 'LETTER' | 'A4';

export interface PdfExportOptions {
  pageSize: PageSizeName;              // default 'LETTER'
  orientation: 'portrait' | 'landscape'; // default 'portrait'
  marginPt: number;                    // default 36 (0.5")
  dpiTarget: number;                   // 150|220|300 (affects raster downscale)
  drawHeader: boolean;                 // default true
  drawFooter: boolean;                 // default true (page x of y)
  watermark?: { text: string; opacity?: number; size?: number; angleDeg?: number } | null;
  caption: { fontSize: number; maxLines: number }; // default { fontSize: 9, maxLines: 2 }
  includeBlurredPhotos?: boolean;      // default true - use blurred variants when available
}

export const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  pageSize: 'LETTER',
  orientation: 'portrait',
  marginPt: 36,
  dpiTarget: 220,
  drawHeader: true,
  drawFooter: true,
  watermark: null,
  caption: { fontSize: 9, maxLines: 2 },
};