import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import type { WeightKey } from "@shared/schema";

interface WeightSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  weightKey: WeightKey;
  tooltip: string;
  disabled?: boolean;
}

const WEIGHT_DESCRIPTIONS: Record<WeightKey, string> = {
  distance: "Controls how strongly proximity to the subject property influences ranking. Higher values prioritize nearby comparables.",
  recency: "Controls how strongly the sale date influences ranking. Higher values prioritize recent sales over older ones.",
  gla: "Controls how strongly gross living area similarity influences ranking. Higher values prioritize size-matched comparables.",
  quality: "Controls how strongly quality rating similarity influences ranking. Higher values prioritize quality-matched comparables.",
  condition: "Controls how strongly condition rating similarity influences ranking. Higher values prioritize condition-matched comparables."
};

export function WeightSlider({ 
  label, 
  value, 
  onChange, 
  weightKey, 
  tooltip, 
  disabled = false 
}: WeightSliderProps) {
  const handleValueChange = (values: number[]) => {
    onChange(values[0]);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    
    // Allow arrow keys to adjust slider
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      const newValue = Math.max(0, value - (event.shiftKey ? 2 : 1));
      onChange(newValue);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      const newValue = Math.min(10, value + (event.shiftKey ? 2 : 1));
      onChange(newValue);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label 
            htmlFor={`weight-${weightKey}`}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle 
                  className="h-4 w-4 text-muted-foreground cursor-help"
                  data-testid={`tooltip-${weightKey}`}
                />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">{WEIGHT_DESCRIPTIONS[weightKey]}</p>
                {tooltip && <p className="text-xs mt-1 text-muted-foreground">{tooltip}</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-2">
          <span 
            className="text-sm font-mono text-foreground min-w-[2ch] text-right"
            data-testid={`value-${weightKey}`}
          >
            {value}
          </span>
        </div>
      </div>
      
      <div className="px-1">
        <Slider
          id={`weight-${weightKey}`}
          value={[value]}
          onValueChange={handleValueChange}
          onKeyDown={handleKeyDown}
          min={0}
          max={10}
          step={1}
          disabled={disabled}
          className="w-full"
          data-testid={`slider-${weightKey}`}
          aria-label={`${label} weight`}
          aria-describedby={`${weightKey}-description`}
        />
      </div>
      
      <div className="sr-only" id={`${weightKey}-description`}>
        {WEIGHT_DESCRIPTIONS[weightKey]}
      </div>
      
      <div className="flex justify-between text-xs text-muted-foreground px-1">
        <span>0</span>
        <span>5</span>
        <span>10</span>
      </div>
    </div>
  );
}