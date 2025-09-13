/**
 * QC status badge for photos with tooltip showing issues
 */

import { CheckCircle, AlertTriangle, XCircle, Camera } from 'lucide-react';
import { PhotosQcSummary, CATEGORY_LABELS, REQUIRED_CATEGORIES } from '@/types/photos';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface PhotosQcBadgeProps {
  qcSummary: PhotosQcSummary | null;
  loading?: boolean;
  className?: string;
}

export function PhotosQcBadge({ qcSummary, loading = false, className }: PhotosQcBadgeProps) {
  if (loading) {
    return (
      <Badge variant="outline" className={cn("animate-pulse", className)}>
        <Camera className="h-3 w-3 mr-1" />
        Loading...
      </Badge>
    );
  }

  if (!qcSummary) {
    return (
      <Badge variant="secondary" className={className}>
        <Camera className="h-3 w-3 mr-1" />
        No QC Data
      </Badge>
    );
  }

  const { status, missingCategories, unresolvedDetections, requiredPresent } = qcSummary;

  // Determine badge appearance based on status
  const getStatusConfig = () => {
    switch (status) {
      case 'green':
        return {
          variant: 'default' as const,
          icon: CheckCircle,
          text: 'Photos Complete',
          bgClass: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200'
        };
      case 'yellow':
        return {
          variant: 'secondary' as const,
          icon: AlertTriangle,
          text: 'Minor Issues',
          bgClass: 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200'
        };
      case 'red':
        return {
          variant: 'destructive' as const,
          icon: XCircle,
          text: 'Issues Found',
          bgClass: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200'
        };
      default:
        return {
          variant: 'outline' as const,
          icon: Camera,
          text: 'Unknown Status',
          bgClass: ''
        };
    }
  };

  const statusConfig = getStatusConfig();
  const Icon = statusConfig.icon;

  // Build tooltip content
  const getTooltipContent = () => {
    const issues: string[] = [];

    if (!requiredPresent) {
      issues.push('Missing required photos');
    }

    if (missingCategories.length > 0) {
      const missingNames = missingCategories
        .map(cat => CATEGORY_LABELS[cat])
        .join(', ');
      issues.push(`Missing categories: ${missingNames}`);
    }

    if (unresolvedDetections > 0) {
      issues.push(`${unresolvedDetections} unresolved face detection${unresolvedDetections > 1 ? 's' : ''}`);
    }

    if (issues.length === 0) {
      return 'All photo requirements met. Ready for sign-off.';
    }

    return (
      <div className="space-y-2">
        <div className="font-medium">Photo QC Issues:</div>
        <ul className="space-y-1">
          {issues.map((issue, index) => (
            <li key={index} className="text-sm">• {issue}</li>
          ))}
        </ul>
        {status === 'red' && (
          <div className="text-xs pt-1 border-t border-border">
            Sign-off will be blocked until issues are resolved
          </div>
        )}
      </div>
    );
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={statusConfig.variant}
          className={cn(
            "flex items-center gap-1.5 cursor-help transition-colors",
            statusConfig.bgClass,
            className
          )}
          data-testid={`qc-badge-${status}`}
        >
          <Icon className="h-3 w-3" />
          <span className="font-medium">{statusConfig.text}</span>
          {(missingCategories.length > 0 || unresolvedDetections > 0) && (
            <span className="text-xs opacity-75">
              ({missingCategories.length + (unresolvedDetections > 0 ? 1 : 0)})
            </span>
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-80" side="bottom">
        {getTooltipContent()}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Hook to determine if sign-off should be blocked based on QC status
 */
export function usePhotoSignoffBlock(qcSummary: PhotosQcSummary | null): {
  isBlocked: boolean;
  blockReason: string | null;
} {
  if (!qcSummary) {
    return { isBlocked: false, blockReason: null };
  }

  if (qcSummary.status === 'red') {
    const issues: string[] = [];

    if (!qcSummary.requiredPresent) {
      issues.push('missing required photos');
    }

    if (qcSummary.missingCategories.length > 0) {
      issues.push(`missing ${qcSummary.missingCategories.length} required categories`);
    }

    if (qcSummary.unresolvedDetections > 0) {
      issues.push(`${qcSummary.unresolvedDetections} unresolved face detections`);
    }

    if (issues.length > 0) {
      return {
        isBlocked: true,
        blockReason: `Photos section has ${issues.join(', ')}`
      };
    }
  }

  return { isBlocked: false, blockReason: null };
}