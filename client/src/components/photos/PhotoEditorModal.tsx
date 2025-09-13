/**
 * Photo editor modal with blur tools, face detection, and manual redaction
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Square, 
  Brush, 
  Eye, 
  EyeOff, 
  Save, 
  Undo2,
  Redo2,
  Settings,
  Download
} from 'lucide-react';
import { PhotoMeta, BlurRect, BlurBrushStroke, FaceDetection } from '@/types/photos';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// Editor tools
type EditorTool = 'select' | 'box' | 'brush';

// Editor state
interface EditorState {
  tool: EditorTool;
  zoom: number;
  panX: number;
  panY: number;
  boxRadius: number;
  brushSize: number;
  brushStrength: number;
  showBefore: boolean;
}

interface PhotoEditorModalProps {
  photo: PhotoMeta | null;
  open: boolean;
  onClose: () => void;
  onSave: (photo: PhotoMeta, masks: PhotoMeta['masks']) => void;
  onDownload?: (photo: PhotoMeta, variant: 'original' | 'blurred') => void;
}

export function PhotoEditorModal({
  photo,
  open,
  onClose,
  onSave,
  onDownload
}: PhotoEditorModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Editor state
  const [editorState, setEditorState] = useState<EditorState>({
    tool: 'select',
    zoom: 1,
    panX: 0,
    panY: 0,
    boxRadius: 10,
    brushSize: 20,
    brushStrength: 0.8,
    showBefore: false
  });

  // Masks state
  const [blurRects, setBlurRects] = useState<BlurRect[]>([]);
  const [brushStrokes, setBrushStrokes] = useState<BlurBrushStroke[]>([]);
  const [faceDetections, setFaceDetections] = useState<FaceDetection[]>([]);
  
  // Interaction state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<{x: number; y: number}[]>([]);
  const [dragStart, setDragStart] = useState<{x: number; y: number} | null>(null);
  
  // History for undo/redo
  const [history, setHistory] = useState<{
    rects: BlurRect[];
    strokes: BlurBrushStroke[];
    detections: FaceDetection[];
  }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Load photo and existing masks when modal opens
  useEffect(() => {
    if (photo && open) {
      // Load existing masks
      if (photo.masks) {
        setBlurRects(photo.masks.rects || []);
        setBrushStrokes(photo.masks.brush || []);
        setFaceDetections(photo.masks.autoDetections || []);
      } else {
        setBlurRects([]);
        setBrushStrokes([]);
        setFaceDetections([]);
      }

      // Reset editor state
      setEditorState(prev => ({
        ...prev,
        zoom: 1,
        panX: 0,
        panY: 0,
        showBefore: false
      }));

      // Initialize history
      const initialState = {
        rects: photo.masks?.rects || [],
        strokes: photo.masks?.brush || [],
        detections: photo.masks?.autoDetections || []
      };
      setHistory([initialState]);
      setHistoryIndex(0);

      // Auto-detect faces if no detections exist
      if (!photo.masks?.autoDetections?.length) {
        detectFaces();
      }
    }
  }, [photo, open]);

  // Auto-detect faces using face-api.js (placeholder for now)
  const detectFaces = useCallback(async () => {
    // TODO: Implement face detection using @vladmandic/face-api
    // For now, just a placeholder
    console.log('Face detection would run here');
  }, []);

  // Save current state to history
  const saveToHistory = useCallback(() => {
    const currentState = {
      rects: [...blurRects],
      strokes: [...brushStrokes], 
      detections: [...faceDetections]
    };
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(currentState);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [blurRects, brushStrokes, faceDetections, history, historyIndex]);

  // Undo/Redo functions
  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const state = history[newIndex];
      setBlurRects(state.rects);
      setBrushStrokes(state.strokes);
      setFaceDetections(state.detections);
      setHistoryIndex(newIndex);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const state = history[newIndex];
      setBlurRects(state.rects);
      setBrushStrokes(state.strokes);
      setFaceDetections(state.detections);
      setHistoryIndex(newIndex);
    }
  };

  // Canvas event handlers
  const getCanvasCoordinates = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / editorState.zoom - editorState.panX;
    const y = (e.clientY - rect.top) / editorState.zoom - editorState.panY;
    
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const coords = getCanvasCoordinates(e);

    if (editorState.tool === 'box') {
      setDragStart(coords);
    } else if (editorState.tool === 'brush') {
      setIsDrawing(true);
      setCurrentStroke([coords]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing && !dragStart) return;

    const coords = getCanvasCoordinates(e);

    if (editorState.tool === 'brush' && isDrawing) {
      setCurrentStroke(prev => [...prev, coords]);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const coords = getCanvasCoordinates(e);

    if (editorState.tool === 'box' && dragStart) {
      // Create blur box
      const newRect: BlurRect = {
        x: Math.min(dragStart.x, coords.x),
        y: Math.min(dragStart.y, coords.y),
        w: Math.abs(coords.x - dragStart.x),
        h: Math.abs(coords.y - dragStart.y),
        radius: editorState.boxRadius
      };
      
      if (newRect.w > 5 && newRect.h > 5) { // Minimum size
        setBlurRects(prev => [...prev, newRect]);
        saveToHistory();
      }
      
      setDragStart(null);
    } else if (editorState.tool === 'brush' && isDrawing && currentStroke.length > 1) {
      // Create brush stroke
      const newStroke: BlurBrushStroke = {
        points: currentStroke,
        radius: editorState.brushSize,
        strength: editorState.brushStrength
      };
      
      setBrushStrokes(prev => [...prev, newStroke]);
      saveToHistory();
      setCurrentStroke([]);
      setIsDrawing(false);
    }
  };

  // Handle face detection acceptance/rejection
  const toggleFaceDetection = (index: number) => {
    setFaceDetections(prev => 
      prev.map((detection, i) => 
        i === index 
          ? { ...detection, accepted: !detection.accepted }
          : detection
      )
    );
    saveToHistory();
  };

  // Save changes
  const handleSave = () => {
    if (!photo) return;

    const masks = {
      rects: blurRects,
      brush: brushStrokes,
      autoDetections: faceDetections
    };

    onSave(photo, masks);
  };

  // Reset all masks
  const handleReset = () => {
    setBlurRects([]);
    setBrushStrokes([]);
    setFaceDetections([]);
    saveToHistory();
  };

  if (!photo) return null;

  const imageUrl = `/api/orders/${photo.orderId}/photos/${photo.id}/file?variant=display`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl w-[95vw] h-[95vh] p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center justify-between">
            <span>Edit & Blur Photo</span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 h-[calc(95vh-80px)]">
          {/* Toolbar */}
          <div className="w-64 border-r bg-muted/30 p-4 space-y-4">
            <ScrollArea className="h-full">
              {/* Tools */}
              <div className="space-y-3">
                <h3 className="font-medium">Tools</h3>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { tool: 'select', icon: Settings, label: 'Select' },
                    { tool: 'box', icon: Square, label: 'Box Blur' },
                    { tool: 'brush', icon: Brush, label: 'Brush Blur' },
                  ].map(({ tool, icon: Icon, label }) => (
                    <Button
                      key={tool}
                      variant={editorState.tool === tool ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setEditorState(prev => ({ ...prev, tool: tool as EditorTool }))}
                      className="flex flex-col gap-1 h-auto py-2"
                      data-testid={`tool-${tool}`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs">{label}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Box Blur Settings */}
              {editorState.tool === 'box' && (
                <div className="space-y-3">
                  <h3 className="font-medium">Box Blur</h3>
                  <div className="space-y-2">
                    <Label className="text-sm">Blur Radius</Label>
                    <Slider
                      value={[editorState.boxRadius]}
                      onValueChange={([value]) => 
                        setEditorState(prev => ({ ...prev, boxRadius: value }))
                      }
                      min={5}
                      max={50}
                      step={1}
                      className="w-full"
                    />
                    <div className="text-xs text-muted-foreground text-center">
                      {editorState.boxRadius}px
                    </div>
                  </div>
                </div>
              )}

              {/* Brush Settings */}
              {editorState.tool === 'brush' && (
                <div className="space-y-3">
                  <h3 className="font-medium">Brush Blur</h3>
                  <div className="space-y-2">
                    <Label className="text-sm">Brush Size</Label>
                    <Slider
                      value={[editorState.brushSize]}
                      onValueChange={([value]) => 
                        setEditorState(prev => ({ ...prev, brushSize: value }))
                      }
                      min={5}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                    <div className="text-xs text-muted-foreground text-center">
                      {editorState.brushSize}px
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Blur Strength</Label>
                    <Slider
                      value={[editorState.brushStrength]}
                      onValueChange={([value]) => 
                        setEditorState(prev => ({ ...prev, brushStrength: value }))
                      }
                      min={0.1}
                      max={1}
                      step={0.1}
                      className="w-full"
                    />
                    <div className="text-xs text-muted-foreground text-center">
                      {Math.round(editorState.brushStrength * 100)}%
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              {/* Face Detections */}
              {faceDetections.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium">Face Detections</h3>
                  <div className="space-y-2">
                    {faceDetections.map((detection, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <span className="text-sm">Face #{index + 1}</span>
                        <Switch
                          checked={detection.accepted}
                          onCheckedChange={() => toggleFaceDetection(index)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* View Options */}
              <div className="space-y-3">
                <h3 className="font-medium">View</h3>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="show-before"
                    checked={editorState.showBefore}
                    onCheckedChange={(checked) => 
                      setEditorState(prev => ({ ...prev, showBefore: checked }))
                    }
                  />
                  <Label htmlFor="show-before">Show Before</Label>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Canvas Area */}
          <div className="flex-1 flex flex-col">
            {/* Canvas Toolbar */}
            <div className="border-b p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={undo}
                  disabled={historyIndex <= 0}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={redo}
                  disabled={historyIndex >= history.length - 1}
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
                
                <Separator orientation="vertical" className="h-6" />
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditorState(prev => ({ ...prev, zoom: Math.max(0.1, prev.zoom - 0.1) }))}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm min-w-[60px] text-center">
                  {Math.round(editorState.zoom * 100)}%
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditorState(prev => ({ ...prev, zoom: Math.min(3, prev.zoom + 0.1) }))}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleReset}>
                  Reset All
                </Button>
                {onDownload && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => onDownload(photo, 'original')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Original
                  </Button>
                )}
                <Button onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>

            {/* Canvas Container */}
            <div 
              ref={containerRef}
              className="flex-1 overflow-hidden relative bg-muted/10"
            >
              <canvas
                ref={canvasRef}
                className="absolute inset-0 cursor-crosshair"
                style={{
                  transform: `scale(${editorState.zoom}) translate(${editorState.panX}px, ${editorState.panY}px)`,
                  transformOrigin: 'top left'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => {
                  setIsDrawing(false);
                  setDragStart(null);
                }}
              />
              
              {/* Image */}
              <img
                src={imageUrl}
                alt="Photo to edit"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                style={{
                  transform: `scale(${editorState.zoom}) translate(${editorState.panX}px, ${editorState.panY}px)`,
                  transformOrigin: 'top left',
                  opacity: editorState.showBefore ? 1 : 0.7
                }}
                draggable={false}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}