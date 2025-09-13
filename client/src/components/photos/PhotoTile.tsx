/**
 * Individual photo tile component with thumbnail, metadata, and actions
 */

import { useState } from 'react';
import { MoreVertical, Edit, Trash2, MapPin, Calendar, Camera } from 'lucide-react';
import { PhotoMeta, CATEGORY_LABELS } from '@/types/photos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface PhotoTileProps {
  photo: PhotoMeta;
  selected?: boolean;
  onSelect?: (photo: PhotoMeta, e?: React.MouseEvent) => void;
  onEdit?: (photo: PhotoMeta) => void;
  onDelete?: (photo: PhotoMeta) => void;
  onCategoryChange?: (photo: PhotoMeta, category: string) => void;
  dragHandleProps?: any; // For drag-and-drop integration
}

export function PhotoTile({
  photo,
  selected = false,
  onSelect,
  onEdit,
  onDelete,
  onCategoryChange,
  dragHandleProps
}: PhotoTileProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const handleImageLoad = () => setImageLoading(false);
  const handleImageError = () => {
    setImageError(true);
    setImageLoading(false);
  };

  const displayUrl = photo.processing?.blurredPath 
    ? `/api/orders/${photo.orderId}/photos/${photo.id}/file?variant=blurred`
    : `/api/orders/${photo.orderId}/photos/${photo.id}/file?variant=display`;

  const thumbnailUrl = `/api/orders/${photo.orderId}/photos/${photo.id}/file?variant=thumb`;

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch {
      return null;
    }
  };

  return (
    <div
      className={cn(
        "group relative bg-card border rounded-lg overflow-hidden transition-all duration-200",
        "hover:shadow-md hover:border-primary/20",
        selected && "ring-2 ring-primary border-primary",
        "cursor-pointer"
      )}
      onClick={(e) => onSelect?.(photo, e)}
      data-testid={`photo-tile-${photo.id}`}
      {...dragHandleProps}
    >
      {/* Image Container */}
      <div className="aspect-[4/3] relative overflow-hidden bg-muted">
        {imageLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        )}
        
        {!imageError ? (
          <img
            src={thumbnailUrl}
            alt={photo.caption || 'Photo'}
            className={cn(
              "w-full h-full object-cover transition-opacity duration-200",
              imageLoading && "opacity-0"
            )}
            onLoad={handleImageLoad}
            onError={handleImageError}
            data-testid={`photo-image-${photo.id}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Camera className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {/* Overlay badges */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {photo.category && (
            <Badge variant="secondary" className="text-xs">
              {CATEGORY_LABELS[photo.category]}
            </Badge>
          )}
          {photo.processing?.blurredPath && (
            <Badge variant="outline" className="text-xs bg-background/80">
              Processed
            </Badge>
          )}
        </div>

        {/* Action menu */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 bg-background/80 hover:bg-background"
                data-testid={`photo-menu-${photo.id}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => {
                e.stopPropagation();
                onEdit?.(photo);
              }}>
                <Edit className="h-4 w-4 mr-2" />
                Edit & Blur
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(photo);
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Selection indicator */}
        {selected && (
          <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white"></div>
            </div>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="p-3 space-y-2">
        {/* Caption */}
        {photo.caption && (
          <p 
            className="text-sm text-foreground line-clamp-2 font-medium"
            title={photo.caption}
            data-testid={`photo-caption-${photo.id}`}
          >
            {photo.caption}
          </p>
        )}

        {/* EXIF metadata */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {photo.exif?.takenAt && formatDate(photo.exif.takenAt) && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{formatDate(photo.exif.takenAt)}</span>
            </div>
          )}
          {photo.exif?.gps && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span>GPS</span>
            </div>
          )}
        </div>

        {/* Dimensions */}
        <div className="text-xs text-muted-foreground">
          {photo.width} × {photo.height}
        </div>

        {/* Auto-detections indicator */}
        {photo.masks?.autoDetections && photo.masks.autoDetections.length > 0 && (
          <div className="flex items-center gap-1 text-xs">
            <Badge 
              variant={photo.masks.autoDetections.some(d => !d.accepted) ? "destructive" : "default"}
              className="text-xs"
            >
              {photo.masks.autoDetections.filter(d => !d.accepted).length > 0 
                ? `${photo.masks.autoDetections.filter(d => !d.accepted).length} unresolved`
                : `${photo.masks.autoDetections.length} faces processed`
              }
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}