# Face Detection Models

This directory should contain the @vladmandic/face-api model files for face detection.

## Required Files for TinyFace Detection

Download these files from the @vladmandic/face-api repository and place them here:

- `tiny_face_detector_model-weights_manifest.json`
- `tiny_face_detector_model-shard1`

## Required Files for SSD MobileNet Detection (alternative)

- `ssd_mobilenetv1_model-weights_manifest.json`
- `ssd_mobilenetv1_model-shard1`
- `ssd_mobilenetv1_model-shard2`

## Download Instructions

1. Visit: https://github.com/vladmandic/face-api/tree/master/model
2. Download the model files for your chosen detection method
3. Place them in this directory

## Fallback Behavior

If these model files are not present, the photo editor will:
- Show "Auto-detect unavailable - manual tools only" 
- Disable face detection features
- Still allow manual blur tools (box and brush)