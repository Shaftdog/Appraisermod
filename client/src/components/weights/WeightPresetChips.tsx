import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { WeightSet, ConstraintSet } from "@shared/schema";

interface WeightPreset {
  id: string;
  name: string;
  description: string;
  weights: WeightSet;
  constraints: ConstraintSet;
}

const PRESETS: WeightPreset[] = [
  {
    id: "shop-default",
    name: "Shop Default",
    description: "Hi-Low Standard methodology",
    weights: { distance: 8, recency: 8, gla: 7, quality: 6, condition: 6 },
    constraints: { glaTolerancePct: 10, distanceCapMiles: 0.5 }
  },
  {
    id: "recency-first", 
    name: "Recency First",
    description: "Declining Market focus",
    weights: { distance: 6, recency: 10, gla: 7, quality: 5, condition: 5 },
    constraints: { glaTolerancePct: 12, distanceCapMiles: 1.0 }
  },
  {
    id: "proximity-first",
    name: "Proximity First", 
    description: "Micro-Market focus",
    weights: { distance: 10, recency: 7, gla: 7, quality: 5, condition: 5 },
    constraints: { glaTolerancePct: 10, distanceCapMiles: 0.3 }
  },
  {
    id: "gla-strict",
    name: "GLA Strict",
    description: "Tight Bracketing approach",
    weights: { distance: 7, recency: 7, gla: 9, quality: 6, condition: 5 },
    constraints: { glaTolerancePct: 6, distanceCapMiles: 0.5 }
  },
  {
    id: "quality-condition",
    name: "Quality/Condition",
    description: "Renovation Heavy focus", 
    weights: { distance: 6, recency: 7, gla: 7, quality: 9, condition: 8 },
    constraints: { glaTolerancePct: 10, distanceCapMiles: 0.8 }
  },
  {
    id: "complex-out-of-area",
    name: "Complex/Out-of-Area",
    description: "Broader search parameters",
    weights: { distance: 5, recency: 8, gla: 7, quality: 7, condition: 7 },
    constraints: { glaTolerancePct: 15, distanceCapMiles: 2.0 }
  }
];

interface WeightPresetChipsProps {
  onPresetSelect: (weights: WeightSet, constraints: ConstraintSet, presetName: string) => void;
  activePresetId?: string;
  disabled?: boolean;
}

export function WeightPresetChips({ 
  onPresetSelect, 
  activePresetId,
  disabled = false 
}: WeightPresetChipsProps) {
  const handlePresetClick = (preset: WeightPreset) => {
    if (disabled) return;
    onPresetSelect(preset.weights, preset.constraints, preset.name);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Quick Presets</h4>
        <Badge variant="outline" className="text-xs">
          Click to apply
        </Badge>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset.id}
            variant={activePresetId === preset.id ? "default" : "outline"}
            size="sm"
            onClick={() => handlePresetClick(preset)}
            disabled={disabled}
            className="h-auto p-3 flex flex-col items-start text-left gap-1 hover:bg-accent"
            data-testid={`preset-${preset.id}`}
          >
            <div className="font-medium text-sm leading-tight">
              {preset.name}
            </div>
            <div className="text-xs text-muted-foreground leading-tight">
              {preset.description}
            </div>
          </Button>
        ))}
      </div>
      
      <div className="text-xs text-muted-foreground">
        Selecting a preset will update all sliders. Click "Apply" to save changes.
      </div>
    </div>
  );
}

export { PRESETS };