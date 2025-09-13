import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Calculator, 
  CheckCircle, 
  Clock, 
  PlayCircle, 
  AlertTriangle,
  RefreshCw,
  Settings,
  Download
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type AdjustmentRunInput, type AdjustmentRunResult, type AdjustmentsBundle } from "@shared/adjustments";

interface ApplyBarProps {
  orderId: string;
  lastRun?: AdjustmentRunResult | null;
  bundle?: AdjustmentsBundle | null;
  onRunComplete: (run: AdjustmentRunResult) => void;
  onApplyComplete: (bundle: AdjustmentsBundle) => void;
  className?: string;
}

type ComputeStatus = 'idle' | 'computing' | 'computed' | 'applied' | 'error';

export function ApplyBar({ 
  orderId, 
  lastRun, 
  bundle, 
  onRunComplete, 
  onApplyComplete, 
  className 
}: ApplyBarProps) {
  const [marketBasis, setMarketBasis] = useState<'salePrice' | 'ppsf'>('salePrice');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Determine current status
  const getStatus = (): ComputeStatus => {
    if (bundle) return 'applied';
    if (lastRun) return 'computed';
    return 'idle';
  };

  const status = getStatus();

  // Compute adjustments mutation
  const computeMutation = useMutation({
    mutationFn: async (input: AdjustmentRunInput): Promise<AdjustmentRunResult> => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/adjustments/compute`, input);
      return response.json();
    },
    onSuccess: (run: AdjustmentRunResult) => {
      toast({
        title: "Adjustments Computed",
        description: `Successfully computed ${run.attrs.length} attribute adjustments.`
      });
      onRunComplete(run);
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'adjustments'] });
    },
    onError: (error: any) => {
      toast({
        title: "Computation Failed",
        description: error.message || "Failed to compute adjustments. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Apply adjustments mutation
  const applyMutation = useMutation({
    mutationFn: async (): Promise<AdjustmentsBundle> => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/adjustments/apply`);
      return response.json();
    },
    onSuccess: (bundle: AdjustmentsBundle) => {
      toast({
        title: "Adjustments Applied",
        description: `Applied adjustments to ${bundle.compLines.length} comparables.`
      });
      onApplyComplete(bundle);
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'comps'] });
    },
    onError: (error: any) => {
      toast({
        title: "Application Failed",
        description: error.message || "Failed to apply adjustments. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleCompute = () => {
    // Mock comp IDs - in real implementation, would get from comp selection
    const compIds = ['comp-1', 'comp-2', 'comp-3']; // TODO: Get from actual comp selection
    
    const input: AdjustmentRunInput = {
      orderId,
      compIds,
      subject: {
        gla: 2000,
        bed: 3,
        bath: 2,
        garage: 2,
        lotSize: 7500,
        age: 10,
        quality: 3,
        condition: 3,
        pool: false,
        view: 2
      }, // TODO: Get from actual subject
      marketBasis
    };

    computeMutation.mutate(input);
  };

  const handleApply = () => {
    if (!lastRun) {
      toast({
        title: "No Computation Found",
        description: "Please compute adjustments first before applying.",
        variant: "destructive"
      });
      return;
    }
    applyMutation.mutate();
  };

  const handleRecompute = () => {
    handleCompute();
  };

  const getStatusConfig = (status: ComputeStatus) => {
    switch (status) {
      case 'idle':
        return {
          icon: Calculator,
          label: "Ready to Compute",
          color: "text-muted-foreground",
          bgColor: "bg-muted/50"
        };
      case 'computing':
        return {
          icon: RefreshCw,
          label: "Computing...",
          color: "text-blue-600 dark:text-blue-400",
          bgColor: "bg-blue-50 dark:bg-blue-950"
        };
      case 'computed':
        return {
          icon: CheckCircle,
          label: "Computed",
          color: "text-green-600 dark:text-green-400",
          bgColor: "bg-green-50 dark:bg-green-950"
        };
      case 'applied':
        return {
          icon: PlayCircle,
          label: "Applied",
          color: "text-purple-600 dark:text-purple-400",
          bgColor: "bg-purple-50 dark:bg-purple-950"
        };
      case 'error':
        return {
          icon: AlertTriangle,
          label: "Error",
          color: "text-red-600 dark:text-red-400",
          bgColor: "bg-red-50 dark:bg-red-950"
        };
      default:
        return {
          icon: Calculator,
          label: "Ready",
          color: "text-muted-foreground",
          bgColor: "bg-muted/50"
        };
    }
  };

  const statusConfig = getStatusConfig(status);
  const StatusIcon = statusConfig.icon;
  const isComputing = computeMutation.isPending;
  const isApplying = applyMutation.isPending;

  return (
    <Card className={cn("w-full", className)} data-testid="card-apply-bar">
      <CardContent className="p-4">
        <div className="flex items-center justify-between space-x-4">
          {/* Status Indicator */}
          <div className="flex items-center space-x-3">
            <div className={cn("p-2 rounded-lg", statusConfig.bgColor)}>
              <StatusIcon className={cn("h-5 w-5", statusConfig.color, isComputing && "animate-spin")} />
            </div>
            <div>
              <div className="font-medium" data-testid="text-status">
                {statusConfig.label}
              </div>
              {lastRun && (
                <div className="text-xs text-muted-foreground" data-testid="text-last-run">
                  {new Date(lastRun.computedAt).toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-3">
            {/* Market Basis Selector */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">Basis:</span>
              <Select value={marketBasis} onValueChange={(value: 'salePrice' | 'ppsf') => setMarketBasis(value)}>
                <SelectTrigger className="w-32" data-testid="select-market-basis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="salePrice">Sale Price</SelectItem>
                  <SelectItem value="ppsf">Price/SF</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator orientation="vertical" className="h-8" />

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              {status === 'idle' && (
                <Button 
                  onClick={handleCompute}
                  disabled={isComputing}
                  data-testid="button-compute"
                >
                  {isComputing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Computing...
                    </>
                  ) : (
                    <>
                      <Calculator className="h-4 w-4 mr-2" />
                      Compute Adjustments
                    </>
                  )}
                </Button>
              )}

              {status === 'computed' && (
                <>
                  <Button 
                    variant="outline"
                    onClick={handleRecompute}
                    disabled={isComputing}
                    data-testid="button-recompute"
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-2", isComputing && "animate-spin")} />
                    Recompute
                  </Button>
                  <Button 
                    onClick={handleApply}
                    disabled={isApplying}
                    data-testid="button-apply"
                  >
                    {isApplying ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Applying...
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Apply to Comps
                      </>
                    )}
                  </Button>
                </>
              )}

              {status === 'applied' && (
                <>
                  <Button 
                    variant="outline"
                    onClick={handleRecompute}
                    disabled={isComputing}
                    data-testid="button-recompute-applied"
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-2", isComputing && "animate-spin")} />
                    Recompute
                  </Button>
                  <Button 
                    onClick={handleApply}
                    disabled={isApplying}
                    data-testid="button-reapply"
                  >
                    {isApplying ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Reapplying...
                      </>
                    ) : (
                      <>
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Reapply
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Summary Stats */}
          {(lastRun || bundle) && (
            <div className="flex items-center space-x-4">
              <Separator orientation="vertical" className="h-8" />
              <div className="flex items-center space-x-3">
                {lastRun && (
                  <div className="text-center">
                    <div className="text-lg font-bold" data-testid="text-attr-count">
                      {lastRun.attrs.length}
                    </div>
                    <div className="text-xs text-muted-foreground">Attributes</div>
                  </div>
                )}
                {bundle && (
                  <div className="text-center">
                    <div className="text-lg font-bold" data-testid="text-comp-count">
                      {bundle.compLines.length}
                    </div>
                    <div className="text-xs text-muted-foreground">Comps</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Progress/Status Messages */}
        {(isComputing || isApplying) && (
          <div className="mt-4 p-3 rounded-lg bg-muted/50">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">
                {isComputing && "Analyzing comparables and computing adjustments..."}
                {isApplying && "Applying adjustments to comparable sales..."}
              </span>
            </div>
          </div>
        )}

        {/* Error States */}
        {(computeMutation.isError || applyMutation.isError) && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-sm text-red-600 dark:text-red-400">
                {computeMutation.error?.message || applyMutation.error?.message || "An error occurred"}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}