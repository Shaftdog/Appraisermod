import { useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CompProperty } from "@shared/schema";
import { cn } from "@/lib/utils";

interface ScoreBreakdownProps {
  comp: CompProperty;
  className?: string;
}

export function ScoreBreakdown({ comp, className }: ScoreBreakdownProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!comp.scoreBreakdown || !comp.score) {
    return null;
  }

  const factors = [
    { 
      key: 'distance', 
      label: 'Distance', 
      data: comp.scoreBreakdown.distance,
      tooltip: 'Proximity similarity to subject property'
    },
    { 
      key: 'recency', 
      label: 'Recency', 
      data: comp.scoreBreakdown.recency,
      tooltip: 'How recent the sale was compared to effective date'
    },
    { 
      key: 'gla', 
      label: 'GLA', 
      data: comp.scoreBreakdown.gla,
      tooltip: 'Gross Living Area similarity to subject'
    },
    { 
      key: 'quality', 
      label: 'Quality', 
      data: comp.scoreBreakdown.quality,
      tooltip: 'Construction quality rating similarity'
    },
    { 
      key: 'condition', 
      label: 'Condition', 
      data: comp.scoreBreakdown.condition,
      tooltip: 'Property condition rating similarity'
    }
  ];

  const totalWeightedScore = factors.reduce((sum, factor) => sum + factor.data.contribution, 0);

  return (
    <div className={cn("", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm p-2 h-auto"
        data-testid="toggle-score-breakdown"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Score Breakdown
      </Button>

      {isExpanded && (
        <Card className="mt-2" data-testid="score-breakdown-panel">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              Total Score: {Math.round(comp.score * 100)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {factors.map((factor) => (
                <div key={factor.key} className="grid grid-cols-4 gap-2 text-xs items-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{factor.label}</span>
                          <Info className="h-3 w-3 text-gray-400" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{factor.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <div className="text-right">
                    <span className="text-gray-600 dark:text-gray-400">
                      {Math.round(factor.data.weight * 100)}%
                    </span>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-gray-600 dark:text-gray-400">
                      {Math.round(factor.data.similarity * 100)}%
                    </span>
                  </div>
                  
                  <div className="text-right font-medium">
                    {Math.round(factor.data.contribution * 100)}
                  </div>
                </div>
              ))}
              
              <div className="border-t pt-2 mt-2">
                <div className="grid grid-cols-4 gap-2 text-xs font-semibold">
                  <div>Total</div>
                  <div></div>
                  <div></div>
                  <div className="text-right">
                    {Math.round(totalWeightedScore * 100)}
                  </div>
                </div>
              </div>
              
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                <div className="grid grid-cols-4 gap-2">
                  <div>Factor</div>
                  <div className="text-right">Weight</div>
                  <div className="text-right">Similarity</div>
                  <div className="text-right">Points</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}