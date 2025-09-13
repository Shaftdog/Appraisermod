/**
 * Panel that integrates AddendaBuilder with PDF export functionality
 */

import { PhotoAddenda, PhotoMeta } from '@/types/photos';
import { AddendaBuilder } from '@/components/addenda/AddendaBuilder';
import { AddendaExportBar } from '@/components/addenda/AddendaExportBar';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface AddendaPanelProps {
  orderId: string;
  addenda: PhotoAddenda | null;
  photosById: Record<string, PhotoMeta>;
  isDirty: boolean;
  isSaving: boolean;
  onChange: (addenda: PhotoAddenda) => void;
  onExport: (options: any) => void;
}

export function AddendaPanel({
  orderId,
  addenda,
  photosById,
  isDirty,
  isSaving,
  onChange,
  onExport
}: AddendaPanelProps) {
  if (!addenda) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

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

      {/* Addenda Builder */}
      <div className="border border-border rounded-lg p-4">
        <AddendaBuilder
          addenda={addenda}
          photosById={photosById}
          onChange={onChange}
        />
      </div>

      {/* Export Controls */}
      <div className="border-t pt-4">
        <AddendaExportBar
          orderId={orderId}
          addenda={addenda}
          photosById={photosById}
        />
      </div>
    </div>
  );
}