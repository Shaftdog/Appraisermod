import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

interface ConstraintSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  suffix: string;
  tooltip: string;
  disabled?: boolean;
  testId: string;
}

export function ConstraintSlider({ 
  label, 
  value, 
  onChange, 
  min, 
  max, 
  step, 
  suffix, 
  tooltip, 
  disabled = false,
  testId
}: ConstraintSliderProps) {
  const handleValueChange = (values: number[]) => {
    onChange(values[0]);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    
    // Allow arrow keys to adjust slider
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      const stepSize = event.shiftKey ? step * 2 : step;
      const newValue = Math.max(min, value - stepSize);
      onChange(Math.round(newValue * 100) / 100); // Round to 2 decimal places
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      const stepSize = event.shiftKey ? step * 2 : step;
      const newValue = Math.min(max, value + stepSize);
      onChange(Math.round(newValue * 100) / 100); // Round to 2 decimal places
    }
  };

  const formatValue = (val: number): string => {
    if (step < 1) {
      return val.toFixed(1);
    }
    return val.toString();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label 
            htmlFor={`constraint-${testId}`}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle 
                  className="h-4 w-4 text-muted-foreground cursor-help"
                  data-testid={`tooltip-${testId}`}
                />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-1">
          <span 
            className="text-sm font-mono text-foreground"
            data-testid={`value-${testId}`}
          >
            {formatValue(value)}
          </span>
          <span className="text-sm text-muted-foreground">
            {suffix}
          </span>
        </div>
      </div>
      
      <div className="px-1">
        <Slider
          id={`constraint-${testId}`}
          value={[value]}
          onValueChange={handleValueChange}
          onKeyDown={handleKeyDown}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="w-full"
          data-testid={`slider-${testId}`}
          aria-label={`${label} constraint`}
        />
      </div>
      
      <div className="flex justify-between text-xs text-muted-foreground px-1">
        <span>{formatValue(min)}{suffix}</span>
        <span>{formatValue((min + max) / 2)}{suffix}</span>
        <span>{formatValue(max)}{suffix}</span>
      </div>
    </div>
  );
}