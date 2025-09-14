import { RiskStatus } from '@/types';
import { getStatusLabel, getStatusColor, getStatusDotColor } from '@/lib/aggregateStatus';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface StatusChipProps {
  status: RiskStatus;
  openIssues?: number;
  overriddenIssues?: number;
  lastReviewedBy?: string;
  lastReviewedAt?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusChip({ 
  status, 
  openIssues = 0, 
  overriddenIssues = 0,
  lastReviewedBy,
  lastReviewedAt,
  className,
  size = 'md'
}: StatusChipProps) {
  const label = getStatusLabel(status, openIssues, overriddenIssues);
  const colorClasses = getStatusColor(status);
  const dotColorClasses = getStatusDotColor(status);

  const tooltipContent = (
    <div className="text-sm">
      <p><span className="font-medium">Open Issues:</span> {openIssues}</p>
      <p><span className="font-medium">Overridden Issues:</span> {overriddenIssues}</p>
      {lastReviewedBy && lastReviewedAt && (
        <p><span className="font-medium">Last Reviewed:</span> {new Date(lastReviewedAt).toLocaleString()} by {lastReviewedBy}</p>
      )}
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div 
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-help",
            colorClasses,
            className
          )}
          data-testid={`status-chip-${status}`}
        >
          <div className={cn("w-2 h-2 rounded-full", dotColorClasses)} />
          <span>{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
}
