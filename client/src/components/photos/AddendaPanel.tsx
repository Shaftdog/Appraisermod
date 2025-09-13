/**
 * Panel that provides simple addenda page management with PDF export
 */

import { useState } from 'react';
import { PhotoAddenda, PhotoMeta, AddendaPage, AddendaLayout } from '@/types/photos';
import { AddendaPdfExporter } from '@/components/addenda/AddendaPdfExporter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, Image, FileText, Loader2 } from 'lucide-react';
import { PDFExportSettings } from '@/types/addenda';

interface AddendaPanelProps {
  orderId: string;
  addenda: PhotoAddenda | null;
  photosById: Record<string, PhotoMeta>;
  isDirty: boolean;
  isSaving: boolean;
  onChange: (addenda: PhotoAddenda) => void;
  activeCell: { pageId: string; cellIndex: number } | null;
  onActiveCellChange: (cell: { pageId: string; cellIndex: number } | null) => void;
}

const DEFAULT_PDF_SETTINGS: PDFExportSettings = {
  quality: 'medium',
  includeBlurredPhotos: false,
  includeMetadata: true,
  title: 'Property Addenda',
  author: 'Appraiser',
  subject: 'Property Photo Documentation',
  keywords: ['appraisal', 'photos', 'property']
};

export function AddendaPanel({
  orderId,
  addenda,
  photosById,
  isDirty,
  isSaving,
  onChange,
  activeCell,
  onActiveCellChange
}: AddendaPanelProps) {
  const [pdfSettings, setPdfSettings] = useState<PDFExportSettings>(DEFAULT_PDF_SETTINGS);

  if (!addenda) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  const addPage = (layout: AddendaLayout) => {
    const newPage: AddendaPage = {
      id: `page-${Date.now()}`,
      layout,
      cells: Array(layout === '2up' ? 2 : layout === '4up' ? 4 : 6).fill(null).map(() => ({})),
      title: `${layout.toUpperCase()} Layout`
    };
    
    const updatedAddenda = {
      ...addenda,
      pages: [...addenda.pages, newPage],
      updatedAt: new Date().toISOString()
    };
    
    onChange(updatedAddenda);
  };

  const removePage = (pageId: string) => {
    const updatedAddenda = {
      ...addenda,
      pages: addenda.pages.filter(p => p.id !== pageId),
      updatedAt: new Date().toISOString()
    };
    
    onChange(updatedAddenda);
  };

  const updatePage = (pageId: string, updates: Partial<AddendaPage>) => {
    const updatedAddenda = {
      ...addenda,
      pages: addenda.pages.map(p => p.id === pageId ? { ...p, ...updates } : p),
      updatedAt: new Date().toISOString()
    };
    
    onChange(updatedAddenda);
  };

  const updateCell = (pageId: string, cellIndex: number, photoId?: string, caption?: string) => {
    const page = addenda.pages.find(p => p.id === pageId);
    if (!page) return;

    const newCells = [...page.cells];
    newCells[cellIndex] = { photoId, caption };

    updatePage(pageId, { cells: newCells });
  };

  return (
    <div className="space-y-4">
      {/* Header with status */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Photo Addenda</h3>
        <div className="flex items-center gap-2">
          {isSaving && (
            <Badge variant="secondary" className="gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving...
            </Badge>
          )}
          {isDirty && !isSaving && (
            <Badge variant="outline">Unsaved changes</Badge>
          )}
          {!isDirty && !isSaving && (
            <Badge variant="secondary">Saved</Badge>
          )}
        </div>
      </div>

      {/* Add Page Controls */}
      <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg">
        <Label>Add Page:</Label>
        <Button onClick={() => addPage('2up')} variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-1" />
          2-Up
        </Button>
        <Button onClick={() => addPage('4up')} variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-1" />
          4-Up
        </Button>
        <Button onClick={() => addPage('6up')} variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-1" />
          6-Up
        </Button>
      </div>

      {/* Pages */}
      <div className="space-y-4">
        {addenda.pages.length === 0 ? (
          <div className="text-center p-8 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No addenda pages yet</p>
            <p className="text-sm">Click "Add Page" to start building your addenda</p>
          </div>
        ) : (
          addenda.pages.map((page) => (
            <Card key={page.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{page.title}</CardTitle>
                  <Button
                    onClick={() => removePage(page.id)}
                    variant="outline"
                    size="sm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className={`grid gap-2 ${
                  page.layout === '2up' ? 'grid-cols-2' : 
                  page.layout === '4up' ? 'grid-cols-2 lg:grid-cols-4' : 
                  'grid-cols-2 lg:grid-cols-3'
                }`}>
                  {page.cells.map((cell, index) => {
                    const isActive = activeCell?.pageId === page.id && activeCell?.cellIndex === index;
                    return (
                      <div 
                        key={index} 
                        className={`border border-dashed rounded p-2 min-h-[100px] cursor-pointer transition-colors ${
                          isActive 
                            ? 'border-primary bg-primary/10' 
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => {
                          if (!cell.photoId) {
                            onActiveCellChange(isActive ? null : { pageId: page.id, cellIndex: index });
                          }
                        }}
                      >
                        {cell.photoId && photosById[cell.photoId] ? (
                          <div className="space-y-2">
                            <img
                              src={photosById[cell.photoId].thumbPath}
                              alt={photosById[cell.photoId].caption || 'Photo'}
                              className="w-full h-16 object-cover rounded"
                            />
                            <Input
                              value={cell.caption || ''}
                              onChange={(e) => updateCell(page.id, index, cell.photoId, e.target.value)}
                              placeholder="Caption..."
                              className="text-xs"
                            />
                            <Button
                              onClick={() => updateCell(page.id, index, undefined, undefined)}
                              variant="outline"
                              size="sm"
                              className="w-full"
                            >
                              Remove
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <Image className={`w-6 h-6 mb-2 ${isActive ? 'text-primary' : ''}`} />
                            <p className="text-xs text-center">
                              {isActive ? 'Click a photo in gallery to insert' : 'Click to select cell'}
                            </p>
                            {isActive && (
                              <Button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onActiveCellChange(null);
                                }}
                                variant="outline" 
                                size="sm" 
                                className="mt-2"
                              >
                                Cancel
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* PDF Export */}
      {addenda.pages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Export PDF</CardTitle>
          </CardHeader>
          <CardContent>
            <AddendaPdfExporter
              orderId={orderId}
              addenda={addenda}
              photosById={photosById}
              settings={pdfSettings}
              onExportComplete={(result) => {
                console.log('PDF export completed:', result);
              }}
              className="w-full"
            >
              <Button className="w-full">
                <FileText className="w-4 h-4 mr-2" />
                Generate PDF
              </Button>
            </AddendaPdfExporter>
          </CardContent>
        </Card>
      )}
    </div>
  );
}