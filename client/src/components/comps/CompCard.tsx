import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Lock, LockOpen, MapPin, ArrowUp, ArrowUpDown, Zap, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScoreBar } from "./ScoreBar";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { CompProperty, ScoreBand, TimeAdjustments } from "@shared/schema";
import { calculateTimeAdjustment } from "@shared/timeAdjust";
import { type CompAdjustmentLine } from "@shared/adjustments";
import { cn } from "@/lib/utils";

interface CompCardProps {
  comp: CompProperty;
  isPrimary?: boolean;
  primaryIndex?: 0 | 1 | 2;
  showPromote?: boolean;
  showSwap?: boolean;
  timeAdjustments?: TimeAdjustments;
  attributeAdjustments?: CompAdjustmentLine;
  className?: string;
  onLock?: (compId: string, locked: boolean) => void;
  onPromote?: (compId: string) => void;
  onSwap?: (compId: string) => void;
  onViewOnMap?: (compId: string) => void;
}

export function CompCard({
  comp,
  isPrimary = false,
  primaryIndex,
  showPromote = false,
  showSwap = false,
  timeAdjustments,
  attributeAdjustments,
  className,
  onLock,
  onPromote,
  onSwap,
  onViewOnMap
}: CompCardProps) {
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(false);
  
  // Calculate display values
  const saleDate = new Date(comp.saleDate);
  const formattedDate = format(saleDate, "MMM d, yyyy");
  const formattedPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(comp.salePrice);

  // Calculate time adjustment using proper utilities and effective date
  const timeAdjustment = useMemo(() => {
    if (!timeAdjustments || !timeAdjustments.effectiveDateISO) return null;
    
    const result = calculateTimeAdjustment(
      comp.salePrice,
      comp.saleDate,
      comp.gla,
      timeAdjustments.effectiveDateISO,
      timeAdjustments.pctPerMonth,
      timeAdjustments.basis
    );

    // Always add formatting and effective date
    return {
      ...result,
      formattedAdjustedPrice: result.adjustedPrice ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(result.adjustedPrice) : null,
      effectiveDate: new Date(timeAdjustments.effectiveDateISO).toLocaleDateString()
    };
  }, [comp, timeAdjustments]);

  // Determine score band if not provided
  const scoreBand: ScoreBand = comp.band || 
    (comp.score && comp.score >= 0.75 ? 'high' : 
     comp.score && comp.score >= 0.5 ? 'medium' : 'low');

  const handleLockToggle = () => {
    if (onLock) {
      onLock(comp.id, !comp.locked);
    }
  };

  const handlePromote = () => {
    if (onPromote) {
      onPromote(comp.id);
    }
  };

  const handleSwap = () => {
    if (onSwap) {
      onSwap(comp.id);
    }
  };

  const handleViewOnMap = () => {
    if (onViewOnMap) {
      onViewOnMap(comp.id);
    }
  };

  return (
    <Card 
      className={cn(
        "transition-all duration-200 hover:shadow-md",
        isPrimary && "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950",
        comp.locked && "ring-2 ring-amber-400",
        className
      )}
      data-testid={`comp-card-${comp.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {isPrimary && typeof primaryIndex !== 'undefined' && (
                <Badge variant="default" className="bg-blue-600 hover:bg-blue-700">
                  #{primaryIndex + 1}
                </Badge>
              )}
              {comp.locked && (
                <Badge variant="outline" className="bg-amber-50 border-amber-300 text-amber-800">
                  <Lock className="h-3 w-3 mr-1" />
                  Locked
                </Badge>
              )}
              {comp.isInsidePolygon === false && (
                <Badge variant="destructive" className="text-xs">
                  Outside Polygon
                </Badge>
              )}
              {comp.isInsidePolygon === true && (
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  In Market
                </Badge>
              )}
              {comp.source === 'attom' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-900 dark:text-blue-200" data-testid={`badge-attom-${comp.id}`}>
                        ATTOM
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Public record closed sale</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            
            <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 truncate">
              {comp.address}
            </h3>
            
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
              <div className="flex flex-col">
                <span className="font-semibold text-green-600 dark:text-green-400">
                  {formattedPrice}
                </span>
                {timeAdjustment && (
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    {timeAdjustment.adjustedPrice ? (
                      <>
                        <span className="text-blue-600 dark:text-blue-400 font-medium">
                          {timeAdjustment.formattedAdjustedPrice}
                        </span>
                        <Badge variant="outline" className="text-xs px-1 py-0">
                          {timeAdjustment.adjustmentPercent > 0 ? '+' : ''}{timeAdjustment.adjustmentPercent.toFixed(1)}%
                        </Badge>
                        {timeAdjustment.basis === 'ppsf' && 'originalPpsf' in timeAdjustment && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="secondary" className="text-xs px-1 py-0">
                                  $/SF: ${timeAdjustment.originalPpsf.toFixed(0)} → ${timeAdjustment.adjustedPpsf?.toFixed(0)}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Adjusted on $/SF basis using {timeAdjustment.gla} SF</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <Badge variant="outline" className="text-xs px-1 py-0 text-gray-500">
                          Time: {timeAdjustment.effectiveDate}
                        </Badge>
                      </>
                    ) : timeAdjustment.error ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="text-xs px-1 py-0 text-orange-600">
                              $/SF: GLA req'd
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{timeAdjustment.error}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : null}
                  </div>
                )}
                {/* Attribute Adjustments Display */}
                {attributeAdjustments && attributeAdjustments.lines.length > 0 && (
                  <div className="flex items-center gap-2 text-xs flex-wrap mt-1">
                    <span className="text-purple-600 dark:text-purple-400 font-medium" data-testid={`header-indicated-${comp.id}`}>
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 0,
                      }).format(attributeAdjustments.indicatedValue)}
                    </span>
                    <Badge variant="outline" className="text-xs px-1 py-0" data-testid={`header-attr-subtotal-${comp.id}`}>
                      Attr: {attributeAdjustments.subtotal >= 0 ? '+' : ''}{attributeAdjustments.subtotal.toLocaleString()}
                    </Badge>
                    <Badge variant="secondary" className="text-xs px-1 py-0">
                      Final
                    </Badge>
                  </div>
                )}
              </div>
              <span>{formattedDate}</span>
              <span>{comp.distanceMiles.toFixed(1)} mi</span>
              <span>{comp.monthsSinceSale}mo ago</span>
            </div>
          </div>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleViewOnMap}
                  className="shrink-0"
                  data-testid={`view-map-${comp.id}`}
                >
                  <MapPin className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View on Map</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Property Details */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-500 dark:text-gray-400">GLA</div>
            <div className="font-medium">{comp.gla.toLocaleString()} sf</div>
          </div>
          <div>
            <div className="text-gray-500 dark:text-gray-400">Quality</div>
            <div className="font-medium">{comp.quality}/5</div>
          </div>
          <div>
            <div className="text-gray-500 dark:text-gray-400">Condition</div>
            <div className="font-medium">{comp.condition}/5</div>
          </div>
        </div>

        {/* Attribute Adjustments Detail */}
        {attributeAdjustments && attributeAdjustments.lines.length > 0 && (
          <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-purple-900 dark:text-purple-100">Attribute Adjustments</span>
              <Badge variant="outline" className="text-xs" data-testid={`total-adjustment-${comp.id}`}>
                {attributeAdjustments.subtotal >= 0 ? '+' : ''}{attributeAdjustments.subtotal.toLocaleString()}
              </Badge>
            </div>
            <div className="space-y-1">
              {attributeAdjustments.lines.map((line, index) => (
                <div key={`${line.key}-${index}`} className="flex items-center justify-between text-xs" data-testid={`adjustment-line-${comp.id}-${line.key}`}>
                  <span className="text-gray-600 dark:text-gray-400">
                    {line.rationale}
                  </span>
                  <span className={cn(
                    "font-medium",
                    line.delta >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  )}>
                    {line.delta >= 0 ? '+' : ''}{line.delta.toLocaleString()}{line.unit === '%' ? '%' : ''}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-purple-200 dark:border-purple-700">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-purple-900 dark:text-purple-100">Indicated Value:</span>
                <span className="font-bold text-purple-700 dark:text-purple-300" data-testid={`indicated-value-${comp.id}`}>
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(attributeAdjustments.indicatedValue)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Score Display */}
        {comp.score !== undefined && (
          <div className="space-y-2">
            <ScoreBar score={comp.score} band={scoreBand} />
            {comp.scoreBreakdown && (
              <ScoreBreakdown comp={comp} />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t">
          {/* Lock/Unlock */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLockToggle}
                  className="flex items-center gap-1"
                  data-testid={`lock-toggle-${comp.id}`}
                >
                  {comp.locked ? (
                    <LockOpen className="h-4 w-4" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  {comp.locked ? "Unlock" : "Lock"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{comp.locked ? "Unlock to allow replacement" : "Lock to prevent replacement"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Promote/Swap Actions */}
          {showPromote && !isPrimary && (
            <Button
              variant="default"
              size="sm"
              onClick={handlePromote}
              className="flex items-center gap-1"
              data-testid={`promote-${comp.id}`}
            >
              <ArrowUp className="h-4 w-4" />
              Promote
            </Button>
          )}

          {showSwap && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSwap}
              className="flex items-center gap-1"
              data-testid={`swap-${comp.id}`}
            >
              <ArrowUpDown className="h-4 w-4" />
              {isPrimary ? "Replace" : "Swap"}
            </Button>
          )}

          {/* High Score Indicator for top candidates */}
          {!isPrimary && comp.score && comp.score >= 0.8 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-medium ml-auto">
                    <Zap className="h-4 w-4" />
                    Top Match
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Excellent similarity score - consider promoting</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  );
}