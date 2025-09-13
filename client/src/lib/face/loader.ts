/**
 * Face detection loader with @vladmandic/face-api lazy loading
 * Gracefully handles missing models and provides fallback
 */

import * as faceapi from '@vladmandic/face-api';
import { FACE_MODELS_BASE, FACE_MODEL_SET, FACE_DETECTION_CONFIG } from '@/config/face';
import { FaceDetection } from '@/types/photos';

// State management
let isInitialized = false;
let initializationPromise: Promise<boolean> | null = null;
let modelsAvailable = false;

// Initialize face-api models
async function initializeFaceApi(): Promise<boolean> {
  if (isInitialized) {
    return modelsAvailable;
  }
  
  try {
    console.log('Loading face detection models...');
    
    // Load models based on selected set
    if (FACE_MODEL_SET === 'tiny') {
      await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS_BASE);
    } else {
      await faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_MODELS_BASE);
    }
    
    console.log('Face detection models loaded successfully');
    modelsAvailable = true;
    isInitialized = true;
    return true;
  } catch (error) {
    console.warn('Face detection models failed to load:', error);
    console.info('Face detection will not be available. Manual blur tools will still work.');
    modelsAvailable = false;
    isInitialized = true;
    return false;
  }
}

// Get face detection options based on model set
function getDetectionOptions() {
  if (FACE_MODEL_SET === 'tiny') {
    return new faceapi.TinyFaceDetectorOptions({
      inputSize: FACE_DETECTION_CONFIG.inputSize,
      scoreThreshold: FACE_DETECTION_CONFIG.minConfidence,
    });
  } else {
    return new faceapi.SsdMobilenetv1Options({
      minConfidence: FACE_DETECTION_CONFIG.minConfidence,
      maxResults: FACE_DETECTION_CONFIG.maxFaces,
    });
  }
}

// Detect faces in image element
export async function detectFaces(
  imgElement: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
): Promise<FaceDetection[]> {
  try {
    // Ensure models are loaded
    if (initializationPromise) {
      await initializationPromise;
    } else {
      initializationPromise = initializeFaceApi();
      await initializationPromise;
    }
    
    if (!modelsAvailable) {
      return [];
    }
    
    // Perform detection
    const detections = await faceapi.detectAllFaces(imgElement, getDetectionOptions());
    
    // Convert to our FaceDetection format
    const results: FaceDetection[] = detections
      .filter(detection => {
        const box = detection.box;
        // Filter by minimum face size
        return box.width >= FACE_DETECTION_CONFIG.minFaceSize && 
               box.height >= FACE_DETECTION_CONFIG.minFaceSize;
      })
      .slice(0, FACE_DETECTION_CONFIG.maxFaces) // Limit max faces
      .map((detection, index) => {
        const box = detection.box;
        return {
          type: 'face' as const,
          x: Math.round(box.x),
          y: Math.round(box.y),
          w: Math.round(box.width),
          h: Math.round(box.height),
          accepted: false, // Default to not accepted
          confidence: detection.score,
        };
      });
    
    console.log(`Detected ${results.length} faces`);
    return results;
  } catch (error) {
    console.error('Face detection failed:', error);
    return [];
  }
}

// Check if face detection is available
export function isFaceDetectionAvailable(): boolean {
  return modelsAvailable;
}

// Get face detection status
export function getFaceDetectionStatus(): 'loading' | 'available' | 'unavailable' {
  if (!isInitialized && initializationPromise) {
    return 'loading';
  }
  if (!isInitialized) {
    return 'unavailable';
  }
  return modelsAvailable ? 'available' : 'unavailable';
}

// Preload models (call this early in app lifecycle)
export function preloadFaceModels(): Promise<boolean> {
  if (initializationPromise) {
    return initializationPromise;
  }
  
  initializationPromise = initializeFaceApi();
  return initializationPromise;
}

// Reset state (useful for testing)
export function resetFaceDetection(): void {
  isInitialized = false;
  initializationPromise = null;
  modelsAvailable = false;
}