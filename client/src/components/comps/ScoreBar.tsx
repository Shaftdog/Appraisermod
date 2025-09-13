import { cn } from "@/lib/utils";
import { ScoreBand } from "@shared/schema";

interface ScoreBarProps {
  score: number; // 0-1 scale
  band: ScoreBand;
  className?: string;
}

export function ScoreBar({ score, band, className }: ScoreBarProps) {
  const percentage = Math.round(score * 100);
  
  const getBandColor = (band: ScoreBand) => {
    switch (band) {
      case 'high':
        return 'bg-green-500';
      case 'medium': 
        return 'bg-yellow-500';
      case 'low':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getBandLabel = (band: ScoreBand) => {
    switch (band) {
      case 'high':
        return 'High';
      case 'medium':
        return 'Medium';
      case 'low':
        return 'Low';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)} data-testid={`score-bar-${band}`}>
      <div className="flex-1 bg-gray-200 rounded-full h-2 dark:bg-gray-700">
        <div 
          className={cn("h-2 rounded-full transition-all duration-300", getBandColor(band))}
          style={{ width: `${percentage}%` }}
          aria-label={`Score: ${percentage}% (${getBandLabel(band)})`}
        />
      </div>
      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 min-w-[3rem]">
        {percentage}
      </div>
      <div className={cn(
        "text-xs px-2 py-1 rounded-full font-medium",
        band === 'high' && "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
        band === 'medium' && "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", 
        band === 'low' && "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      )}>
        {getBandLabel(band)}
      </div>
    </div>
  );
}