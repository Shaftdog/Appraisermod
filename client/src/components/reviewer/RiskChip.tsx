import { cn } from "@/lib/utils";

interface RiskChipProps {
  risk: 'red' | 'yellow' | 'green';
  count?: number;
  className?: string;
}

export function RiskChip({ risk, count, className }: RiskChipProps) {
  const variants = {
    red: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800',
    green: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
  };

  const labels = {
    red: 'High Risk',
    yellow: 'Medium Risk', 
    green: 'Low Risk'
  };

  return (
    <span 
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
        variants[risk],
        className
      )}
      data-testid={`chip-risk-${risk}`}
    >
      <span className={cn("w-2 h-2 rounded-full mr-1", {
        'bg-red-500': risk === 'red',
        'bg-yellow-500': risk === 'yellow', 
        'bg-green-500': risk === 'green'
      })} />
      {labels[risk]}
      {count !== undefined && (
        <span className="ml-1 font-semibold">({count})</span>
      )}
    </span>
  );
}