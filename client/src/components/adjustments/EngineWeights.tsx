import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TrendingUp, Calculator, GitCompare, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { type EngineWeight } from "@shared/adjustments";

interface EngineWeightsProps {
  weights: EngineWeight[];
  onChange: (weights: EngineWeight[]) => void;
  onReset?: () => void;
  className?: string;
}

const engineConfig = {
  regression: {
    icon: TrendingUp,
    label: "Regression Analysis",
    description: "Market-derived coefficients from comp sales data",
    color: "text-blue-600 dark:text-blue-400"
  },
  cost: {
    icon: Calculator,
    label: "Depreciated Cost Method",
    description: "Construction cost baseline with depreciation curves",
    color: "text-green-600 dark:text-green-400"
  },
  paired: {
    icon: GitCompare,
    label: "Paired Sales Analysis",
    description: "Direct comparison of similar property pairs",
    color: "text-purple-600 dark:text-purple-400"
  }
};

export function EngineWeights({ weights, onChange, onReset, className }: EngineWeightsProps) {
  const [tempWeights, setTempWeights] = useState<EngineWeight[]>(weights);

  useEffect(() => {
    setTempWeights(weights);
  }, [weights]);

  const handleWeightChange = (engine: string, newWeight: number) => {
    const updatedWeights = tempWeights.map(w => 
      w.engine === engine ? { ...w, weight: newWeight / 100 } : w
    );
    
    // Normalize weights to sum to 1
    const totalWeight = updatedWeights.reduce((sum, w) => sum + w.weight, 0);
    if (totalWeight > 0) {
      const normalizedWeights = updatedWeights.map(w => ({
        ...w,
        weight: w.weight / totalWeight
      }));
      setTempWeights(normalizedWeights);
      onChange(normalizedWeights);
    }
  };

  const handleReset = () => {
    const defaultWeights: EngineWeight[] = [
      { engine: 'regression', weight: 0.5 },
      { engine: 'cost', weight: 0.3 },
      { engine: 'paired', weight: 0.2 }
    ];
    setTempWeights(defaultWeights);
    onChange(defaultWeights);
    onReset?.();
  };

  const totalPercent = tempWeights.reduce((sum, w) => sum + (w.weight * 100), 0);

  return (
    <Card className={cn("w-full", className)} data-testid="card-engine-weights">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-lg font-semibold" data-testid="text-engine-weights-title">
          Engine Weights
        </CardTitle>
        {onReset && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="h-8 px-3"
            data-testid="button-reset-weights"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {tempWeights.map((weight) => {
          const config = engineConfig[weight.engine as keyof typeof engineConfig];
          const Icon = config.icon;
          const percentage = Math.round(weight.weight * 100);
          
          return (
            <div key={weight.engine} className="space-y-3" data-testid={`engine-${weight.engine}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Icon className={cn("h-5 w-5", config.color)} />
                  <div>
                    <Label className="text-sm font-medium" data-testid={`label-${weight.engine}`}>
                      {config.label}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5" data-testid={`desc-${weight.engine}`}>
                      {config.description}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={cn("text-lg font-semibold", config.color)} data-testid={`pct-${weight.engine}`}>
                    {percentage}%
                  </span>
                </div>
              </div>
              <Slider
                value={[percentage]}
                onValueChange={([value]) => handleWeightChange(weight.engine, value)}
                max={100}
                min={0}
                step={1}
                className="w-full"
                data-testid={`slider-${weight.engine}`}
              />
            </div>
          );
        })}
        
        {/* Weight total indicator */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground" data-testid="text-total-label">
              Total Weight:
            </span>
            <span 
              className={cn(
                "font-medium",
                Math.abs(totalPercent - 100) < 0.1 
                  ? "text-green-600 dark:text-green-400" 
                  : "text-orange-600 dark:text-orange-400"
              )}
              data-testid="text-total-percent"
            >
              {totalPercent.toFixed(1)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}