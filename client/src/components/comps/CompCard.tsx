import { useState } from "react";
import { format } from "date-fns";
import { Lock, LockOpen, MapPin, ArrowUp, ArrowUpDown, Zap, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScoreBar } from "./ScoreBar";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { CompProperty, ScoreBand } from "@shared/schema";
import { cn } from "@/lib/utils";

interface CompCardProps {
  comp: CompProperty;
  isPrimary?: boolean;
  primaryIndex?: 0 | 1 | 2;
  showPromote?: boolean;
  showSwap?: boolean;
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
            </div>
            
            <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 truncate">
              {comp.address}
            </h3>
            
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
              <span className="font-semibold text-green-600 dark:text-green-400">
                {formattedPrice}
              </span>
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