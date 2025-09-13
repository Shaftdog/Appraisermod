/**
 * Photo capture and upload toolbar with category filtering and bulk actions
 */

import { useState, useRef } from 'react';
import { Camera, Upload, Filter, Edit3, Trash2, Tag } from 'lucide-react';
import { PhotoCategory, CATEGORY_LABELS } from '@/types/photos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PhotoCaptureBarProps {
  selectedCount: number;
  categoryFilter?: PhotoCategory | 'all';
  onCategoryFilterChange: (category: PhotoCategory | 'all') => void;
  onPhotosSelect: (files: FileList) => void;
  onBulkCategory: (category: PhotoCategory) => void;
  onBulkCaption: (prefix: string) => void;
  onBulkDelete: () => void;
  disabled?: boolean;
}

export function PhotoCaptureBar({
  selectedCount,
  categoryFilter = 'all',
  onCategoryFilterChange,
  onPhotosSelect,
  onBulkCategory,
  onBulkCaption,
  onBulkDelete,
  disabled = false
}: PhotoCaptureBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [captionPrefix, setCaptionPrefix] = useState('');

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      onPhotosSelect(files);
      // Reset the input to allow selecting the same files again
      event.target.value = '';
    }
  };

  const triggerFileSelect = (useCamera = false) => {
    if (fileInputRef.current) {
      if (useCamera) {
        fileInputRef.current.setAttribute('capture', 'environment');
      } else {
        fileInputRef.current.removeAttribute('capture');
      }
      fileInputRef.current.click();
    }
  };

  const handleBulkCaptionSubmit = () => {
    if (captionPrefix.trim()) {
      onBulkCaption(captionPrefix.trim());
      setCaptionPrefix('');
    }
  };

  return (
    <div className="bg-card border-b border-border p-4">
      <div className="flex flex-col gap-4">
        {/* Top row: Upload controls and category filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            data-testid="photo-file-input"
          />

          {/* Upload buttons */}
          <div className="flex gap-2">
            <Button
              onClick={() => triggerFileSelect(false)}
              disabled={disabled}
              className="flex items-center gap-2"
              data-testid="button-upload-files"
            >
              <Upload className="h-4 w-4" />
              Upload Photos
            </Button>
            
            <Button
              variant="outline"
              onClick={() => triggerFileSelect(true)}
              disabled={disabled}
              className="flex items-center gap-2"
              data-testid="button-capture-camera"
            >
              <Camera className="h-4 w-4" />
              Use Camera
            </Button>
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={categoryFilter}
              onValueChange={(value) => onCategoryFilterChange(value as PhotoCategory | 'all')}
              data-testid="select-category-filter"
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selection count */}
          {selectedCount > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {selectedCount} selected
            </Badge>
          )}
        </div>

        {/* Bottom row: Bulk actions (only visible when photos are selected) */}
        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border">
            <span className="text-sm font-medium">Bulk Actions:</span>
            
            {/* Bulk category assignment */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex items-center gap-2"
                  data-testid="button-bulk-category"
                >
                  <Tag className="h-4 w-4" />
                  Assign Category
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <DropdownMenuItem
                    key={key}
                    onClick={() => onBulkCategory(key as PhotoCategory)}
                  >
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Bulk caption prefix */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="Caption prefix..."
                value={captionPrefix}
                onChange={(e) => setCaptionPrefix(e.target.value)}
                className="w-40"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleBulkCaptionSubmit();
                  }
                }}
                data-testid="input-caption-prefix"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkCaptionSubmit}
                disabled={!captionPrefix.trim()}
                className="flex items-center gap-2"
                data-testid="button-apply-caption-prefix"
              >
                <Edit3 className="h-4 w-4" />
                Apply
              </Button>
            </div>

            {/* Bulk delete */}
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkDelete}
              className="flex items-center gap-2 text-destructive hover:text-destructive border-destructive/20 hover:border-destructive"
              data-testid="button-bulk-delete"
            >
              <Trash2 className="h-4 w-4" />
              Delete Selected
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}