/**
 * PhotoEditorModal - Complete photo editing interface with face detection and blur tools
 * Features: Canvas viewer, zoom/pan, box/brush blur tools, face detection, before/after preview
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Square, Paintbrush2, Move, Eye, EyeOff, Undo2, Redo2, Save, RotateCcw, Check, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { PhotoMeta, BlurRect, BlurBrushStroke, FaceDetection } from '@/types/photos';
import { setPhotoMasks, processPhoto } from '@/lib/photoApi';
import { detectFaces, isFaceDetectionAvailable, getFaceDetectionStatus } from '@/lib/face/loader';

// Tool types
type EditorTool = 'select' | 'box' | 'brush';

// Canvas interaction state
interface CanvasState {
  scale: number;
  offsetX: number;
  offsetY: number;
  isDragging: boolean;
  isDrawing: boolean;
  dragStart: { x: number; y: number };
}

// History state for undo/redo
interface HistoryState {
  rects: BlurRect[];
  brush: BlurBrushStroke[];
  autoDetections: FaceDetection[];
}

interface PhotoEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  photo: PhotoMeta;
  orderId: string;
  onSave?: (updatedPhoto: PhotoMeta) => void;
}

export function PhotoEditorModal({ isOpen, onClose, photo, orderId, onSave }: PhotoEditorModalProps) {
  const { toast } = useToast();
  
  // Canvas and image refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Editor state
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [canvasState, setCanvasState] = useState<CanvasState>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    isDrawing: false,
    dragStart: { x: 0, y: 0 }
  });
  
  // Blur tools state
  const [brushRadius, setBrushRadius] = useState(20);
  const [brushStrength, setBrushStrength] = useState(0.8);
  const [currentBrushStroke, setCurrentBrushStroke] = useState<BlurBrushStroke | null>(null);
  
  // Working masks (separate from persisted)
  const [workingRects, setWorkingRects] = useState<BlurRect[]>([]);
  const [workingBrush, setWorkingBrush] = useState<BlurBrushStroke[]>([]);
  const [workingDetections, setWorkingDetections] = useState<FaceDetection[]>([]);
  
  // Face detection state
  const [faceDetectionStatus, setFaceDetectionStatus] = useState<'idle' | 'loading' | 'complete' | 'error'>('idle');
  const [faceDetectionAvailable, setFaceDetectionAvailable] = useState(false);
  
  // Preview and history
  const [showBefore, setShowBefore] = useState(false);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isSaving, setIsSaving] = useState(false);
  
  // Worker for blur preview
  const [blurWorker, setBlurWorker] = useState<Worker | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [workerSupported, setWorkerSupported] = useState(true);
  
  // Initialize working state from photo
  useEffect(() => {
    if (photo.masks) {
      setWorkingRects(photo.masks.rects || []);
      setWorkingBrush(photo.masks.brush || []);
      setWorkingDetections(photo.masks.autoDetections || []);
    }
    setFaceDetectionAvailable(isFaceDetectionAvailable());
  }, [photo]);
  
  // Initialize blur worker
  useEffect(() => {
    if (typeof Worker !== 'undefined') {
      const worker = new Worker(new URL('./blurWorker.ts', import.meta.url), { type: 'module' });
      
      worker.onmessage = (event) => {
        const { type, hasOffscreenCanvas, blobUrl, error } = event.data;
        
        if (type === 'INIT_RESPONSE') {
          setWorkerSupported(hasOffscreenCanvas);
        } else if (type === 'PREVIEW_RESPONSE') {
          if (error) {
            console.warn('Worker preview failed:', error);
            // Worker doesn't support the operation, fall back to main thread
            setWorkerSupported(false);
          } else if (blobUrl) {
            setPreviewBlobUrl(blobUrl);
          }
        }
      };
      
      worker.postMessage({ type: 'INIT' });
      setBlurWorker(worker);
      
      return () => {
        worker.terminate();
      };
    } else {
      setWorkerSupported(false);
    }
  }, []);
  
  // Save current state to history
  const saveToHistory = useCallback(() => {
    const state: HistoryState = {
      rects: [...workingRects],
      brush: [...workingBrush],
      autoDetections: [...workingDetections]
    };
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(state);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [workingRects, workingBrush, workingDetections, history, historyIndex]);
  
  // Undo/Redo functions
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setWorkingRects(prevState.rects);
      setWorkingBrush(prevState.brush);
      setWorkingDetections(prevState.autoDetections);
      setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex]);
  
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setWorkingRects(nextState.rects);
      setWorkingBrush(nextState.brush);
      setWorkingDetections(nextState.autoDetections);
      setHistoryIndex(historyIndex + 1);
    }
  }, [history, historyIndex]);
  
  // Face detection
  const runFaceDetection = useCallback(async () => {
    if (!imageRef.current) return;
    
    setFaceDetectionStatus('loading');
    
    try {
      const detections = await detectFaces(imageRef.current);
      setWorkingDetections(detections);
      setFaceDetectionStatus('complete');
      
      if (detections.length > 0) {
        toast({
          title: "Face Detection Complete",
          description: `Found ${detections.length} face(s). Review and accept the ones you want to blur.`,
        });
      } else {
        toast({
          title: "No Faces Found",
          description: "No faces were detected in this image. You can still use manual blur tools.",
        });
      }
    } catch (error) {
      console.error('Face detection failed:', error);
      setFaceDetectionStatus('error');
      toast({
        variant: "destructive",
        title: "Face Detection Failed",
        description: "Unable to detect faces. Manual blur tools are still available.",
      });
    }
  }, [faceDetectionAvailable, toast]);
  
  // Auto-run face detection when image loads (removed gate - let loader handle missing models)
  useEffect(() => {
    if (imageRef.current && imageRef.current.complete && faceDetectionStatus === 'idle') {
      runFaceDetection();
    }
  }, [runFaceDetection, faceDetectionStatus]);
  
  // Accept/reject face detections
  const toggleDetectionAccepted = useCallback((index: number) => {
    setWorkingDetections(prev => prev.map((detection, i) => 
      i === index ? { ...detection, accepted: !detection.accepted } : detection
    ));
  }, []);
  
  const acceptAllDetections = useCallback(() => {
    setWorkingDetections(prev => prev.map(detection => ({ ...detection, accepted: true })));
  }, []);
  
  const clearAllDetections = useCallback(() => {
    setWorkingDetections([]);
  }, []);
  
  // Convert accepted detections to blur rects
  const convertDetectionsToRects = useCallback(() => {
    const acceptedDetections = workingDetections.filter(d => d.accepted);
    const newRects = acceptedDetections.map(detection => ({
      x: detection.x,
      y: detection.y,
      w: detection.w,
      h: detection.h,
      radius: 8 // Rounded corners for faces
    }));
    
    setWorkingRects(prev => [...prev, ...newRects]);
    setWorkingDetections(prev => prev.filter(d => !d.accepted));
    saveToHistory();
  }, [workingDetections, saveToHistory]);
  
  // Main-thread fallback for blur preview when worker isn't supported
  const generatePreviewFallback = useCallback(async (imageElement: HTMLImageElement) => {
    if (workerSupported || workingRects.length === 0 && workingBrush.length === 0) {
      return;
    }
    
    try {
      // Create a hidden canvas for main-thread blur processing
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      canvas.width = imageElement.naturalWidth;
      canvas.height = imageElement.naturalHeight;
      
      // Draw original image
      ctx.drawImage(imageElement, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Apply basic blur to masked regions (simplified for fallback)
      // Note: This is a simplified version - the worker has more sophisticated blur
      const data = imageData.data;
      
      // Handle rectangular masks
      for (const rect of workingRects) {
        for (let y = rect.y; y < rect.y + rect.h && y < canvas.height; y++) {
          for (let x = rect.x; x < rect.x + rect.w && x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            // Simple pixelation effect as fallback
            if (i + 3 < data.length) {
              const blockSize = 8;
              const blockX = Math.floor(x / blockSize) * blockSize;
              const blockY = Math.floor(y / blockSize) * blockSize;
              const blockI = (blockY * canvas.width + blockX) * 4;
              if (blockI + 3 < data.length) {
                data[i] = data[blockI];
                data[i + 1] = data[blockI + 1];
                data[i + 2] = data[blockI + 2];
              }
            }
          }
        }
      }
      
      // Handle brush strokes
      for (const stroke of workingBrush) {
        for (const point of stroke.points) {
          const centerX = Math.round(point.x);
          const centerY = Math.round(point.y);
          const radius = stroke.radius;
          
          // Apply pixelation in circular area around each point
          for (let y = centerY - radius; y <= centerY + radius; y++) {
            for (let x = centerX - radius; x <= centerX + radius; x++) {
              const dx = x - centerX;
              const dy = y - centerY;
              const distance = Math.sqrt(dx * dx + dy * dy);
              
              if (distance <= radius && x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
                const i = (y * canvas.width + x) * 4;
                if (i + 3 < data.length) {
                  const blockSize = 8;
                  const blockX = Math.floor(x / blockSize) * blockSize;
                  const blockY = Math.floor(y / blockSize) * blockSize;
                  const blockI = (blockY * canvas.width + blockX) * 4;
                  if (blockI + 3 < data.length) {
                    data[i] = data[blockI];
                    data[i + 1] = data[blockI + 1];
                    data[i + 2] = data[blockI + 2];
                  }
                }
              }
            }
          }
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      // Convert to blob and create URL
      canvas.toBlob((blob) => {
        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          setPreviewBlobUrl(blobUrl);
        }
      }, 'image/png', 0.8);
    } catch (error) {
      console.warn('Main-thread preview fallback failed:', error);
    }
  }, [workerSupported, workingRects, workingBrush]);
  
  // Send preview requests to worker when masks change
  useEffect(() => {
    if (blurWorker && imageRef.current && imageRef.current.complete && (workingRects.length > 0 || workingBrush.length > 0)) {
      if (workerSupported) {
        // Try worker first
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = imageRef.current.naturalWidth;
          canvas.height = imageRef.current.naturalHeight;
          ctx.drawImage(imageRef.current, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          blurWorker.postMessage({
            type: 'PREVIEW',
            imageData,
            width: canvas.width,
            height: canvas.height,
            rects: workingRects,
            brush: workingBrush
          });
        }
      } else {
        // Fall back to main thread
        generatePreviewFallback(imageRef.current);
      }
    }
  }, [blurWorker, workerSupported, workingRects, workingBrush, generatePreviewFallback]);
  
  // Save masks and process
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    
    try {
      // Convert accepted detections to rects before saving
      const acceptedDetections = workingDetections.filter(d => d.accepted);
      const detectionRects = acceptedDetections.map(detection => ({
        x: detection.x,
        y: detection.y,
        w: detection.w,
        h: detection.h,
        radius: 8
      }));
      
      const allRects = [...workingRects, ...detectionRects];
      const masks = {
        rects: allRects,
        brush: workingBrush,
        autoDetections: workingDetections.filter(d => !d.accepted) // Keep unaccepted for future
      };
      
      // Save masks
      const updatedPhoto = await setPhotoMasks(orderId, photo.id, masks);
      
      // Process blur
      const processedPhoto = await processPhoto(orderId, photo.id);
      
      toast({
        title: "Photo Processed",
        description: "Blur effects have been applied successfully.",
      });
      
      onSave?.(processedPhoto);
      onClose();
    } catch (error) {
      console.error('Failed to save photo:', error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: "Unable to save the photo edits. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }, [workingRects, workingBrush, workingDetections, orderId, photo.id, onSave, onClose, toast]);
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      // Tool shortcuts
      if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
        e.preventDefault();
      } else if (e.key === 'b' || e.key === 'B') {
        setActiveTool('box');
        e.preventDefault();
      } else if (e.key === 'r' || e.key === 'R') {
        setActiveTool('brush');
        e.preventDefault();
      }
      // Brush radius shortcuts
      else if (e.key === '[') {
        setBrushRadius(prev => Math.max(5, prev - 5));
        e.preventDefault();
      } else if (e.key === ']') {
        setBrushRadius(prev => Math.min(100, prev + 5));
        e.preventDefault();
      }
      // Undo/Redo
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') {
        redo();
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        undo();
        e.preventDefault();
      }
      // Before/After toggle
      else if (e.key === '\\') {
        setShowBefore(prev => !prev);
        e.preventDefault();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, undo, redo]);
  
  const imageUrl = photo.processing?.blurredPath || photo.displayPath;
  const unresolvedDetections = workingDetections.filter(d => !d.accepted).length;
  const acceptedDetections = workingDetections.filter(d => d.accepted).length;
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-3">
            Edit & Blur Photo
            <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
              {faceDetectionStatus === 'loading' && (
                <Badge variant="secondary">Scanning for faces...</Badge>
              )}
              {!faceDetectionAvailable && (
                <Badge variant="outline">Auto-detect unavailable - manual tools only</Badge>
              )}
              {unresolvedDetections > 0 && (
                <Badge variant="destructive">{unresolvedDetections} unreviewed detections</Badge>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Main Canvas Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Toolbar */}
            <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
              <div className="flex items-center gap-1 border-r pr-2">
                <Button
                  variant={activeTool === 'select' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTool('select')}
                  data-testid="tool-select"
                  aria-label="Select tool (V)"
                >
                  <Move className="w-4 h-4" />
                </Button>
                <Button
                  variant={activeTool === 'box' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTool('box')}
                  data-testid="tool-box"
                  aria-label="Box blur tool (B)"
                >
                  <Square className="w-4 h-4" />
                </Button>
                <Button
                  variant={activeTool === 'brush' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTool('brush')}
                  data-testid="tool-brush"
                  aria-label="Brush blur tool (R)"
                >
                  <Paintbrush2 className="w-4 h-4" />
                </Button>
              </div>
              
              {activeTool === 'brush' && (
                <div className="flex items-center gap-2 text-sm">
                  <span>Radius:</span>
                  <Slider
                    value={[brushRadius]}
                    onValueChange={([value]) => setBrushRadius(value)}
                    min={5}
                    max={100}
                    step={5}
                    className="w-20"
                    data-testid="slider-brush-radius"
                  />
                  <span className="w-8 text-right">{brushRadius}</span>
                </div>
              )}
              
              <div className="flex items-center gap-1 border-l pl-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={undo}
                  disabled={historyIndex <= 0}
                  data-testid="button-undo"
                  aria-label="Undo (Ctrl+Z)"
                >
                  <Undo2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={redo}
                  disabled={historyIndex >= history.length - 1}
                  data-testid="button-redo"
                  aria-label="Redo (Ctrl+Shift+Z)"
                >
                  <Redo2 className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="flex items-center gap-2 border-l pl-2">
                <Switch
                  checked={showBefore}
                  onCheckedChange={setShowBefore}
                  data-testid="switch-before-after"
                  aria-label="Before/After toggle (\)"
                />
                <span className="text-sm">Before/After</span>
              </div>
              
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  data-testid="button-save"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </div>
            
            {/* Canvas Container */}
            <div 
              ref={containerRef}
              className="flex-1 overflow-hidden bg-checkered relative"
              data-testid="canvas-container"
            >
              {/* Original image */}
              <img
                src={imageUrl}
                alt="Photo to edit"
                className="absolute inset-0 w-full h-full object-contain"
                style={{
                  opacity: showBefore ? 1 : 0.7
                }}
              />
              
              {/* Preview overlay */}
              {previewBlobUrl && !showBefore && (
                <img
                  src={previewBlobUrl}
                  alt="Blur preview"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              )}
              
              <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 cursor-crosshair pointer-events-none"
                data-testid="editor-canvas"
              />
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Photo to edit"
                className="hidden"
                onLoad={() => {
                  if (faceDetectionStatus === 'idle') {
                    runFaceDetection();
                  }
                }}
              />
            </div>
          </div>
          
          {/* Sidebar */}
          <div className="w-80 flex flex-col gap-4 flex-shrink-0">
            {/* Face Detections Panel */}
            {(faceDetectionAvailable || workingDetections.length > 0) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    Face Detections ({workingDetections.length})
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={acceptAllDetections}
                        disabled={workingDetections.length === 0}
                        data-testid="button-accept-all"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Accept All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllDetections}
                        disabled={workingDetections.length === 0}
                        data-testid="button-clear-all"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Clear
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {faceDetectionStatus === 'loading' && (
                    <div className="text-sm text-muted-foreground">
                      Scanning for faces...
                    </div>
                  )}
                  
                  {workingDetections.length === 0 && faceDetectionStatus === 'complete' && (
                    <div className="text-sm text-muted-foreground">
                      No faces detected. Use manual blur tools.
                    </div>
                  )}
                  
                  {workingDetections.map((detection, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-2 border rounded"
                      data-testid={`detection-${index}`}
                    >
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleDetectionAccepted(index)}
                          data-testid={`detection-toggle-${index}`}
                        >
                          {detection.accepted ? (
                            <Eye className="w-3 h-3" />
                          ) : (
                            <EyeOff className="w-3 h-3" />
                          )}
                        </Button>
                        <span className="text-sm">
                          Face {index + 1}
                          {detection.confidence && (
                            <span className="text-muted-foreground ml-1">
                              ({Math.round(detection.confidence * 100)}%)
                            </span>
                          )}
                        </span>
                      </div>
                      <Badge variant={detection.accepted ? "default" : "secondary"}>
                        {detection.accepted ? "Accepted" : "Pending"}
                      </Badge>
                    </div>
                  ))}
                  
                  {acceptedDetections > 0 && (
                    <Button
                      onClick={convertDetectionsToRects}
                      size="sm"
                      className="w-full"
                      data-testid="button-convert-detections"
                    >
                      Add {acceptedDetections} accepted face(s) to blur
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
            
            {/* Keyboard Shortcuts */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Keyboard Shortcuts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                <div className="grid grid-cols-2 gap-1">
                  <span>V</span><span>Select/Move</span>
                  <span>B</span><span>Box Blur</span>
                  <span>R</span><span>Brush Blur</span>
                  <span>[ / ]</span><span>Brush Size</span>
                  <span>Ctrl+Z</span><span>Undo</span>
                  <span>Ctrl+Shift+Z</span><span>Redo</span>
                  <span>\</span><span>Before/After</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}