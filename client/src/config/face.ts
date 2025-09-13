/**
 * Face detection configuration for @vladmandic/face-api
 * Models are loaded lazily from /public/models/faceapi/
 */

export const FACE_MODELS_BASE = '/models/faceapi';

// Allow switching between model sets - 'tiny' is faster but less accurate
export const FACE_MODEL_SET: 'tiny' | 'ssd' = 'tiny';

// Model file paths based on selected set
export const FACE_MODEL_PATHS = {
  tiny: {
    detector: `${FACE_MODELS_BASE}/tiny_face_detector_model-weights_manifest.json`,
  },
  ssd: {
    detector: `${FACE_MODELS_BASE}/ssd_mobilenetv1_model-weights_manifest.json`,
  },
} as const;

// Detection configuration
export const FACE_DETECTION_CONFIG = {
  // Minimum confidence threshold for face detection
  minConfidence: 0.5,
  // Minimum face size (width or height) in pixels
  minFaceSize: 30,
  // Maximum number of faces to detect per image
  maxFaces: 10,
  // Input size for detection (smaller = faster, larger = more accurate)
  inputSize: 416,
} as const;