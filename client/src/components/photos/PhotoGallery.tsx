/**
 * Photo gallery with drag-reorder, selection, and infinite scroll
 */

import { useState, useEffect, useMemo } from 'react';
import { PhotoMeta, PhotoCategory } from '@/types/photos';
import { PhotoTile } from './PhotoTile';
import { PhotoUploadProgress } from './PhotoUploadProgress';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface PhotoGalleryProps {
  photos: PhotoMeta[];
  selectedPhotos: Set<string>;
  categoryFilter: PhotoCategory | 'all';
  uploads?: Array<{
    id: string;
    file: File;
    progress: number;
    status: 'uploading' | 'processing' | 'complete' | 'error';
    error?: string;
  }>;
  loading?: boolean;
  error?: string;
  onPhotoSelect: (photo: PhotoMeta) => void;
  onPhotoToggleSelect: (photo: PhotoMeta) => void;
  onPhotoEdit: (photo: PhotoMeta) => void;
  onPhotoDelete: (photo: PhotoMeta) => void;
  onPhotosReorder?: (reorderedPhotos: PhotoMeta[], allPhotos: PhotoMeta[]) => void;
  onRefresh?: () => void;
  className?: string;
}

export function PhotoGallery({
  photos,
  selectedPhotos,
  categoryFilter,
  uploads = [],
  loading = false,
  error,
  onPhotoSelect,
  onPhotoToggleSelect,
  onPhotoEdit,
  onPhotoDelete,
  onPhotosReorder,
  onRefresh,
  className
}: PhotoGalleryProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Filter photos by category
  const filteredPhotos = useMemo(() => {
    if (categoryFilter === 'all') {
      return photos;
    }
    return photos.filter(photo => photo.category === categoryFilter);
  }, [photos, categoryFilter]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Clear all selections
        filteredPhotos.forEach(photo => {
          if (selectedPhotos.has(photo.id)) {
            onPhotoToggleSelect(photo);
          }
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [filteredPhotos, selectedPhotos, onPhotoToggleSelect]);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', ''); // Required for Firefox
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    if (onPhotosReorder) {
      // Get the actual photos being reordered in the filtered view
      const draggedPhoto = filteredPhotos[draggedIndex];
      const targetPhoto = filteredPhotos[dropIndex];
      
      // Create new order for ALL photos, not just filtered ones
      const newAllPhotos = [...photos];
      
      // Find indices in the full photo array
      const draggedGlobalIndex = newAllPhotos.findIndex(p => p.id === draggedPhoto.id);
      const targetGlobalIndex = newAllPhotos.findIndex(p => p.id === targetPhoto.id);
      
      if (draggedGlobalIndex !== -1 && targetGlobalIndex !== -1) {
        // Remove from old position
        const [removed] = newAllPhotos.splice(draggedGlobalIndex, 1);
        
        // Calculate new insertion index (adjust if we moved an item from before the target)
        const newTargetIndex = draggedGlobalIndex < targetGlobalIndex 
          ? targetGlobalIndex - 1 
          : targetGlobalIndex;
        
        // Insert at new position
        newAllPhotos.splice(newTargetIndex, 0, removed);
        
        // Call with both the reordered filtered photos and the full photo array
        const newFilteredPhotos = newAllPhotos.filter(photo => 
          categoryFilter === 'all' || photo.category === categoryFilter
        );
        
        onPhotosReorder(newFilteredPhotos, newAllPhotos);
      }
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handlePhotoClick = (photo: PhotoMeta, e?: React.MouseEvent) => {
    if (e && (e.ctrlKey || e.metaKey)) {
      // Multi-select with Ctrl/Cmd
      onPhotoToggleSelect(photo);
    } else {
      // Single select
      onPhotoSelect(photo);
    }
  };

  if (error) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12", className)}>
        <div className="text-center">
          <p className="text-destructive mb-4">Failed to load photos</p>
          <p className="text-muted-foreground mb-4">{error}</p>
          {onRefresh && (
            <Button onClick={onRefresh} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (loading && filteredPhotos.length === 0 && uploads.length === 0) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading photos...</p>
        </div>
      </div>
    );
  }

  if (filteredPhotos.length === 0 && uploads.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12", className)}>
        <div className="text-center">
          <p className="text-muted-foreground mb-2">No photos found</p>
          {categoryFilter !== 'all' && (
            <p className="text-sm text-muted-foreground">
              Try changing the category filter or upload new photos
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Upload progress indicators */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((upload) => (
            <PhotoUploadProgress
              key={upload.id}
              upload={upload}
            />
          ))}
        </div>
      )}

      {/* Photo grid */}
      <div 
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
        data-testid="photo-gallery-grid"
      >
        {filteredPhotos.map((photo, index) => (
          <div
            key={photo.id}
            draggable={!!onPhotosReorder}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={cn(
              "transition-all duration-200",
              draggedIndex === index && "opacity-50 scale-95",
              dragOverIndex === index && "scale-105",
              onPhotosReorder && "cursor-move"
            )}
          >
            <PhotoTile
              photo={photo}
              selected={selectedPhotos.has(photo.id)}
              onSelect={handlePhotoClick}
              onEdit={onPhotoEdit}
              onDelete={onPhotoDelete}
              dragHandleProps={onPhotosReorder ? {
                'data-drag-handle': true
              } : undefined}
            />
          </div>
        ))}
      </div>

      {/* Loading indicator for additional photos */}
      {loading && filteredPhotos.length > 0 && (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Instructions */}
      {filteredPhotos.length > 0 && (
        <div className="text-center text-sm text-muted-foreground pt-4 border-t">
          <p>
            Click to select • Ctrl/Cmd+Click for multi-select • ESC to clear selection
            {onPhotosReorder && " • Drag to reorder"}
          </p>
        </div>
      )}
    </div>
  );
}