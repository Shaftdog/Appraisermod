/**
 * Addenda Builder - Drag-and-drop photo layout editor
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { 
  MousePointer2, 
  Image, 
  Type, 
  Heading1,
  Undo2,
  Redo2,
  Copy,
  Trash2,
  ZoomIn,
  ZoomOut,
  Grid3x3,
  Download,
  Save,
  Plus,
  Eye,
  Settings
} from 'lucide-react';
import {
  AddendaDocument,
  AddendaPage,
  AddendaEditorState,
  AddendaOperation,
  PhotoElement,
  TextElement,
  HeadingElement,
  Position,
  Dimensions,
  DEFAULT_PAGE_SETTINGS,
  DEFAULT_GRID_SETTINGS,
  LAYOUT_CONSTRAINTS
} from '@/types/addenda';
import { AddendaElement, updateElement, migrateLegacyElement } from '@shared/addenda';
import { PhotoMeta } from '@/types/photos';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface AddendaBuilderProps {
  document: AddendaDocument;
  photos: PhotoMeta[];
  onDocumentUpdate: (document: AddendaDocument) => void;
  onSave: () => void;
  onExport: () => void;
  onPreview: () => void;
  className?: string;
}

export function AddendaBuilder({
  document,
  photos,
  onDocumentUpdate,
  onSave,
  onExport,
  onPreview,
  className
}: AddendaBuilderProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [editorState, setEditorState] = useState<AddendaEditorState>({
    selectedElements: new Set(),
    clipboard: [],
    history: {
      past: [],
      present: document,
      future: []
    },
    tool: 'select',
    grid: DEFAULT_GRID_SETTINGS,
    zoom: 1,
    panOffset: { x: 0, y: 0 }
  });

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });

  const currentPage = document.pages[currentPageIndex];

  // Update document when editor state changes
  useEffect(() => {
    if (editorState.history.present !== document) {
      onDocumentUpdate(editorState.history.present);
    }
  }, [editorState.history.present, document, onDocumentUpdate]);

  // History management
  const saveToHistory = useCallback((newDocument: AddendaDocument) => {
    setEditorState(prev => ({
      ...prev,
      history: {
        past: [...prev.history.past, prev.history.present],
        present: newDocument,
        future: []
      }
    }));
  }, []);

  const undo = useCallback(() => {
    setEditorState(prev => {
      if (prev.history.past.length === 0) return prev;
      
      const previous = prev.history.past[prev.history.past.length - 1];
      const newPast = prev.history.past.slice(0, -1);
      
      return {
        ...prev,
        history: {
          past: newPast,
          present: previous,
          future: [prev.history.present, ...prev.history.future]
        }
      };
    });
  }, []);

  const redo = useCallback(() => {
    setEditorState(prev => {
      if (prev.history.future.length === 0) return prev;
      
      const next = prev.history.future[0];
      const newFuture = prev.history.future.slice(1);
      
      return {
        ...prev,
        history: {
          past: [...prev.history.past, prev.history.present],
          present: next,
          future: newFuture
        }
      };
    });
  }, []);

  // Element operations
  const applyOperation = useCallback((operation: AddendaOperation) => {
    const newDocument = { ...editorState.history.present };
    
    switch (operation.type) {
      case 'ADD_ELEMENT': {
        const page = newDocument.pages.find(p => p.id === operation.pageId);
        if (page) {
          page.elements.push(operation.element);
        }
        break;
      }
      case 'UPDATE_ELEMENT': {
        const page = newDocument.pages.find(p => p.id === operation.pageId);
        if (page) {
          const elementIndex = page.elements.findIndex(e => e.id === operation.elementId);
          if (elementIndex !== -1) {
            page.elements[elementIndex] = updateElement(page.elements[elementIndex], operation.updates);
          }
        }
        break;
      }
      case 'DELETE_ELEMENT': {
        const page = newDocument.pages.find(p => p.id === operation.pageId);
        if (page) {
          page.elements = page.elements.filter(e => e.id !== operation.elementId);
        }
        break;
      }
      case 'MOVE_ELEMENT': {
        const page = newDocument.pages.find(p => p.id === operation.pageId);
        if (page) {
          const element = page.elements.find(e => e.id === operation.elementId);
          if (element) {
            element.transform.position = operation.newPosition;
          }
        }
        break;
      }
      case 'RESIZE_ELEMENT': {
        const page = newDocument.pages.find(p => p.id === operation.pageId);
        if (page) {
          const element = page.elements.find(e => e.id === operation.elementId);
          if (element) {
            element.transform.dimensions = operation.newDimensions;
          }
        }
        break;
      }
      case 'ADD_PAGE': {
        newDocument.pages.push(operation.page);
        break;
      }
      case 'DELETE_PAGE': {
        newDocument.pages = newDocument.pages.filter(p => p.id !== operation.pageId);
        break;
      }
      case 'REORDER_PAGES': {
        const reorderedPages = operation.pageIds.map(id => 
          newDocument.pages.find(p => p.id === id)!
        ).filter(Boolean);
        newDocument.pages = reorderedPages;
        break;
      }
    }
    
    newDocument.updatedAt = new Date();
    saveToHistory(newDocument);
  }, [editorState.history.present, saveToHistory]);

  // Grid snapping
  const snapToGrid = useCallback((position: Position): Position => {
    if (!editorState.grid.snap) return position;
    
    const gridSize = editorState.grid.size;
    return {
      x: Math.round(position.x / gridSize) * gridSize,
      y: Math.round(position.y / gridSize) * gridSize
    };
  }, [editorState.grid.snap, editorState.grid.size]);

  // Add new elements
  const addPhoto = useCallback((photo: PhotoMeta) => {
    if (!currentPage) return;
    
    const newElement: PhotoElement = {
      id: `photo_${Date.now()}`,
      type: 'photo',
      photoId: photo.id,
      photo,
      transform: {
        position: snapToGrid({ x: 100, y: 100 }),
        dimensions: LAYOUT_CONSTRAINTS.defaultPhotoSize
      }
    };
    
    applyOperation({
      type: 'ADD_ELEMENT',
      element: newElement as AddendaElement,
      pageId: currentPage.id
    });
  }, [currentPage, snapToGrid, applyOperation]);

  const addText = useCallback(() => {
    if (!currentPage) return;
    
    const newElement: TextElement = {
      id: `text_${Date.now()}`,
      type: 'text',
      content: 'Click to edit text',
      transform: {
        position: snapToGrid({ x: 100, y: 100 }),
        dimensions: { width: 200, height: 30 }
      },
      style: {
        fontSize: 14,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left',
        color: '#000000'
      }
    };
    
    applyOperation({
      type: 'ADD_ELEMENT',
      element: newElement as AddendaElement,
      pageId: currentPage.id
    });
  }, [currentPage, snapToGrid, applyOperation]);

  const addHeading = useCallback(() => {
    if (!currentPage) return;
    
    const newElement: HeadingElement = {
      id: `heading_${Date.now()}`,
      type: 'heading',
      content: 'Heading Text',
      level: 1,
      transform: {
        position: snapToGrid({ x: 100, y: 100 }),
        dimensions: { width: 300, height: 40 }
      },
      style: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'left',
        color: '#000000',
        marginBottom: 16
      }
    };
    
    applyOperation({
      type: 'ADD_ELEMENT',
      element: newElement as AddendaElement,
      pageId: currentPage.id
    });
  }, [currentPage, snapToGrid, applyOperation]);

  // Selection management
  const selectElement = useCallback((elementId: string, addToSelection = false) => {
    setEditorState(prev => ({
      ...prev,
      selectedElements: addToSelection 
        ? new Set([...prev.selectedElements, elementId])
        : new Set([elementId])
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setEditorState(prev => ({
      ...prev,
      selectedElements: new Set()
    }));
  }, []);

  // Delete selected elements
  const deleteSelected = useCallback(() => {
    if (!currentPage || editorState.selectedElements.size === 0) return;
    
    Array.from(editorState.selectedElements).forEach(elementId => {
      applyOperation({
        type: 'DELETE_ELEMENT',
        elementId,
        pageId: currentPage.id
      });
    });
    
    clearSelection();
  }, [currentPage, editorState.selectedElements, applyOperation, clearSelection]);

  // Page management
  const addPage = useCallback(() => {
    const newPage: AddendaPage = {
      id: `page_${Date.now()}`,
      elements: [],
      settings: { ...DEFAULT_PAGE_SETTINGS }
    };
    
    applyOperation({
      type: 'ADD_PAGE',
      page: newPage
    });
    
    setCurrentPageIndex(document.pages.length);
  }, [document.pages.length, applyOperation]);

  // Calculate page dimensions for display
  const getPageDimensions = () => {
    const settings = currentPage?.settings || DEFAULT_PAGE_SETTINGS;
    const isLandscape = settings.orientation === 'landscape';
    
    // Standard page sizes in points (72 points = 1 inch)
    const sizes = {
      letter: { width: 612, height: 792 },
      a4: { width: 595, height: 842 },
      legal: { width: 612, height: 1008 }
    };
    
    const size = sizes[settings.size];
    return isLandscape ? { width: size.height, height: size.width } : size;
  };

  const pageDimensions = getPageDimensions();

  if (!currentPage) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">No pages in document</h3>
          <Button onClick={addPage} data-testid="button-add-first-page">
            <Plus className="h-4 w-4 mr-2" />
            Add First Page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full bg-muted/30", className)}>
      {/* Left Sidebar - Tools and Photos */}
      <div className="w-80 border-r bg-background p-4 space-y-4">
        <ScrollArea className="h-full">
          {/* Tools */}
          <div className="space-y-3">
            <h3 className="font-medium">Tools</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { tool: 'select', icon: MousePointer2, label: 'Select' },
                { tool: 'photo', icon: Image, label: 'Photo' },
                { tool: 'text', icon: Type, label: 'Text' },
                { tool: 'heading', icon: Heading1, label: 'Heading' },
              ].map(({ tool, icon: Icon, label }) => (
                <Button
                  key={tool}
                  variant={editorState.tool === tool ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEditorState(prev => ({ ...prev, tool: tool as any }))}
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

          {/* Photos Library */}
          <div className="space-y-3">
            <h3 className="font-medium">Photos</h3>
            <div className="space-y-2">
              {photos.map(photo => (
                <div
                  key={photo.id}
                  className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted"
                  onClick={() => addPhoto(photo)}
                  data-testid={`photo-item-${photo.id}`}
                >
                  <div className="w-12 h-12 bg-muted rounded overflow-hidden">
                    <img
                      src={`/api/orders/${photo.orderId}/photos/${photo.id}/file?variant=thumbnail`}
                      alt={`Photo ${photo.id}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{`Photo ${photo.id}`}</div>
                    <div className="text-xs text-muted-foreground">{photo.category}</div>
                  </div>
                </div>
              ))}
              {photos.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No photos available
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Grid Settings */}
          <div className="space-y-3">
            <h3 className="font-medium">Grid</h3>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="grid-visible"
                  checked={editorState.grid.visible}
                  onCheckedChange={(checked) => 
                    setEditorState(prev => ({
                      ...prev,
                      grid: { ...prev.grid, visible: checked }
                    }))
                  }
                />
                <Label htmlFor="grid-visible">Show Grid</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="grid-snap"
                  checked={editorState.grid.snap}
                  onCheckedChange={(checked) => 
                    setEditorState(prev => ({
                      ...prev,
                      grid: { ...prev.grid, snap: checked }
                    }))
                  }
                />
                <Label htmlFor="grid-snap">Snap to Grid</Label>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Toolbar */}
        <div className="border-b p-3 flex items-center justify-between bg-background">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={undo} disabled={editorState.history.past.length === 0}>
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={redo} disabled={editorState.history.future.length === 0}>
              <Redo2 className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            <Button variant="outline" size="sm" onClick={addText}>
              <Type className="h-4 w-4 mr-2" />
              Text
            </Button>
            <Button variant="outline" size="sm" onClick={addHeading}>
              <Heading1 className="h-4 w-4 mr-2" />
              Heading
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            <Button variant="outline" size="sm" onClick={deleteSelected} disabled={editorState.selectedElements.size === 0}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {Math.round(editorState.zoom * 100)}%
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditorState(prev => ({ ...prev, zoom: Math.max(0.25, prev.zoom - 0.25) }))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditorState(prev => ({ ...prev, zoom: Math.min(2, prev.zoom + 0.25) }))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            <Button variant="outline" size="sm" onClick={onPreview}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button variant="outline" size="sm" onClick={onSave}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button onClick={onExport}>
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Canvas Container */}
        <div className="flex-1 overflow-auto bg-muted/10 p-8">
          <div
            ref={canvasRef}
            className="relative mx-auto bg-white shadow-lg"
            style={{
              width: pageDimensions.width * editorState.zoom,
              height: pageDimensions.height * editorState.zoom,
              transform: `translate(${editorState.panOffset.x}px, ${editorState.panOffset.y}px)`,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                clearSelection();
              }
            }}
          >
            {/* Grid overlay */}
            {editorState.grid.visible && (
              <div
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                  backgroundImage: `
                    linear-gradient(to right, #000 1px, transparent 1px),
                    linear-gradient(to bottom, #000 1px, transparent 1px)
                  `,
                  backgroundSize: `${editorState.grid.size * editorState.zoom}px ${editorState.grid.size * editorState.zoom}px`
                }}
              />
            )}

            {/* Render elements */}
            {currentPage.elements.map(element => (
              <div
                key={element.id}
                className={cn(
                  "absolute border-2 cursor-pointer",
                  editorState.selectedElements.has(element.id)
                    ? "border-blue-500 bg-blue-500/10"
                    : "border-transparent hover:border-gray-300"
                )}
                style={{
                  left: element.transform.position.x * editorState.zoom,
                  top: element.transform.position.y * editorState.zoom,
                  width: element.transform.dimensions.width * editorState.zoom,
                  height: element.transform.dimensions.height * editorState.zoom,
                  zIndex: element.transform.zIndex || 1,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  selectElement(element.id, e.ctrlKey || e.metaKey);
                }}
                data-testid={`element-${element.id}`}
              >
                {element.type === 'photo' && (
                  <img
                    src={`/api/orders/${(element as PhotoElement).photo?.orderId}/photos/${element.photoId}/file?variant=display`}
                    alt={`Photo ${element.id}`}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                )}
                {element.type === 'text' && (
                  <div
                    className="w-full h-full p-2 text-sm"
                    style={{
                      fontSize: (element as TextElement).style.fontSize * editorState.zoom,
                      fontWeight: (element as TextElement).style.fontWeight,
                      fontStyle: (element as TextElement).style.fontStyle,
                      textAlign: (element as TextElement).style.textAlign,
                      color: (element as TextElement).style.color,
                    }}
                  >
                    {(element as TextElement).content}
                  </div>
                )}
                {element.type === 'heading' && (
                  <div
                    className="w-full h-full p-2 font-bold"
                    style={{
                      fontSize: (element as HeadingElement).style.fontSize * editorState.zoom,
                      fontWeight: (element as HeadingElement).style.fontWeight,
                      textAlign: (element as HeadingElement).style.textAlign,
                      color: (element as HeadingElement).style.color,
                    }}
                  >
                    {(element as HeadingElement).content}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Status Bar */}
        <div className="border-t p-2 bg-background flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Badge variant="outline">
              Page {currentPageIndex + 1} of {document.pages.length}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {currentPage.elements.length} elements
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={addPage}>
              <Plus className="h-4 w-4 mr-1" />
              Add Page
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}