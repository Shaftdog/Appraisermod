import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { DEFAULT_PDF_OPTIONS, PdfExportOptions } from '@/config/pdf';
import { PhotoAddenda, AddendaPage, PhotoMeta, AddendaLayout } from '@/types/photos';
import { DEV_AUTH } from '@/config/auth';
import { telemetry } from '../../../../lib/telemetry';
import { 
  getPageRect, 
  getContentRect, 
  getCells, 
  wrapText, 
  calculateContainDimensions,
  CellRect 
} from './utils';

export interface GenerateAddendaInput {
  orderId: string;
  addenda: PhotoAddenda;
  photosById: Record<string, PhotoMeta>;
  options?: Partial<PdfExportOptions>;
  meta?: { 
    title?: string; 
    author?: string; 
    subject?: string; 
    keywords?: string[] 
  };
}

export interface GenerateResult {
  blob: Blob;
  filename: string;
  pageCount: number;
  bytes: number;
}

/**
 * Generate PDF from addenda layout
 */
export async function generateAddendaPdf(input: GenerateAddendaInput): Promise<GenerateResult> {
  const startTime = performance.now();
  const options = { ...DEFAULT_PDF_OPTIONS, ...input.options };
  const { orderId, addenda, photosById, meta } = input;
  
  // Create PDF document
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  // Get page dimensions
  const pageRect = getPageRect(options);
  const contentRect = getContentRect(pageRect, options.marginPt);
  const captionHeight = options.caption.fontSize * options.caption.maxLines + 6;
  
  // Process each addenda page
  for (let pageIndex = 0; pageIndex < addenda.pages.length; pageIndex++) {
    const addendaPage = addenda.pages[pageIndex];
    const pdfPage = pdfDoc.addPage([pageRect.width, pageRect.height]);
    
    // Draw header
    if (options.drawHeader) {
      await drawHeader(pdfPage, pageRect, font, boldFont, orderId, meta?.subject);
    }
    
    // Draw footer
    if (options.drawFooter) {
      await drawFooter(pdfPage, pageRect, font, pageIndex + 1, addenda.pages.length, meta?.author);
    }
    
    // Draw watermark
    if (options.watermark) {
      await drawWatermark(pdfPage, pageRect, font, options.watermark);
    }
    
    // Draw page title if provided
    if (addendaPage.title) {
      const titleY = contentRect.y + contentRect.height - 20;
      pdfPage.drawText(addendaPage.title, {
        x: contentRect.x,
        y: titleY,
        size: 16,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      // Adjust content rect to account for title
      contentRect.height -= 40;
      contentRect.y -= 20;
    }
    
    // Get grid cells for this layout
    const cells = getCells(addendaPage.layout, contentRect, captionHeight);
    
    // Draw photos and captions
    for (let cellIndex = 0; cellIndex < addendaPage.cells.length && cellIndex < cells.length; cellIndex++) {
      const cell = addendaPage.cells[cellIndex];
      const cellRect = cells[cellIndex];
      
      if (cell.photoId && photosById[cell.photoId]) {
        await drawPhotoCell(
          pdfDoc,
          pdfPage, 
          cellRect, 
          photosById[cell.photoId], 
          cell.caption || '',
          font,
          options,
          orderId
        );
      } else if (cell.caption) {
        // Draw caption only if no photo
        await drawCaption(pdfPage, cellRect.captionRect, cell.caption, font, options);
      }
    }
  }
  
  // Set PDF metadata
  if (meta?.title) pdfDoc.setTitle(meta.title);
  if (meta?.author) pdfDoc.setAuthor(meta.author);
  if (meta?.subject) pdfDoc.setSubject(meta.subject);
  if (meta?.keywords?.length) pdfDoc.setKeywords(meta.keywords);
  pdfDoc.setProducer('Order UI Shell - Photo Addenda Generator');
  pdfDoc.setCreationDate(new Date());
  
  // Generate PDF bytes
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  
  // Telemetry tracking for PDF export
  const exportTime = performance.now() - startTime;
  telemetry.exportTime(exportTime, orderId);
  telemetry.pdfPages(addenda.pages.length, orderId);
  
  return {
    blob,
    filename: `Order-${orderId}-Addenda.pdf`,
    pageCount: addenda.pages.length,
    bytes: pdfBytes.length
  };
}

/**
 * Draw header with title and order info
 */
async function drawHeader(
  page: any, 
  pageRect: any, 
  font: any, 
  boldFont: any, 
  orderId: string, 
  subject?: string
) {
  const headerY = pageRect.height - 20;
  const margin = 36;
  
  // Left: "Photo Addenda"
  page.drawText('Photo Addenda', {
    x: margin,
    y: headerY,
    size: 12,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  
  // Right: Order ID or subject
  const rightText = subject || `Order ${orderId}`;
  const rightTextWidth = font.widthOfTextAtSize(rightText, 10);
  page.drawText(rightText, {
    x: pageRect.width - margin - rightTextWidth,
    y: headerY,
    size: 10,
    font: font,
    color: rgb(0.4, 0.4, 0.4),
  });
}

/**
 * Draw footer with page numbers and metadata
 */
async function drawFooter(
  page: any, 
  pageRect: any, 
  font: any, 
  pageNum: number, 
  totalPages: number,
  author?: string
) {
  const footerY = 15;
  const margin = 36;
  
  // Left: Date
  const date = new Date().toLocaleDateString();
  page.drawText(date, {
    x: margin,
    y: footerY,
    size: 9,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });
  
  // Center: Page X of Y
  const pageText = `Page ${pageNum} of ${totalPages}`;
  const pageTextWidth = font.widthOfTextAtSize(pageText, 9);
  page.drawText(pageText, {
    x: (pageRect.width - pageTextWidth) / 2,
    y: footerY,
    size: 9,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });
  
  // Right: Author or company
  const rightText = author || 'Professional Appraisal Services';
  const rightTextWidth = font.widthOfTextAtSize(rightText, 9);
  page.drawText(rightText, {
    x: pageRect.width - margin - rightTextWidth,
    y: footerY,
    size: 9,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });
}

/**
 * Draw diagonal watermark
 */
async function drawWatermark(
  page: any, 
  pageRect: any, 
  font: any, 
  watermark: { text: string; opacity?: number; size?: number; angleDeg?: number }
) {
  const opacity = watermark.opacity || 0.08;
  const size = watermark.size || pageRect.width * 0.12;
  const angleDeg = watermark.angleDeg || 45;
  
  const textWidth = font.widthOfTextAtSize(watermark.text, size);
  const x = (pageRect.width - textWidth) / 2;
  const y = pageRect.height / 2;
  
  page.drawText(watermark.text, {
    x,
    y,
    size,
    font,
    color: rgb(0.5, 0.5, 0.5),
    opacity,
    rotate: degrees(angleDeg),
  });
}

/**
 * Draw a photo cell with image and caption
 */
async function drawPhotoCell(
  pdfDoc: any,
  page: any,
  cellRect: CellRect,
  photo: PhotoMeta,
  caption: string,
  font: any,
  options: PdfExportOptions,
  orderId: string
) {
  try {
    // Choose image variant based on user settings
    const shouldUseBlurred = (options.includeBlurredPhotos !== false) && 
      photo.processing?.blurredPath;
    
    const imageUrl = `/api/orders/${orderId}/photos/${photo.id}/file?variant=${
      shouldUseBlurred ? 'blurred' : 'display'
    }`;
    
    // Fetch image with auth headers
    const authHeaders = DEV_AUTH.enabled 
      ? { [DEV_AUTH.headerName]: DEV_AUTH.userId }
      : {};
    
    const response = await fetch(imageUrl, {
      credentials: 'include',
      headers: authHeaders
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch photo ${photo.id}:`, response.statusText);
      await drawPlaceholder(page, cellRect.imageRect, `Photo ${photo.id}\nUnavailable`, font);
    } else {
      const imageBytes = await response.arrayBuffer();
      
      // Determine image type and embed using Content-Type
      let image;
      try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('image/png')) {
          image = await pdfDoc.embedPng(imageBytes);
        } else if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
          image = await pdfDoc.embedJpg(imageBytes);
        } else {
          // Fallback: try JPEG first, then PNG
          try {
            image = await pdfDoc.embedJpg(imageBytes);
          } catch {
            image = await pdfDoc.embedPng(imageBytes);
          }
        }
      } catch (embedError) {
        console.warn(`Failed to embed image ${photo.id}:`, embedError);
        await drawPlaceholder(page, cellRect.imageRect, `Photo ${photo.id}\nFormat Error`, font);
        return;
      }
      
      // Calculate contain dimensions
      const imageDims = image.scale(1);
      const fit = calculateContainDimensions(
        imageDims.width,
        imageDims.height,
        cellRect.imageRect.width,
        cellRect.imageRect.height
      );
      
      // Draw image
      page.drawImage(image, {
        x: cellRect.imageRect.x + fit.x,
        y: cellRect.imageRect.y + fit.y,
        width: fit.width,
        height: fit.height,
      });
    }
  } catch (error) {
    console.warn(`Error drawing photo ${photo.id}:`, error);
    await drawPlaceholder(page, cellRect.imageRect, `Photo ${photo.id}\nError`, font);
  }
  
  // Draw caption
  if (caption) {
    await drawCaption(page, cellRect.captionRect, caption, font, options);
  }
}

/**
 * Draw placeholder for missing/error images
 */
async function drawPlaceholder(page: any, rect: any, text: string, font: any) {
  // Draw border
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 1,
  });
  
  // Draw text
  const lines = text.split('\n');
  const lineHeight = 12;
  const totalHeight = lines.length * lineHeight;
  const startY = rect.y + (rect.height + totalHeight) / 2;
  
  lines.forEach((line, index) => {
    const textWidth = font.widthOfTextAtSize(line, 10);
    const x = rect.x + (rect.width - textWidth) / 2;
    const y = startY - (index + 1) * lineHeight;
    
    page.drawText(line, {
      x,
      y,
      size: 10,
      font,
      color: rgb(0.6, 0.6, 0.6),
    });
  });
}

/**
 * Draw caption text with wrapping
 */
async function drawCaption(
  page: any, 
  rect: any, 
  text: string, 
  font: any, 
  options: PdfExportOptions
) {
  if (!text?.trim()) return;
  
  const lines = wrapText(
    text,
    rect.width - 4, // Small margin
    font,
    options.caption.fontSize,
    options.caption.maxLines
  );
  
  const lineHeight = options.caption.fontSize + 2;
  const startY = rect.y + rect.height - lineHeight;
  
  lines.forEach((line, index) => {
    const y = startY - (index * lineHeight);
    if (y >= rect.y) { // Don't draw outside bounds
      page.drawText(line, {
        x: rect.x + 2,
        y,
        size: options.caption.fontSize,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
    }
  });
}