import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
  TrendingUp, 
  TrendingDown,
  Calculator, 
  CheckCircle2,
  AlertCircle,
  Target,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import type { HiLoState, HiLoSettings, RankedCompScore } from "../../types/hilo";

interface HiLoPanelProps {
  orderId: string;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

export function HiLoPanel({ 
  orderId, 
  isOpen, 
  onToggle, 
  className 
}: HiLoPanelProps) {
  const [localSettings, setLocalSettings] = useState<HiLoSettings | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Query Hi-Lo state
  const { data: hiloState, isLoading } = useQuery<HiLoState>({
    queryKey: ['/api/orders', orderId, 'hilo'],
    enabled: isOpen
  });

  // Use local settings if available, otherwise use state settings
  const currentSettings = localSettings || hiloState?.settings;

  // Mutation to save settings
  const saveSettingsMutation = useMutation({
    mutationFn: async (settings: HiLoSettings): Promise<HiLoState> => {
      const response = await apiRequest('PUT', `/api/orders/${orderId}/hilo/settings`, settings);
      return response.json();
    },
    onSuccess: (updatedState) => {
      setLocalSettings(null); // Clear local state
      queryClient.setQueryData(['/api/orders', orderId, 'hilo'], updatedState);
      toast({
        title: "Settings Saved",
        description: "Hi-Lo settings have been updated successfully."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save Hi-Lo settings.",
        variant: "destructive"
      });
    }
  });

  // Mutation to compute Hi-Lo
  const computeMutation = useMutation({
    mutationFn: async (): Promise<HiLoState> => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/hilo/compute`, {});
      return response.json();
    },
    onSuccess: (updatedState) => {
      queryClient.setQueryData(['/api/orders', orderId, 'hilo'], updatedState);
      toast({
        title: "Hi-Lo Computed",
        description: "Hi-Lo analysis has been completed successfully."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Computation Failed",
        description: error.message || "Failed to compute Hi-Lo analysis.",
        variant: "destructive"
      });
    }
  });

  // Mutation to apply primaries
  const applyMutation = useMutation({
    mutationFn: async (params: { primaries: string[]; listingPrimaries: string[] }) => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/hilo/apply`, params);
      return response.json();
    },
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'comps'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'comps', 'selection'] });
      toast({
        title: "Primaries Applied",
        description: "Hi-Lo primaries have been applied to the comp selection."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Apply Failed",
        description: error.message || "Failed to apply Hi-Lo primaries.",
        variant: "destructive"
      });
    }
  });

  const handleSettingChange = <K extends keyof HiLoSettings>(
    key: K,
    value: HiLoSettings[K]
  ) => {
    if (!currentSettings) return;
    
    const newSettings = { ...currentSettings, [key]: value };
    setLocalSettings(newSettings);
  };

  const handleWeightChange = (weightKey: keyof HiLoSettings['weights'], value: number) => {
    if (!currentSettings) return;
    
    const newWeights = { ...currentSettings.weights, [weightKey]: value };
    handleSettingChange('weights', newWeights);
  };

  const handleFilterChange = <K extends keyof HiLoSettings['filters']>(
    key: K,
    value: HiLoSettings['filters'][K]
  ) => {
    if (!currentSettings) return;
    
    const newFilters = { ...currentSettings.filters, [key]: value };
    handleSettingChange('filters', newFilters);
  };

  const handleSaveSettings = () => {
    if (localSettings) {
      saveSettingsMutation.mutate(localSettings);
    }
  };

  const handleCompute = () => {
    computeMutation.mutate();
  };

  const handleApply = () => {
    if (!hiloState?.result) return;
    
    applyMutation.mutate({
      primaries: hiloState.result.primaries,
      listingPrimaries: hiloState.result.listingPrimaries
    });
  };

  const hasUnsavedChanges = localSettings !== null;
  const hasResult = hiloState?.result !== undefined;

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    if (!hiloState?.result) return null;
    
    const { ranked, selectedSales, selectedListings } = hiloState.result;
    const insideBoxCount = ranked.filter(r => r.insideBox).length;
    const totalCount = ranked.length;
    
    return {
      totalCandidates: totalCount,
      insideBox: insideBoxCount,
      outsideBox: totalCount - insideBoxCount,
      selectedSales: selectedSales.length,
      selectedListings: selectedListings.length
    };
  }, [hiloState?.result]);

  if (isLoading) {
    return (
      <Card className={cn("", className)}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Hi-Lo Analysis</span>
            <Button variant="ghost" size="sm" onClick={onToggle}>
              <ChevronUp className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading Hi-Lo analysis...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!currentSettings) {
    return null;
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            <span>Hi-Lo Analysis</span>
            {hasResult && (
              <Badge variant="secondary" className="ml-2">
                ✓ Computed
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onToggle}>
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardTitle>
      </CardHeader>

      {isOpen && (
        <CardContent className="space-y-6">
          {/* Range Display */}
          {hasResult && (
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Hi-Lo Range</h4>
                <Badge variant="outline">
                  {hiloState!.result!.range.basis === 'salePrice' ? 'Sale Price' : '$/SF'}
                </Badge>
              </div>
              
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-sm text-muted-foreground">Lo</div>
                  <div className="text-lg font-semibold text-red-600">
                    ${hiloState!.result!.range.lo.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Center</div>
                  <div className="text-lg font-semibold">
                    ${hiloState!.result!.range.center.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Hi</div>
                  <div className="text-lg font-semibold text-green-600">
                    ${hiloState!.result!.range.hi.toLocaleString()}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
                <span>±{currentSettings.boxPct}%</span>
                <span>•</span>
                <span>Effective: {new Date(hiloState!.result!.range.effectiveDateISO).toLocaleDateString()}</span>
              </div>
            </div>
          )}

          {/* Summary Stats */}
          {summaryStats && (
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{summaryStats.selectedSales}/{summaryStats.totalCandidates}</div>
                <div className="text-sm text-muted-foreground">Sales Inside Box</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{summaryStats.selectedListings}</div>
                <div className="text-sm text-muted-foreground">Listings Selected</div>
              </div>
            </div>
          )}

          <Separator />

          {/* Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Settings</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>

            {isExpanded && (
              <div className="space-y-4">
                {/* Box Percentage */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Box Percentage: {currentSettings.boxPct}%</Label>
                  <Slider
                    value={[currentSettings.boxPct]}
                    onValueChange={([value]) => handleSettingChange('boxPct', value)}
                    min={5}
                    max={20}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Max Counts */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Max Sales: {currentSettings.maxSales}</Label>
                    <Slider
                      value={[currentSettings.maxSales]}
                      onValueChange={([value]) => handleSettingChange('maxSales', value)}
                      min={10}
                      max={15}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Max Listings: {currentSettings.maxListings}</Label>
                    <Slider
                      value={[currentSettings.maxListings]}
                      onValueChange={([value]) => handleSettingChange('maxListings', value)}
                      min={5}
                      max={10}
                      step={1}
                    />
                  </div>
                </div>

                {/* Filters */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="inside-polygon-only"
                      checked={currentSettings.filters.insidePolygonOnly}
                      onCheckedChange={(checked) => handleFilterChange('insidePolygonOnly', checked)}
                    />
                    <Label htmlFor="inside-polygon-only">Inside Polygon Only</Label>
                  </div>
                </div>

                {/* Weights */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Scoring Weights</Label>
                  {Object.entries(currentSettings.weights).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="capitalize">{key === 'loc' ? 'Location' : key}</span>
                        <span>{(value * 100).toFixed(0)}%</span>
                      </div>
                      <Slider
                        value={[value]}
                        onValueChange={([newValue]) => handleWeightChange(key as keyof HiLoSettings['weights'], newValue)}
                        min={0}
                        max={1}
                        step={0.05}
                        className="w-full"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              {hasUnsavedChanges && (
                <Button
                  onClick={handleSaveSettings}
                  disabled={saveSettingsMutation.isPending}
                  variant="outline"
                  size="sm"
                >
                  Save Settings
                </Button>
              )}
              
              <Button
                onClick={handleCompute}
                disabled={computeMutation.isPending || hasUnsavedChanges}
                className="flex-1"
              >
                <Calculator className="h-4 w-4 mr-2" />
                {computeMutation.isPending ? 'Computing...' : 'Compute Hi-Lo'}
              </Button>
            </div>

            {hasResult && (
              <Button
                onClick={handleApply}
                disabled={applyMutation.isPending}
                variant="default"
                className="w-full"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {applyMutation.isPending ? 'Applying...' : 'Apply Primaries'}
              </Button>
            )}
          </div>

          {hasUnsavedChanges && (
            <div className="text-sm text-amber-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              You have unsaved changes. Save settings before computing.
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
