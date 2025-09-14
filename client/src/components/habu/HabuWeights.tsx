import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RotateCcw, Calculator } from 'lucide-react';

interface HabuWeightsProps {
  weights: { physical: number; legal: number; financial: number; productive: number };
  onWeightsChange: (weights: { physical: number; legal: number; financial: number; productive: number }) => void;
}

const WEIGHT_DESCRIPTIONS = {
  physical: 'Site characteristics, utilities, and development constraints',
  legal: 'Zoning compliance, density limits, and regulatory requirements',
  financial: 'Market conditions, cost feasibility, and economic viability',
  productive: 'Competitive ranking and highest value generation potential'
};

const DEFAULT_WEIGHTS = {
  physical: 0.25,
  legal: 0.35,
  financial: 0.30,
  productive: 0.10
};

export function HabuWeights({ weights, onWeightsChange }: HabuWeightsProps) {
  const [localWeights, setLocalWeights] = useState(weights);

  const handleWeightChange = (type: keyof typeof weights, value: number[]) => {
    const newWeight = value[0] / 100;
    const updatedWeights = { ...localWeights, [type]: newWeight };
    
    // Normalize weights to sum to 1
    const sum = Object.values(updatedWeights).reduce((a, b) => a + b, 0);
    if (sum > 0) {
      const normalizedWeights = {
        physical: updatedWeights.physical / sum,
        legal: updatedWeights.legal / sum,
        financial: updatedWeights.financial / sum,
        productive: updatedWeights.productive / sum
      };
      setLocalWeights(normalizedWeights);
    }
  };

  const handleReset = () => {
    setLocalWeights(DEFAULT_WEIGHTS);
  };

  const handleApply = () => {
    onWeightsChange(localWeights);
  };

  const totalWeight = Object.values(localWeights).reduce((a, b) => a + b, 0);
  const isNormalized = Math.abs(totalWeight - 1) < 0.01;

  return (
    <div className="space-y-6" data-testid="habu-weights">
      {/* Weight Sliders */}
      <div className="space-y-6">
        {Object.entries(localWeights).map(([type, value]) => (
          <div key={type} className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium capitalize">
                  {type} ({(value * 100).toFixed(0)}%)
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {WEIGHT_DESCRIPTIONS[type as keyof typeof WEIGHT_DESCRIPTIONS]}
                </p>
              </div>
              <Badge variant="outline" className="ml-2">
                {(value * 100).toFixed(0)}%
              </Badge>
            </div>
            <Slider
              value={[value * 100]}
              onValueChange={(newValue) => handleWeightChange(type as keyof typeof weights, newValue)}
              min={0}
              max={100}
              step={1}
              className="w-full"
              data-testid={`slider-${type}`}
            />
          </div>
        ))}
      </div>

      <Separator />

      {/* Weight Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weight Distribution</CardTitle>
          <CardDescription>
            Visual representation of test importance in the analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Weight Bars */}
            <div className="space-y-2">
              {Object.entries(localWeights).map(([type, value]) => (
                <div key={type} className="flex items-center gap-3">
                  <div className="w-20 text-sm font-medium capitalize">
                    {type}
                  </div>
                  <div className="flex-1 bg-muted rounded-full h-4 relative overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${(value / Math.max(totalWeight, 1)) * 100}%` }}
                    />
                  </div>
                  <div className="w-12 text-sm text-right">
                    {(value * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>

            {/* Total Weight Indicator */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Weight:</span>
              <span className={`font-medium ${isNormalized ? 'text-green-600' : 'text-orange-600'}`}>
                {(totalWeight * 100).toFixed(1)}%
              </span>
            </div>

            {!isNormalized && (
              <div className="text-sm text-orange-600 bg-orange-50 dark:bg-orange-950/20 p-2 rounded">
                Weights will be automatically normalized to sum to 100% when applied.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preset Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weight Presets</CardTitle>
          <CardDescription>
            Common weight configurations for different analysis types
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-auto p-3 text-left"
              onClick={() => setLocalWeights({ physical: 0.25, legal: 0.35, financial: 0.30, productive: 0.10 })}
              data-testid="preset-balanced"
            >
              <div>
                <div className="font-medium">Balanced Analysis</div>
                <div className="text-xs text-muted-foreground">Legal 35%, Financial 30%, Physical 25%, Productive 10%</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto p-3 text-left"
              onClick={() => setLocalWeights({ physical: 0.20, legal: 0.40, financial: 0.25, productive: 0.15 })}
              data-testid="preset-zoning-focused"
            >
              <div>
                <div className="font-medium">Zoning Focused</div>
                <div className="text-xs text-muted-foreground">Legal 40%, Financial 25%, Physical 20%, Productive 15%</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto p-3 text-left"
              onClick={() => setLocalWeights({ physical: 0.20, legal: 0.25, financial: 0.40, productive: 0.15 })}
              data-testid="preset-market-focused"
            >
              <div>
                <div className="font-medium">Market Focused</div>
                <div className="text-xs text-muted-foreground">Financial 40%, Legal 25%, Physical 20%, Productive 15%</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto p-3 text-left"
              onClick={() => setLocalWeights({ physical: 0.35, legal: 0.30, financial: 0.20, productive: 0.15 })}
              data-testid="preset-site-focused"
            >
              <div>
                <div className="font-medium">Site Focused</div>
                <div className="text-xs text-muted-foreground">Physical 35%, Legal 30%, Financial 20%, Productive 15%</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={handleReset}
          className="flex items-center gap-2"
          data-testid="button-reset-weights"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Default
        </Button>
        <Button
          onClick={handleApply}
          className="flex-1 flex items-center gap-2"
          data-testid="button-apply-weights"
        >
          <Calculator className="w-4 h-4" />
          Apply Weights
        </Button>
      </div>

      {/* Weight Explanation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Understanding Test Weights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <span className="font-medium">Physical Test:</span> Evaluates site suitability, utility availability, 
            topography, and access constraints for each use type.
          </div>
          <div>
            <span className="font-medium">Legal Test:</span> Determines zoning compliance, density restrictions, 
            height limits, and regulatory permissibility.
          </div>
          <div>
            <span className="font-medium">Financial Test:</span> Analyzes market conditions, cost feasibility, 
            demand factors, and economic viability.
          </div>
          <div>
            <span className="font-medium">Maximally Productive Test:</span> Ranks uses by their composite scores 
            to identify the highest value-generating option.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}