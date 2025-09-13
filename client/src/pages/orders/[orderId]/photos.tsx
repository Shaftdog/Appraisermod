import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'wouter';
import { StatusChip } from '@/components/StatusChip';
import { SignoffPanel } from '@/components/SignoffPanel';
import { VersionDiffViewer } from '@/components/VersionDiffViewer';
import { Toolbar } from '@/components/Toolbar';
import { Order } from '@/types';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  PhotoCaptureBar,
  PhotoGallery,
  PhotoEditorModal,
  PhotosQcBadge,
  usePhotoSignoffBlock
} from '@/components/photos';
import { PhotoMeta, PhotoCategory } from '@/types/photos';
import * as photoApi from '@/lib/photoApi';

export default function Photos() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId;
  const [showVersions, setShowVersions] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Photo-specific state
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<PhotoCategory | 'all'>('all');
  const [editingPhoto, setEditingPhoto] = useState<PhotoMeta | null>(null);

  const { data: order } = useQuery<Order>({
    queryKey: ['/api/orders', orderId],
    enabled: !!orderId
  });

  // Photo queries
  const { data: photos = [], isLoading: photosLoading, error: photosError } = useQuery({
    queryKey: ['/api/photos', orderId],
    queryFn: () => photoApi.listPhotos(orderId!),
    enabled: !!orderId,
  });

  const { data: photosQc, isLoading: qcLoading } = useQuery({
    queryKey: ['/api/photos', orderId, 'qc'],
    queryFn: () => photoApi.getPhotosQc(orderId!),
    enabled: !!orderId,
  });

  // Photo mutations
  const deletePhotoMutation = useMutation({
    mutationFn: (photoId: string) => photoApi.deletePhoto(orderId!, photoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/photos', orderId] });
      queryClient.invalidateQueries({ queryKey: ['/api/photos', orderId, 'qc'] });
      toast({ title: "Photo deleted successfully" });
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const reorderPhotosMutation = useMutation({
    mutationFn: (photoIds: string[]) => photoApi.reorderPhotos(orderId!, photoIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/photos', orderId] });
      toast({ title: "Photos reordered successfully" });
    },
    onError: (error) => {
      toast({
        title: "Reorder failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const updatePhotoMutation = useMutation({
    mutationFn: ({ photoId, updates }: { photoId: string; updates: any }) =>
      photoApi.updatePhoto(orderId!, photoId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/photos', orderId] });
      queryClient.invalidateQueries({ queryKey: ['/api/photos', orderId, 'qc'] });
      toast({ title: "Photo updated successfully" });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const signoffMutation = useMutation({
    mutationFn: async (overrideReason?: string) => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/tabs/photos/signoff`, {
        action: 'sign-appraiser',
        overrideReason
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
      toast({
        title: "Section signed off",
        description: "Photos has been successfully signed off.",
      });
    },
    onError: (error) => {
      toast({
        title: "Sign-off failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Check if sign-off should be blocked by photo QC
  const { isBlocked: signoffBlocked, blockReason } = usePhotoSignoffBlock(photosQc);

  // Photo handlers
  const handlePhotoSelect = (photo: PhotoMeta) => {
    setSelectedPhotos(new Set([photo.id]));
  };

  const handlePhotoToggleSelect = (photo: PhotoMeta) => {
    setSelectedPhotos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(photo.id)) {
        newSet.delete(photo.id);
      } else {
        newSet.add(photo.id);
      }
      return newSet;
    });
  };

  const handlePhotosReorder = (filteredPhotos: PhotoMeta[], allPhotos: PhotoMeta[]) => {
    // Persist the reordered full photo array
    const photoIds = allPhotos.map(p => p.id);
    reorderPhotosMutation.mutate(photoIds);
  };

  const handlePhotoEdit = (photo: PhotoMeta) => {
    setEditingPhoto(photo);
  };

  const handlePhotoDelete = (photo: PhotoMeta) => {
    if (confirm(`Delete ${photo.filename}?`)) {
      deletePhotoMutation.mutate(photo.id);
    }
  };

  const handlePhotoSave = (photo: PhotoMeta, masks: PhotoMeta['masks']) => {
    updatePhotoMutation.mutate({
      photoId: photo.id,
      updates: { masks }
    });
    setEditingPhoto(null);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/photos', orderId] });
    queryClient.invalidateQueries({ queryKey: ['/api/photos', orderId, 'qc'] });
  };

  if (!order) return null;

  const tab = order.tabs.photos;
  if (!tab) return null;

  return (
    <div className="p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2" data-testid="heading-photos">
            Property Photos
          </h1>
          <p className="text-muted-foreground">
            Interior and exterior photography
          </p>
        </div>
        <div className="mt-4 lg:mt-0">
          <Toolbar onVersionsClick={() => setShowVersions(true)} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-medium text-foreground mb-4">Section Status</h3>
          <div className="flex items-center gap-3 mb-3">
            <StatusChip
              status={tab.qc.status}
              openIssues={tab.qc.openIssues}
              overriddenIssues={tab.qc.overriddenIssues}
              lastReviewedBy={tab.qc.lastReviewedBy}
              lastReviewedAt={tab.qc.lastReviewedAt}
            />
            <PhotosQcBadge qcSummary={photosQc} loading={qcLoading} />
          </div>
        </div>

        <SignoffPanel
          signoff={tab.signoff}
          status={signoffBlocked ? 'red' : tab.qc.status}
          openIssues={tab.qc.openIssues + (signoffBlocked ? 1 : 0)}
          onSignoff={signoffMutation.mutateAsync}
          overrideReason={blockReason || undefined}
        />
      </div>

      {signoffBlocked && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h4 className="font-medium text-red-800 mb-2">🚫 Sign-off Blocked</h4>
          <p className="text-sm text-red-700">{blockReason}</p>
        </div>
      )}

      {tab.qc.status === 'yellow' && tab.qc.openIssues > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h4 className="font-medium text-yellow-800 mb-2">⚠️ Warning</h4>
          <p className="text-sm text-yellow-700">Review photo requirements and quality issues</p>
        </div>
      )}

      {/* Photo Upload and Management */}
      <div className="space-y-6">
        <PhotoCaptureBar
          orderId={orderId!}
          selectedPhotos={selectedPhotos}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          onUploadComplete={handleRefresh}
          onBulkDelete={(photoIds) => {
            if (confirm(`Delete ${photoIds.length} selected photos?`)) {
              Promise.all(photoIds.map(id => photoApi.deletePhoto(orderId!, id)))
                .then(() => {
                  handleRefresh();
                  setSelectedPhotos(new Set());
                })
                .catch(error => {
                  toast({
                    title: "Bulk delete failed",
                    description: error.message,
                    variant: "destructive"
                  });
                });
            }
          }}
        />

        <PhotoGallery
          photos={photos}
          selectedPhotos={selectedPhotos}
          categoryFilter={categoryFilter}
          loading={photosLoading}
          error={photosError?.message}
          onPhotoSelect={handlePhotoSelect}
          onPhotoToggleSelect={handlePhotoToggleSelect}
          onPhotoEdit={handlePhotoEdit}
          onPhotoDelete={handlePhotoDelete}
          onPhotosReorder={handlePhotosReorder}
          onRefresh={handleRefresh}
        />
      </div>

      {/* Photo Editor Modal */}
      <PhotoEditorModal
        photo={editingPhoto}
        open={!!editingPhoto}
        onClose={() => setEditingPhoto(null)}
        onSave={handlePhotoSave}
        onDownload={(photo, variant) => {
          // TODO: Implement download functionality
          console.log('Download photo:', photo.id, variant);
        }}
      />

      {showVersions && (
        <VersionDiffViewer
          versions={tab.versions}
          currentData={tab.currentData}
          open={showVersions}
          onClose={() => setShowVersions(false)}
        />
      )}
    </div>
  );
}
