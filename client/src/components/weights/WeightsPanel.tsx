import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RotateCcw, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { calculateWeightPercentages, normalizeWeights } from "@shared/scoring";
import { WeightSlider } from "./WeightSlider";
import { ConstraintSlider } from "./ConstraintSlider";
import { WeightPresetChips } from "./WeightPresetChips";
import { WeightProfileSelector } from "./WeightProfileSelector";
import type { WeightSet, ConstraintSet, WeightProfile, OrderWeights } from "@shared/schema";

interface WeightsPanelProps {
  orderId: string;
  onWeightsApplied?: () => void;
}

export function WeightsPanel({ orderId, onWeightsApplied }: WeightsPanelProps) {
  const [weights, setWeights] = useState<WeightSet>({
    distance: 8, recency: 8, gla: 7, quality: 6, condition: 6
  });
  const [constraints, setConstraints] = useState<ConstraintSet>({
    glaTolerancePct: 10, distanceCapMiles: 0.5
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string>();

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch shop default profile
  const { data: shopDefault } = useQuery<WeightProfile>({
    queryKey: ["/api/weights/shop-default"]
  });

  // Fetch user profiles
  const { data: userProfiles = [] } = useQuery<WeightProfile[]>({
    queryKey: ["/api/weights/profiles"]
  });

  // Fetch current order weights
  const { data: orderWeights, isLoading } = useQuery<OrderWeights>({
    queryKey: ["/api/orders", orderId, "weights"]
  });

  // All profiles (shop default + user profiles)
  const allProfiles: WeightProfile[] = shopDefault ? [shopDefault, ...userProfiles] : userProfiles;

  // Initialize weights from order data
  useEffect(() => {
    if (orderWeights && !hasUnsavedChanges) {
      setWeights(orderWeights.weights);
      setConstraints(orderWeights.constraints);
      setActivePresetId(orderWeights.activeProfileId);
    }
  }, [orderWeights, hasUnsavedChanges]);

  // Apply weights mutation
  const applyWeightsMutation = useMutation({
    mutationFn: async (): Promise<OrderWeights> => {
      const response = await apiRequest('PUT', `/api/orders/${orderId}/weights`, {
        weights,
        constraints,
        activeProfileId: activePresetId
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "weights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "comps"] });
      setHasUnsavedChanges(false);
      toast({
        title: "Weights applied",
        description: "Comparable properties have been re-ranked with the new weights."
      });
      onWeightsApplied?.();
    },
    onError: (error) => {
      toast({
        title: "Failed to apply weights",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Reset to shop defaults mutation
  const resetMutation = useMutation({
    mutationFn: async (): Promise<OrderWeights> => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/weights/reset`, {});
      return response.json();
    },
    onSuccess: (data: OrderWeights) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "weights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "comps"] });
      setWeights(data.weights);
      setConstraints(data.constraints);
      setActivePresetId(data.activeProfileId);
      setHasUnsavedChanges(false);
      toast({
        title: "Reset to shop defaults",
        description: "Weights have been reset to shop default values."
      });
      onWeightsApplied?.();
    },
    onError: (error) => {
      toast({
        title: "Failed to reset weights",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Save profile mutation
  const saveProfileMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }): Promise<WeightProfile> => {
      const response = await apiRequest('POST', '/api/weights/profiles', {
        name,
        description,
        weights,
        constraints
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weights/profiles"] });
    }
  });

  // Update profile mutation  
  const updateProfileMutation = useMutation({
    mutationFn: async ({ profileId, name, description }: { profileId: string; name: string; description?: string }): Promise<WeightProfile> => {
      const response = await apiRequest('PUT', `/api/weights/profiles/${profileId}`, {
        name,
        description,
        weights,
        constraints
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weights/profiles"] });
    }
  });

  // Delete profile mutation
  const deleteProfileMutation = useMutation({
    mutationFn: async (profileId: string): Promise<{ message: string }> => {
      const response = await apiRequest('DELETE', `/api/weights/profiles/${profileId}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/weights/profiles"] });
      setActivePresetId(undefined);
    }
  });

  const handleWeightChange = (weightKey: keyof WeightSet, value: number) => {
    setWeights(prev => ({ ...prev, [weightKey]: value }));
    setHasUnsavedChanges(true);
    setActivePresetId(undefined); // Clear active preset when manually adjusting
  };

  const handleConstraintChange = (key: keyof ConstraintSet, value: number) => {
    setConstraints(prev => ({ ...prev, [key]: value }));
    setHasUnsavedChanges(true);
    setActivePresetId(undefined); // Clear active preset when manually adjusting
  };

  const handlePresetSelect = (presetWeights: WeightSet, presetConstraints: ConstraintSet, presetName: string) => {
    setWeights(presetWeights);
    setConstraints(presetConstraints);
    setHasUnsavedChanges(true);
    // Find matching preset ID
    const matchingPreset = allProfiles.find(p => p.name === presetName);
    setActivePresetId(matchingPreset?.id);
  };

  const handleProfileSelect = (profile: WeightProfile) => {
    setWeights(profile.weights);
    setConstraints(profile.constraints);
    setActivePresetId(profile.id);
    setHasUnsavedChanges(true);
  };

  const weightPercentages = calculateWeightPercentages(weights);
  const totalWeights = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const canApply = totalWeights > 0 && !applyWeightsMutation.isPending;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weights & Constraints</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Weights & Constraints
            {hasUnsavedChanges && (
              <Badge variant="secondary" className="text-xs">
                Unsaved changes
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              onClick={() => applyWeightsMutation.mutate()}
              disabled={!canApply}
              size="sm"
              data-testid="button-apply-weights"
            >
              {applyWeightsMutation.isPending ? (
                "Applying..."
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Apply
                </>
              )}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resetMutation.isPending}
                  data-testid="button-reset-defaults"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset to Shop Defaults
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset to Shop Defaults</AlertDialogTitle>
                  <AlertDialogDescription>
                    Reset weights for this order to the shop defaults? This will overwrite unsaved changes.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => resetMutation.mutate()}
                    data-testid="button-confirm-reset"
                  >
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Quick Presets */}
        <WeightPresetChips
          onPresetSelect={handlePresetSelect}
          activePresetId={activePresetId}
          disabled={applyWeightsMutation.isPending}
        />

        <Separator />

        {/* Profile Management */}
        <WeightProfileSelector
          profiles={allProfiles}
          selectedProfileId={activePresetId}
          currentWeights={weights}
          currentConstraints={constraints}
          onProfileSelect={handleProfileSelect}
          onProfileSave={async (name, description) => {
            await saveProfileMutation.mutateAsync({ name, description });
          }}
          onProfileUpdate={async (profileId, name, description) => {
            await updateProfileMutation.mutateAsync({ profileId, name, description });
          }}
          onProfileDelete={async (profileId) => {
            await deleteProfileMutation.mutateAsync(profileId);
          }}
          disabled={applyWeightsMutation.isPending}
        />

        <Separator />

        {/* Weight Sliders */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-foreground">Factor Weights</h4>
            <div className="text-xs text-muted-foreground">
              Total: {totalWeights} • Normalized percentages →
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <WeightSlider
              label="Distance"
              value={weights.distance}
              onChange={(value) => handleWeightChange('distance', value)}
              weightKey="distance"
              tooltip={`${weightPercentages.distance}% of total weight`}
              disabled={applyWeightsMutation.isPending}
            />
            <WeightSlider
              label="Recency"
              value={weights.recency}
              onChange={(value) => handleWeightChange('recency', value)}
              weightKey="recency"
              tooltip={`${weightPercentages.recency}% of total weight`}
              disabled={applyWeightsMutation.isPending}
            />
            <WeightSlider
              label="GLA Similarity"
              value={weights.gla}
              onChange={(value) => handleWeightChange('gla', value)}
              weightKey="gla"
              tooltip={`${weightPercentages.gla}% of total weight`}
              disabled={applyWeightsMutation.isPending}
            />
            <WeightSlider
              label="Quality"
              value={weights.quality}
              onChange={(value) => handleWeightChange('quality', value)}
              weightKey="quality"
              tooltip={`${weightPercentages.quality}% of total weight`}
              disabled={applyWeightsMutation.isPending}
            />
            <WeightSlider
              label="Condition"
              value={weights.condition}
              onChange={(value) => handleWeightChange('condition', value)}
              weightKey="condition"
              tooltip={`${weightPercentages.condition}% of total weight`}
              disabled={applyWeightsMutation.isPending}
            />
          </div>

          {/* Weight percentage summary */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Normalized weights:</span>
              <div className="flex gap-3 text-xs">
                <span>Distance: {weightPercentages.distance}%</span>
                <span>Recency: {weightPercentages.recency}%</span>
                <span>GLA: {weightPercentages.gla}%</span>
                <span>Quality: {weightPercentages.quality}%</span>
                <span>Condition: {weightPercentages.condition}%</span>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Constraint Sliders */}
        <div>
          <h4 className="text-sm font-medium text-foreground mb-4">Constraints</h4>
          <div className="grid gap-6 md:grid-cols-2">
            <ConstraintSlider
              label="GLA Tolerance"
              value={constraints.glaTolerancePct}
              onChange={(value) => handleConstraintChange('glaTolerancePct', value)}
              min={5}
              max={20}
              step={1}
              suffix="%"
              tooltip="Allowed variance in gross living area for similarity scoring"
              disabled={applyWeightsMutation.isPending}
              testId="gla-tolerance"
            />
            <ConstraintSlider
              label="Distance Cap"
              value={constraints.distanceCapMiles}
              onChange={(value) => handleConstraintChange('distanceCapMiles', value)}
              min={0.25}
              max={5.0}
              step={0.25}
              suffix=" mi"
              tooltip="Maximum distance for proximity scoring (soft cap)"
              disabled={applyWeightsMutation.isPending}
              testId="distance-cap"
            />
          </div>
        </div>

        {/* Apply/Reset Warning */}
        {totalWeights === 0 && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">
              Increase at least one weight to enable scoring.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}