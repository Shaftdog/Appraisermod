import { StandardFonts } from 'pdf-lib';
import { PdfExportOptions } from '@/config/pdf';

export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CellRect extends PageRect {
  imageRect: PageRect;
  captionRect: PageRect;
}

/**
 * Get page dimensions for different page sizes
 */
export function getPageRect(options: PdfExportOptions): PageRect {
  const sizes = {
    LETTER: { width: 612, height: 792 },
    A4: { width: 595, height: 842 }
  };
  
  const { width, height } = sizes[options.pageSize];
  
  return options.orientation === 'landscape' 
    ? { x: 0, y: 0, width: height, height: width }
    : { x: 0, y: 0, width, height };
}

/**
 * Get content area after margins
 */
export function getContentRect(pageRect: PageRect, marginPt: number): PageRect {
  return {
    x: marginPt,
    y: marginPt,
    width: pageRect.width - (marginPt * 2),
    height: pageRect.height - (marginPt * 2)
  };
}

/**
 * Calculate grid cells for different addenda layouts
 */
export function getCells(
  layout: '2up' | '4up' | '6up',
  contentRect: PageRect,
  captionHeight: number,
  gap = 12
): CellRect[] {
  const configs = {
    '2up': { cols: 1, rows: 2 },
    '4up': { cols: 2, rows: 2 },
    '6up': { cols: 2, rows: 3 }
  };
  
  const { cols, rows } = configs[layout];
  const cellWidth = (contentRect.width - gap * (cols - 1)) / cols;
  const cellHeight = (contentRect.height - gap * (rows - 1)) / rows;
  
  const cells: CellRect[] = [];
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = contentRect.x + col * (cellWidth + gap);
      const y = contentRect.y + row * (cellHeight + gap);
      
      const imageHeight = cellHeight - captionHeight;
      
      cells.push({
        x,
        y,
        width: cellWidth,
        height: cellHeight,
        imageRect: {
          x,
          y: y + captionHeight,
          width: cellWidth,
          height: imageHeight
        },
        captionRect: {
          x,
          y,
          width: cellWidth,
          height: captionHeight
        }
      });
    }
  }
  
  return cells;
}

/**
 * Wrap text to fit within specified width, up to maxLines
 */
export function wrapText(
  text: string,
  maxWidth: number,
  font: any,
  fontSize: number,
  maxLines: number
): string[] {
  if (!text?.trim()) return [];
  
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const textWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (textWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Single word is too long, truncate it
        let truncated = word;
        while (font.widthOfTextAtSize(truncated + '...', fontSize) > maxWidth && truncated.length > 1) {
          truncated = truncated.slice(0, -1);
        }
        lines.push(truncated + (truncated !== word ? '...' : ''));
        currentLine = '';
      }
      
      if (lines.length >= maxLines) {
        break;
      }
    }
  }
  
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }
  
  // If we have more content than lines, add ellipsis to last line
  if (lines.length === maxLines && (currentLine || words.length > lines.join(' ').split(' ').length)) {
    let lastLine = lines[lines.length - 1];
    while (font.widthOfTextAtSize(lastLine + '...', fontSize) > maxWidth && lastLine.length > 1) {
      lastLine = lastLine.slice(0, -1);
    }
    lines[lines.length - 1] = lastLine + '...';
  }
  
  return lines.slice(0, maxLines);
}

/**
 * Calculate dimensions to fit image within rect using "contain" strategy
 */
export function calculateContainDimensions(
  imageWidth: number,
  imageHeight: number,
  rectWidth: number,
  rectHeight: number
): { width: number; height: number; x: number; y: number } {
  const imageRatio = imageWidth / imageHeight;
  const rectRatio = rectWidth / rectHeight;
  
  let width, height;
  
  if (imageRatio > rectRatio) {
    // Image is wider than rect ratio, fit to width
    width = rectWidth;
    height = rectWidth / imageRatio;
  } else {
    // Image is taller than rect ratio, fit to height
    height = rectHeight;
    width = rectHeight * imageRatio;
  }
  
  // Center the image within the rect
  const x = (rectWidth - width) / 2;
  const y = (rectHeight - height) / 2;
  
  return { width, height, x, y };
}