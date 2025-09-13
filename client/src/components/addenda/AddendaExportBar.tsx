/**
 * Export toolbar for addenda with template selection and PDF generation
 */

import { useState } from 'react';
import {
  Download,
  FileText,
  Settings,
  Eye,
  Image,
  Printer,
  Save,
  Share2,
  RotateCcw
} from 'lucide-react';
import {
  AddendaDocument,
  AddendaTemplate,
  PDFExportSettings,
  AddendaStats
} from '@/types/addenda';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ADDENDA_TEMPLATES, TemplateThumbnail } from './AddendaTemplates';
import { cn } from '@/lib/utils';
import { AddendaPdfExporter } from './AddendaPdfExporter';
import { PhotoMeta, PhotoAddenda } from '@/types/photos';

interface AddendaExportBarProps {
  orderId: string;
  document: AddendaDocument;
  addenda: PhotoAddenda;
  photosById: Record<string, PhotoMeta>;
  stats: AddendaStats;
  onApplyTemplate: (template: AddendaTemplate) => void;
  onPreview: () => void;
  onSave: () => void;
  className?: string;
}

export function AddendaExportBar({
  orderId,
  document,
  addenda,
  photosById,
  stats,
  onApplyTemplate,
  onPreview,
  onSave,
  className
}: AddendaExportBarProps) {
  const [exportSettings, setExportSettings] = useState<PDFExportSettings>({
    title: document.title,
    author: '',
    subject: 'Property Photo Addenda',
    keywords: ['property', 'photos', 'addenda'],
    quality: 'high',
    includeMetadata: true,
    includeBlurredPhotos: false,
    watermark: {
      text: '',
      opacity: 0.5,
      position: 'corner'
    }
  });

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showTemplatesDialog, setShowTemplatesDialog] = useState(false);

  const handleExport = () => {
    setShowExportDialog(false);
  };

  const handleTemplateApply = (template: AddendaTemplate) => {
    onApplyTemplate(template);
    setShowTemplatesDialog(false);
  };

  return (
    <div className={cn("flex items-center justify-between p-4 border-b bg-background", className)}>
      {/* Left side - Document info */}
      <div className="flex items-center gap-4">
        <div>
          <h2 className="font-medium text-foreground">{document.title}</h2>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{stats.totalPages} pages</span>
            <span>{stats.totalPhotos} photos</span>
            <span>{stats.totalElements} elements</span>
            <Badge variant="outline" className="text-xs">
              {stats.estimatedPDFSize}
            </Badge>
          </div>
        </div>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center gap-2">
        {/* Templates */}
        <Dialog open={showTemplatesDialog} onOpenChange={setShowTemplatesDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-templates">
              <FileText className="h-4 w-4 mr-2" />
              Templates
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Choose Template</DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-96">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                {ADDENDA_TEMPLATES.map((template) => (
                  <div
                    key={template.id}
                    className="flex flex-col items-center space-y-2 p-3 border rounded-lg cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => handleTemplateApply(template)}
                    data-testid={`template-${template.id}`}
                  >
                    <TemplateThumbnail template={template} />
                    <div className="text-center">
                      <div className="font-medium text-sm">{template.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {template.description}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {template.category}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <Separator orientation="vertical" className="h-6" />

        {/* Quick Actions */}
        <Button variant="outline" size="sm" onClick={onPreview} data-testid="button-preview">
          <Eye className="h-4 w-4 mr-2" />
          Preview
        </Button>

        <Button variant="outline" size="sm" onClick={onSave} data-testid="button-save">
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>

        {/* Export Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-export-menu">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowExportDialog(true)}>
              <FileText className="h-4 w-4 mr-2" />
              Export as PDF
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <AddendaPdfExporter
                orderId={orderId}
                addenda={addenda}
                photosById={photosById}
                settings={{ ...exportSettings, quality: 'low' }}
              >
                <div className="flex items-center">
                  <Image className="h-4 w-4 mr-2" />
                  Quick Export (Low Quality)
                </div>
              </AddendaPdfExporter>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onPreview}>
              <Eye className="h-4 w-4 mr-2" />
              Print Preview
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Export Settings Dialog */}
        <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Export Settings</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Document Metadata */}
              <div className="space-y-3">
                <h4 className="font-medium">Document Information</h4>
                <div className="space-y-2">
                  <Label htmlFor="export-title">Title</Label>
                  <Input
                    id="export-title"
                    value={exportSettings.title}
                    onChange={(e) => setExportSettings(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Document title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="export-author">Author</Label>
                  <Input
                    id="export-author"
                    value={exportSettings.author || ''}
                    onChange={(e) => setExportSettings(prev => ({ ...prev, author: e.target.value }))}
                    placeholder="Author name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="export-subject">Subject</Label>
                  <Input
                    id="export-subject"
                    value={exportSettings.subject || ''}
                    onChange={(e) => setExportSettings(prev => ({ ...prev, subject: e.target.value }))}
                    placeholder="Document subject"
                  />
                </div>
              </div>

              <Separator />

              {/* Export Options */}
              <div className="space-y-3">
                <h4 className="font-medium">Export Options</h4>
                
                <div className="space-y-2">
                  <Label htmlFor="export-quality">Quality</Label>
                  <Select
                    value={exportSettings.quality}
                    onValueChange={(value: 'low' | 'medium' | 'high') => 
                      setExportSettings(prev => ({ ...prev, quality: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low (Smaller file)</SelectItem>
                      <SelectItem value="medium">Medium (Balanced)</SelectItem>
                      <SelectItem value="high">High (Best quality)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="include-metadata"
                    checked={exportSettings.includeMetadata}
                    onCheckedChange={(checked) => 
                      setExportSettings(prev => ({ ...prev, includeMetadata: checked }))
                    }
                  />
                  <Label htmlFor="include-metadata">Include photo metadata</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="include-blurred"
                    checked={exportSettings.includeBlurredPhotos}
                    onCheckedChange={(checked) => 
                      setExportSettings(prev => ({ ...prev, includeBlurredPhotos: checked }))
                    }
                  />
                  <Label htmlFor="include-blurred">Include blurred photos</Label>
                </div>
              </div>

              <Separator />

              {/* Watermark */}
              <div className="space-y-3">
                <h4 className="font-medium">Watermark (Optional)</h4>
                <div className="space-y-2">
                  <Label htmlFor="watermark-text">Watermark Text</Label>
                  <Input
                    id="watermark-text"
                    value={exportSettings.watermark?.text || ''}
                    onChange={(e) => setExportSettings(prev => ({
                      ...prev,
                      watermark: {
                        ...prev.watermark!,
                        text: e.target.value
                      }
                    }))}
                    placeholder="CONFIDENTIAL"
                  />
                </div>
                {exportSettings.watermark?.text && (
                  <div className="space-y-2">
                    <Label htmlFor="watermark-position">Position</Label>
                    <Select
                      value={exportSettings.watermark.position}
                      onValueChange={(value: 'center' | 'corner') => 
                        setExportSettings(prev => ({
                          ...prev,
                          watermark: {
                            ...prev.watermark!,
                            position: value
                          }
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="center">Center</SelectItem>
                        <SelectItem value="corner">Corner</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Export Actions */}
              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowExportDialog(false)} className="flex-1">
                  Cancel
                </Button>
                <AddendaPdfExporter
                  orderId={orderId}
                  addenda={addenda}
                  photosById={photosById}
                  settings={exportSettings}
                  onExportComplete={() => setShowExportDialog(false)}
                  className="flex-1"
                >
                  <Button className="w-full" data-testid="button-export-confirm">
                    <Download className="h-4 w-4 mr-2" />
                    Export PDF
                  </Button>
                </AddendaPdfExporter>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}