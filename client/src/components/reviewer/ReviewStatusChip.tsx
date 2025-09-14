import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { RiskChip } from "./RiskChip";
import { Clock, CheckCircle2, AlertTriangle, MessageSquare } from "lucide-react";
import { ReviewItem } from "../../../../types/review";

interface ReviewStatusChipProps {
  orderId: string;
  className?: string;
}

export function ReviewStatusChip({ orderId, className }: ReviewStatusChipProps) {
  const { data: reviewItem, isLoading } = useQuery<ReviewItem>({
    queryKey: ['/api/review', orderId],
    enabled: !!orderId
  });

  // Show loading state to prevent flicker
  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600" />
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  // Don't show if no review data exists
  if (!reviewItem) {
    return null;
  }

  const getStatusConfig = () => {
    switch (reviewItem.status) {
      case 'approved':
        return {
          icon: <CheckCircle2 className="h-3 w-3" />,
          label: 'Approved',
          variant: 'default' as const,
          bgColor: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
        };
      case 'changes_requested':
        return {
          icon: <AlertTriangle className="h-3 w-3" />,
          label: 'Changes Requested',
          variant: 'destructive' as const,
          bgColor: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
        };
      default:
        return {
          icon: <Clock className="h-3 w-3" />,
          label: 'Under Review',
          variant: 'secondary' as const,
          bgColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
        };
    }
  };

  const config = getStatusConfig();
  const criticalCount = reviewItem.hits.filter(hit => hit.risk === 'red').length;
  const warningCount = reviewItem.hits.filter(hit => hit.risk === 'yellow').length;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Badge className={`${config.bgColor} border-none`} data-testid="badge-review-status">
        {config.icon}
        <span className="ml-1">{config.label}</span>
      </Badge>
      
      {/* Only show risk chips if there are hits */}
      {criticalCount > 0 && (
        <RiskChip risk="red" count={criticalCount} className="text-xs py-0" />
      )}
      
      {warningCount > 0 && (
        <RiskChip risk="yellow" count={warningCount} className="text-xs py-0" />
      )}
      
      {/* Only show comments badge if there are comments */}
      {reviewItem.comments.length > 0 && (
        <Badge variant="outline" className="text-xs">
          <MessageSquare className="h-3 w-3 mr-1" />
          {reviewItem.comments.length}
        </Badge>
      )}
    </div>
  );
}