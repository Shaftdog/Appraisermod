import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, MapPin, Calendar, Home, Star, Wrench } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import type { CompProperty } from "@shared/schema";

interface CompListProps {
  orderId: string;
  refreshTrigger?: number; // Optional prop to force refresh
}

interface CompsResponse {
  comps: CompProperty[];
  weights: any; // OrderWeights type if needed
}

export function CompList({ orderId, refreshTrigger }: CompListProps) {
  const { data, isLoading, error } = useQuery<CompsResponse>({
    queryKey: ["/api/orders", orderId, "comps", refreshTrigger],
    refetchOnWindowFocus: false
  });

  const comps: CompProperty[] = data?.comps || [];
  const weights = data?.weights;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comparable Properties</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comparable Properties</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Failed to load comparable properties
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatGLA = (gla: number) => {
    return new Intl.NumberFormat('en-US').format(gla);
  };

  const getQualityLabel = (quality: number) => {
    const labels = { 1: "Poor", 2: "Fair", 3: "Average", 4: "Good", 5: "Excellent" };
    return labels[quality as keyof typeof labels] || "Unknown";
  };

  const getConditionLabel = (condition: number) => {
    const labels = { 1: "Poor", 2: "Fair", 3: "Average", 4: "Good", 5: "Excellent" };
    return labels[condition as keyof typeof labels] || "Unknown";
  };

  const ScoreBreakdown = ({ comp }: { comp: CompProperty }) => {
    if (!comp.scoreBreakdown) return null;

    const breakdown = comp.scoreBreakdown;
    const totalScore = comp.score || 0;

    return (
      <div className="space-y-3 min-w-[280px]">
        <div className="text-sm font-medium">Score Breakdown</div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Distance
            </span>
            <span className="text-xs font-mono">
              {(breakdown.distance * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Recency
            </span>
            <span className="text-xs font-mono">
              {(breakdown.recency * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs flex items-center gap-1">
              <Home className="h-3 w-3" />
              GLA
            </span>
            <span className="text-xs font-mono">
              {(breakdown.gla * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs flex items-center gap-1">
              <Star className="h-3 w-3" />
              Quality
            </span>
            <span className="text-xs font-mono">
              {(breakdown.quality * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs flex items-center gap-1">
              <Wrench className="h-3 w-3" />
              Condition
            </span>
            <span className="text-xs font-mono">
              {(breakdown.condition * 100).toFixed(0)}%
            </span>
          </div>
          <div className="border-t pt-2 mt-2">
            <div className="flex justify-between items-center font-medium">
              <span className="text-sm">Total Score</span>
              <span className="text-sm font-mono">
                {(totalScore * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Comparable Properties</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {comps.length} properties
            </Badge>
            {weights && (
              <Badge variant="secondary" className="text-xs">
                Ranked by current weights
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {comps.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No comparable properties available
          </div>
        ) : (
          <div className="space-y-4">
            {comps.map((comp, index) => (
              <Card key={comp.id} className="border-l-4 border-l-primary/20" data-testid={`comp-${comp.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <Badge 
                          variant={index < 3 ? "default" : "secondary"}
                          className="text-xs font-mono"
                        >
                          #{index + 1}
                        </Badge>
                        <h4 className="font-medium text-foreground" data-testid={`comp-address-${comp.id}`}>
                          {comp.address}
                        </h4>
                        {comp.score && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge 
                                  variant="outline" 
                                  className="cursor-help"
                                  data-testid={`comp-score-${comp.id}`}
                                >
                                  <TrendingUp className="h-3 w-3 mr-1" />
                                  {(comp.score * 100).toFixed(0)}%
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                <ScoreBreakdown comp={comp} />
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground block">Sale Price</span>
                          <span className="font-medium" data-testid={`comp-price-${comp.id}`}>
                            {formatCurrency(comp.salePrice)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Sale Date</span>
                          <span className="font-medium">
                            {format(new Date(comp.saleDate), 'MMM d, yyyy')}
                          </span>
                          <span className="text-xs text-muted-foreground block">
                            {formatDistanceToNow(new Date(comp.saleDate), { addSuffix: true })}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Distance</span>
                          <span className="font-medium">
                            {comp.distanceMiles.toFixed(2)} mi
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">GLA</span>
                          <span className="font-medium">
                            {formatGLA(comp.gla)} sq ft
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground block">Quality</span>
                          <span className="font-medium">
                            {comp.quality}/5 - {getQualityLabel(comp.quality)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Condition</span>
                          <span className="font-medium">
                            {comp.condition}/5 - {getConditionLabel(comp.condition)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}