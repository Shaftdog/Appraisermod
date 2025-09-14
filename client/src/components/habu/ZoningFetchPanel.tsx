import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Download, CheckCircle, AlertTriangle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { ZoningData, UseCategory, HabuInputs } from '@shared/habu';

interface ZoningFetchPanelProps {
  orderId: string;
  currentZoning?: ZoningData;
  currentHabuInputs?: HabuInputs;
  onZoningUpdate: () => void;
}

const USE_CATEGORY_LABELS: Record<UseCategory, string> = {
  singleFamily: 'Single Family Residential',
  multiFamily: 'Multi-Family Residential',
  townhome: 'Townhome',
  condo: 'Condominium',
  office: 'Office',
  retail: 'Retail',
  industrial: 'Industrial',
  mixedUse: 'Mixed Use',
  ag: 'Agricultural',
  specialPurpose: 'Special Purpose',
  vacantResidential: 'Vacant Residential',
  vacantCommercial: 'Vacant Commercial'
};

export function ZoningFetchPanel({ orderId, currentZoning, currentHabuInputs, onZoningUpdate }: ZoningFetchPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedZoning, setEditedZoning] = useState<ZoningData | null>(currentZoning || null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fetchZoningMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/habu/zoning/fetch`, {});
      return response.json();
    },
    onSuccess: (data: ZoningData) => {
      setEditedZoning(data);
      setIsEditing(true);
      onZoningUpdate();
      toast({
        title: "Zoning data fetched",
        description: "Zoning information has been retrieved and is ready for review.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fetch failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const saveZoningMutation = useMutation({
    mutationFn: async (zoningData: ZoningData) => {
      if (!currentHabuInputs) {
        throw new Error('No HABU inputs available to update');
      }
      
      // Update the HABU inputs with new zoning data
      const updatedInputs: HabuInputs = {
        ...currentHabuInputs,
        zoning: zoningData,
        // Update candidate uses based on new zoning allowedUses if they're empty
        candidateUses: currentHabuInputs.candidateUses.length > 0 
          ? currentHabuInputs.candidateUses 
          : zoningData.allowedUses.slice(0, 3) // Take first 3 allowed uses as default candidates
      };
      
      const response = await apiRequest('PUT', `/api/orders/${orderId}/habu/inputs`, updatedInputs);
      return response.json();
    },
    onSuccess: () => {
      setIsEditing(false);
      // Invalidate HABU queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'habu'] });
      onZoningUpdate();
      toast({
        title: "Zoning data saved",
        description: "Zoning information has been saved to HABU inputs.",
      });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleFetch = () => {
    fetchZoningMutation.mutate();
  };

  const handleSave = () => {
    if (editedZoning) {
      saveZoningMutation.mutate(editedZoning);
    }
  };

  const updateZoning = (field: string, value: any) => {
    if (!editedZoning) return;
    setEditedZoning(prev => ({
      ...prev!,
      [field]: value
    }));
  };

  const toggleAllowedUse = (use: UseCategory) => {
    if (!editedZoning) return;
    const currentUses = editedZoning.allowedUses;
    const newUses = currentUses.includes(use)
      ? currentUses.filter(u => u !== use)
      : [...currentUses, use];
    
    updateZoning('allowedUses', newUses);
  };

  return (
    <div className="space-y-4" data-testid="zoning-fetch-panel">
      {/* Fetch Button */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">Zoning Data Source</h4>
          <p className="text-sm text-muted-foreground">
            Fetch zoning information from external providers or enter manually
          </p>
        </div>
        <Button
          onClick={handleFetch}
          disabled={fetchZoningMutation.isPending}
          variant="outline"
          className="flex items-center gap-2"
          data-testid="button-fetch-zoning"
        >
          {fetchZoningMutation.isPending ? (
            <>
              <Download className="w-4 h-4 animate-spin" />
              Fetching...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Fetch Zoning Data
            </>
          )}
        </Button>
      </div>

      {/* Current Zoning Display */}
      {editedZoning && (
        <Card>
          <CardContent className="pt-6">
            {!isEditing ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h5 className="font-medium">Current Zoning Information</h5>
                  <Button
                    onClick={() => setIsEditing(true)}
                    variant="outline"
                    size="sm"
                    data-testid="button-edit-zoning"
                  >
                    Edit
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Zoning Code</Label>
                    <p className="text-sm text-muted-foreground">
                      {editedZoning.code || 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Description</Label>
                    <p className="text-sm text-muted-foreground">
                      {editedZoning.description || 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Source</Label>
                    <Badge variant="outline" className="w-fit">
                      {editedZoning.source}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Fetched At</Label>
                    <p className="text-sm text-muted-foreground">
                      {editedZoning.fetchedAt ? new Date(editedZoning.fetchedAt).toLocaleString() : 'Manual entry'}
                    </p>
                  </div>
                </div>

                <Separator />

                <div>
                  <Label className="text-sm font-medium mb-2 block">Allowed Uses</Label>
                  <div className="flex flex-wrap gap-2">
                    {editedZoning.allowedUses.map((use) => (
                      <Badge key={use} variant="secondary">
                        {USE_CATEGORY_LABELS[use] || use}
                      </Badge>
                    ))}
                  </div>
                </div>

                {(editedZoning.minLotSizeSqft || editedZoning.maxDensityDUA || editedZoning.maxHeightFt) && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {editedZoning.minLotSizeSqft && (
                        <div>
                          <Label className="text-sm font-medium">Min Lot Size</Label>
                          <p className="text-sm text-muted-foreground">
                            {editedZoning.minLotSizeSqft.toLocaleString()} sq ft
                          </p>
                        </div>
                      )}
                      {editedZoning.maxDensityDUA && (
                        <div>
                          <Label className="text-sm font-medium">Max Density</Label>
                          <p className="text-sm text-muted-foreground">
                            {editedZoning.maxDensityDUA} DUA
                          </p>
                        </div>
                      )}
                      {editedZoning.maxHeightFt && (
                        <div>
                          <Label className="text-sm font-medium">Max Height</Label>
                          <p className="text-sm text-muted-foreground">
                            {editedZoning.maxHeightFt} ft
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {editedZoning.notes && (
                  <>
                    <Separator />
                    <div>
                      <Label className="text-sm font-medium">Notes</Label>
                      <p className="text-sm text-muted-foreground">
                        {editedZoning.notes}
                      </p>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h5 className="font-medium">Edit Zoning Information</h5>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setIsEditing(false)}
                      variant="outline"
                      size="sm"
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={saveZoningMutation.isPending}
                      size="sm"
                      data-testid="button-save-zoning"
                    >
                      {saveZoningMutation.isPending ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="zoningCode">Zoning Code</Label>
                    <Input
                      id="zoningCode"
                      value={editedZoning.code || ''}
                      onChange={(e) => updateZoning('code', e.target.value)}
                      placeholder="e.g., R-1"
                      data-testid="input-zoning-code"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zoningDescription">Description</Label>
                    <Input
                      id="zoningDescription"
                      value={editedZoning.description || ''}
                      onChange={(e) => updateZoning('description', e.target.value)}
                      placeholder="e.g., Single Family Residential"
                      data-testid="input-zoning-description"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minLotSize">Min Lot Size (sq ft)</Label>
                    <Input
                      id="minLotSize"
                      type="number"
                      value={editedZoning.minLotSizeSqft || ''}
                      onChange={(e) => updateZoning('minLotSizeSqft', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="e.g., 6000"
                      data-testid="input-min-lot-size"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxDensity">Max Density (DUA)</Label>
                    <Input
                      id="maxDensity"
                      type="number"
                      step="0.1"
                      value={editedZoning.maxDensityDUA || ''}
                      onChange={(e) => updateZoning('maxDensityDUA', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="e.g., 7.3"
                      data-testid="input-max-density"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxHeight">Max Height (ft)</Label>
                    <Input
                      id="maxHeight"
                      type="number"
                      value={editedZoning.maxHeightFt || ''}
                      onChange={(e) => updateZoning('maxHeightFt', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="e.g., 35"
                      data-testid="input-max-height"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Allowed Uses</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {Object.entries(USE_CATEGORY_LABELS).map(([use, label]) => (
                      <div
                        key={use}
                        className={`p-2 border rounded cursor-pointer transition-colors ${
                          editedZoning.allowedUses.includes(use as UseCategory)
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => toggleAllowedUse(use as UseCategory)}
                        data-testid={`allowed-use-${use}`}
                      >
                        <div className="text-xs font-medium">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="zoningNotes">Notes</Label>
                  <Textarea
                    id="zoningNotes"
                    value={editedZoning.notes || ''}
                    onChange={(e) => updateZoning('notes', e.target.value)}
                    placeholder="Additional zoning information or restrictions..."
                    rows={3}
                    data-testid="textarea-zoning-notes"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status Alert */}
      {!editedZoning && (
        <Alert>
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            Zoning information is required for legal permissibility analysis. 
            Fetch data from external providers or enter zoning details manually.
          </AlertDescription>
        </Alert>
      )}

      {editedZoning && !isEditing && (
        <Alert>
          <CheckCircle className="w-4 h-4" />
          <AlertDescription>
            Zoning information is configured and ready for HABU analysis.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}