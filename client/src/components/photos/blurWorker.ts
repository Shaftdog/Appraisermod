/**
 * Web Worker for blur processing with ImageBitmap and OffscreenCanvas support
 * Handles heavy blur rendering off the main thread for smooth UI
 */

import { BlurRect, BlurBrushStroke } from '@/types/photos';

// Worker message types
interface InitMessage {
  type: 'INIT';
}

interface PreviewMessage {
  type: 'PREVIEW';
  imageBitmap?: ImageBitmap;
  imageData?: ImageData;
  width: number;
  height: number;
  rects: BlurRect[];
  brush: BlurBrushStroke[];
}

interface InitResponse {
  type: 'INIT_RESPONSE';
  hasOffscreenCanvas: boolean;
  hasImageBitmap: boolean;
}

interface PreviewResponse {
  type: 'PREVIEW_RESPONSE';
  blob?: Blob;
  error?: string;
}

type WorkerMessage = InitMessage | PreviewMessage;
type WorkerResponse = InitResponse | PreviewResponse;

// Feature detection and initialization
let hasOffscreenCanvas = false;
let hasImageBitmap = false;

// Initialize worker capabilities
function initWorker(): InitResponse {
  hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
  hasImageBitmap = typeof ImageBitmap !== 'undefined';
  
  return {
    type: 'INIT_RESPONSE',
    hasOffscreenCanvas,
    hasImageBitmap,
  };
}

// Stack blur implementation for smooth blur effect
function stackBlur(imageData: ImageData, radius: number): ImageData {
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  
  if (radius < 1) return result;
  
  const blur = Math.min(radius, 254);
  const div = blur + blur + 1;
  const widthMinus1 = width - 1;
  const heightMinus1 = height - 1;
  const radiusPlus1 = blur + 1;
  
  const rMul = blur < 171 ? (blur < 57 ? 1 : 2) : 3;
  const gMul = rMul;
  const bMul = rMul;
  const aMul = rMul;
  
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
    let rInSum = 0, gInSum = 0, bInSum = 0, aInSum = 0;
    let rOutSum = 0, gOutSum = 0, bOutSum = 0, aOutSum = 0;
    
    const yi = y * width;
    
    for (let i = -blur; i <= blur; i++) {
      const x = Math.min(widthMinus1, Math.max(0, i));
      const idx = (yi + x) * 4;
      
      const r = result.data[idx];
      const g = result.data[idx + 1];
      const b = result.data[idx + 2];
      const a = result.data[idx + 3];
      
      const rbs = radiusPlus1 - Math.abs(i);
      
      rSum += r * rbs;
      gSum += g * rbs;
      bSum += b * rbs;
      aSum += a * rbs;
      
      if (i > 0) {
        rInSum += r;
        gInSum += g;
        bInSum += b;
        aInSum += a;
      } else {
        rOutSum += r;
        gOutSum += g;
        bOutSum += b;
        aOutSum += a;
      }
    }
    
    for (let x = 0; x < width; x++) {
      const idx = (yi + x) * 4;
      
      result.data[idx] = (rSum * rMul) >> 8;
      result.data[idx + 1] = (gSum * gMul) >> 8;
      result.data[idx + 2] = (bSum * bMul) >> 8;
      result.data[idx + 3] = (aSum * aMul) >> 8;
      
      rSum -= rOutSum;
      gSum -= gOutSum;
      bSum -= bOutSum;
      aSum -= aOutSum;
      
      const nextX = x + radiusPlus1;
      const prevX = x - blur;
      
      if (nextX < width) {
        const nextIdx = (yi + nextX) * 4;
        rInSum += result.data[nextIdx];
        gInSum += result.data[nextIdx + 1];
        bInSum += result.data[nextIdx + 2];
        aInSum += result.data[nextIdx + 3];
      }
      
      if (prevX >= 0) {
        const prevIdx = (yi + prevX) * 4;
        rOutSum -= result.data[prevIdx];
        gOutSum -= result.data[prevIdx + 1];
        bOutSum -= result.data[prevIdx + 2];
        aOutSum -= result.data[prevIdx + 3];
      }
      
      rSum += rInSum;
      gSum += gInSum;
      bSum += bInSum;
      aSum += aInSum;
    }
  }
  
  return result;
}

// Check if point is inside rectangle
function isPointInRect(x: number, y: number, rect: BlurRect): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

// Check if point is inside brush stroke
function isPointInBrush(x: number, y: number, stroke: BlurBrushStroke): boolean {
  for (const point of stroke.points) {
    const dx = x - point.x;
    const dy = y - point.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= stroke.radius) {
      return true;
    }
  }
  return false;
}

// Create mask for blur regions
function createBlurMask(width: number, height: number, rects: BlurRect[], brush: BlurBrushStroke[]): boolean[] {
  const mask = new Array(width * height).fill(false);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      // Check rectangles
      for (const rect of rects) {
        if (isPointInRect(x, y, rect)) {
          mask[idx] = true;
          break;
        }
      }
      
      // Check brush strokes
      if (!mask[idx]) {
        for (const stroke of brush) {
          if (isPointInBrush(x, y, stroke)) {
            mask[idx] = true;
            break;
          }
        }
      }
    }
  }
  
  return mask;
}

// Apply blur to masked regions
function applyMaskedBlur(originalData: ImageData, blurredData: ImageData, mask: boolean[]): ImageData {
  const result = new ImageData(new Uint8ClampedArray(originalData.data), originalData.width, originalData.height);
  
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      const pixelIdx = i * 4;
      result.data[pixelIdx] = blurredData.data[pixelIdx];
      result.data[pixelIdx + 1] = blurredData.data[pixelIdx + 1];
      result.data[pixelIdx + 2] = blurredData.data[pixelIdx + 2];
      result.data[pixelIdx + 3] = blurredData.data[pixelIdx + 3];
    }
  }
  
  return result;
}

// Process preview blur
async function processPreview(message: PreviewMessage): Promise<PreviewResponse> {
  try {
    const { width, height, rects, brush } = message;
    let imageData: ImageData;
    
    // Get image data from ImageBitmap or direct ImageData
    if (message.imageBitmap && hasOffscreenCanvas) {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get OffscreenCanvas context');
      }
      
      ctx.drawImage(message.imageBitmap, 0, 0);
      imageData = ctx.getImageData(0, 0, width, height);
    } else if (message.imageData) {
      imageData = message.imageData;
    } else {
      throw new Error('No valid image data provided');
    }
    
    // Create blur mask
    const mask = createBlurMask(width, height, rects, brush);
    
    // Apply stack blur to the entire image
    const blurredData = stackBlur(imageData, 15); // Fixed blur radius for preview
    
    // Apply masked blur
    const resultData = applyMaskedBlur(imageData, blurredData, mask);
    
    // Convert result to blob
    let blob: Blob;
    
    if (hasOffscreenCanvas) {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get OffscreenCanvas context');
      }
      
      ctx.putImageData(resultData, 0, 0);
      blob = await canvas.convertToBlob({ type: 'image/png', quality: 0.8 });
    } else {
      // Fallback for environments without OffscreenCanvas
      // This will be handled on the main thread
      throw new Error('OffscreenCanvas not available');
    }
    
    return {
      type: 'PREVIEW_RESPONSE',
      blob,
    };
  } catch (error) {
    return {
      type: 'PREVIEW_RESPONSE',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Main message handler
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  
  try {
    let response: WorkerResponse;
    
    switch (message.type) {
      case 'INIT':
        response = initWorker();
        break;
        
      case 'PREVIEW':
        response = await processPreview(message);
        break;
        
      default:
        throw new Error(`Unknown message type: ${(message as any).type}`);
    }
    
    self.postMessage(response);
  } catch (error) {
    self.postMessage({
      type: 'PREVIEW_RESPONSE',
      error: error instanceof Error ? error.message : 'Unknown error',
    } as PreviewResponse);
  }
});

// Export types for the main thread
export type { WorkerMessage, WorkerResponse, InitResponse, PreviewResponse };