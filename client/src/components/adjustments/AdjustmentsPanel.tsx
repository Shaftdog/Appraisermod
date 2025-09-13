import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  ChevronDown, 
  ChevronUp, 
  Settings, 
  Calculator, 
  TrendingUp,
  GitCompare,
  BarChart3,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EngineWeights } from "./EngineWeights";
import { AttrTable } from "./AttrTable";
import { ApplyBar } from "./ApplyBar";
import { ProvenanceModal } from "./ProvenanceModal";
import { 
  type AdjustmentRunResult, 
  type AdjustmentsBundle, 
  type AttrAdjustment,
  type EngineSettings,
  type EngineWeight
} from "@shared/adjustments";

interface AdjustmentsPanelProps {
  orderId: string;
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

export function AdjustmentsPanel({ 
  orderId, 
  isOpen, 
  onToggle, 
  className 
}: AdjustmentsPanelProps) {
  const [selectedAttr, setSelectedAttr] = useState<AttrAdjustment | null>(null);
  const [lastRun, setLastRun] = useState<AdjustmentRunResult | null>(null);
  const [bundle, setBundle] = useState<AdjustmentsBundle | null>(null);
  const [engineSettings, setEngineSettings] = useState<EngineSettings>({
    weights: [
      { engine: 'regression', weight: 0.5 },
      { engine: 'cost', weight: 0.25 },
      { engine: 'paired', weight: 0.25 }
    ],
    decimalPlaces: 0,
    capPctPerAttr: 0.25
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Mutation for attribute overrides
  const overrideMutation = useMutation({
    mutationFn: async ({ attrKey, value, source, note }: { attrKey: string; value: number; source?: 'blend' | 'manual'; note?: string }): Promise<AttrAdjustment> => {
      const response = await apiRequest('PATCH', `/api/orders/${orderId}/adjustments/overrides`, { attrKey, value, source, note });
      return response.json();
    },
    onSuccess: (updatedAttr) => {
      toast({
        title: "Override Saved",
        description: `Updated ${updatedAttr.key} adjustment to ${updatedAttr.chosen.value}.`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'adjustments'] });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save attribute override.",
        variant: "destructive"
      });
    }
  });

  // Query current adjustments status
  const { data: adjustmentsStatus, isLoading } = useQuery({
    queryKey: ['/api/orders', orderId, 'adjustments', 'status'],
    enabled: isOpen
  });

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    if (!lastRun) return null;
    
    const totalAttrs = lastRun.attrs.length;
    const attrsWithValues = lastRun.attrs.filter(attr => attr.chosen.value !== 0).length;
    const enginesUsed = new Set(lastRun.attrs.flatMap(attr => attr.provenance?.map(p => p.engine) || []));
    
    return {
      totalAttrs,
      attrsWithValues,
      enginesUsed: Array.from(enginesUsed),
      computedAt: lastRun.computedAt,
      isApplied: !!bundle
    };
  }, [lastRun, bundle]);

  const handleRunComplete = (run: AdjustmentRunResult) => {
    setLastRun(run);
    queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'adjustments'] });
  };

  const handleApplyComplete = (newBundle: AdjustmentsBundle) => {
    setBundle(newBundle);
    queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'comps'] });
  };

  const handleEngineWeightsChange = (weights: EngineWeight[]) => {
    setEngineSettings({ ...engineSettings, weights });
  };

  const handleAttrEdit = (attrKey: string, newValue: number, source: 'blend' | 'manual', note?: string) => {
    if (!lastRun) return;
    
    // Optimistic update
    const updatedAttrs = lastRun.attrs.map(attr => 
      attr.key === attrKey 
        ? { ...attr, chosen: { value: newValue, source, note } }
        : attr
    );
    setLastRun({ ...lastRun, attrs: updatedAttrs });
    
    // Persist to server
    overrideMutation.mutate({ attrKey, value: newValue, source, note });
  };

  const handleProvenanceView = (attr: AttrAdjustment) => {
    setSelectedAttr(attr);
  };

  const getStatusIcon = () => {
    if (bundle) return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />;
    if (lastRun) return <Calculator className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
    return <AlertCircle className="h-5 w-5 text-gray-400" />;
  };

  const getStatusText = () => {
    if (bundle) return "Applied to Comparables";
    if (lastRun) return "Ready to Apply";
    return "Ready to Compute";
  };

  return (
    <>
      <Card className={cn("w-full", className)} data-testid="card-adjustments-panel">
        <Collapsible open={isOpen} onOpenChange={onToggle}>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors" data-testid="header-adjustments-trigger">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getStatusIcon()}
                  <div>
                    <CardTitle className="text-lg">3-Engine Adjustments</CardTitle>
                    <div className="text-sm text-muted-foreground mt-1">
                      {getStatusText()}
                      {summaryStats && (
                        <span className="ml-2">
                          • {summaryStats.attrsWithValues}/{summaryStats.totalAttrs} attributes
                          {summaryStats.isApplied && " • Applied"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {summaryStats && (
                    <div className="flex items-center space-x-1">
                      {summaryStats.enginesUsed.includes('regression') && (
                        <Badge variant="outline" className="text-xs">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Regression
                        </Badge>
                      )}
                      {summaryStats.enginesUsed.includes('cost') && (
                        <Badge variant="outline" className="text-xs">
                          <Calculator className="h-3 w-3 mr-1" />
                          Cost
                        </Badge>
                      )}
                      {summaryStats.enginesUsed.includes('paired') && (
                        <Badge variant="outline" className="text-xs">
                          <GitCompare className="h-3 w-3 mr-1" />
                          Paired
                        </Badge>
                      )}
                    </div>
                  )}
                  {isOpen ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="space-y-6 pt-0">
              {/* Control Bar */}
              <ApplyBar
                orderId={orderId}
                lastRun={lastRun}
                bundle={bundle}
                engineSettings={engineSettings}
                onRunComplete={handleRunComplete}
                onApplyComplete={handleApplyComplete}
                data-testid="apply-bar"
              />

              <Separator />

              {/* Engine Settings */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Settings className="h-5 w-5" />
                    <h3 className="font-semibold">Engine Weights</h3>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    Total: {engineSettings.weights.reduce((sum, w) => sum + w.weight, 0).toFixed(2)}
                  </Badge>
                </div>
                
                <EngineWeights
                  weights={engineSettings.weights}
                  onChange={handleEngineWeightsChange}
                  data-testid="engine-weights"
                />
              </div>

              {/* Adjustments Table */}
              {lastRun && lastRun.attrs.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <BarChart3 className="h-5 w-5" />
                        <h3 className="font-semibold">Attribute Adjustments</h3>
                      </div>
                      <Badge variant="outline" className="text-xs" data-testid="attr-count">
                        {lastRun.attrs.length} Attributes
                      </Badge>
                    </div>

                    <AttrTable
                      attrs={lastRun.attrs}
                      onOverride={(attrKey: string, value: number) => handleAttrEdit(attrKey, value, 'manual')}
                      onShowProvenance={(attrKey: string) => {
                        const attr = lastRun.attrs.find(a => a.key === attrKey);
                        if (attr) handleProvenanceView(attr);
                      }}
                      data-testid="attr-table"
                    />
                  </div>
                </>
              )}

              {/* Summary Section */}
              {summaryStats && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="stat-total-attrs">
                        {summaryStats.totalAttrs}
                      </div>
                      <div className="text-muted-foreground">Total Attributes</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="stat-active-attrs">
                        {summaryStats.attrsWithValues}
                      </div>
                      <div className="text-muted-foreground">With Adjustments</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400" data-testid="stat-engines">
                        {summaryStats.enginesUsed.length}
                      </div>
                      <div className="text-muted-foreground">Engines Used</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="stat-status">
                        {summaryStats.isApplied ? '✓' : '○'}
                      </div>
                      <div className="text-muted-foreground">Status</div>
                    </div>
                  </div>
                </>
              )}

              {/* Help Text */}
              {!lastRun && (
                <div className="text-center py-8 text-muted-foreground">
                  <Calculator className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <h4 className="font-medium mb-2">Ready to Compute Adjustments</h4>
                  <p className="text-sm max-w-md mx-auto">
                    Configure your engine weights above, then click "Compute Adjustments" 
                    to analyze your comparables using regression, cost, and paired sales methods.
                  </p>
                </div>
              )}

              {lastRun && !bundle && (
                <div className="text-center py-4 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-blue-600 dark:text-blue-400" />
                  <p className="text-sm">
                    Adjustments computed successfully. Review the details above and click 
                    "Apply to Comps" when ready to update your comparable sales.
                  </p>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Provenance Modal */}
      <ProvenanceModal
        isOpen={!!selectedAttr}
        onClose={() => setSelectedAttr(null)}
        attr={selectedAttr}
      />
    </>
  );
}