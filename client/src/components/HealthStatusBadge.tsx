import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface HealthCheck {
  name: string;
  ok: boolean;
  detail: string;
}

interface HealthStatus {
  ok: boolean;
  checks: HealthCheck[];
  at: string;
}

export function HealthStatusBadge() {
  const { data: healthStatus, error, isLoading } = useQuery<HealthStatus>({
    queryKey: ['/api/ops/health'],
    queryFn: async () => {
      const response = await fetch('/api/ops/health', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      
      return response.json();
    },
    refetchInterval: 30000, // Poll every 30 seconds
    retry: 3,
    retryDelay: 1000,
    staleTime: 15000, // Consider stale after 15 seconds
  });

  if (isLoading) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge 
              variant="secondary" 
              className="flex items-center gap-1 text-xs cursor-help"
              data-testid="health-badge-loading"
            >
              <Clock className="h-3 w-3 animate-pulse" />
              Health
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Checking system health...</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (error || !healthStatus) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge 
              variant="destructive" 
              className="flex items-center gap-1 text-xs cursor-help"
              data-testid="health-badge-error"
            >
              <XCircle className="h-3 w-3" />
              Unknown
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            <div className="space-y-1">
              <p className="font-medium text-red-400">Health Check Unavailable</p>
              <p className="text-xs text-muted-foreground">
                {error instanceof Error ? error.message : 'Unable to reach health endpoint'}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const getStatusConfig = (ok: boolean) => {
    if (ok) {
      return {
        variant: 'default' as const,
        icon: CheckCircle,
        label: 'Healthy',
        testId: 'health-badge-healthy'
      };
    } else {
      return {
        variant: 'destructive' as const,
        icon: AlertCircle,
        label: 'Issues',
        testId: 'health-badge-issues'
      };
    }
  };

  const config = getStatusConfig(healthStatus.ok);
  const Icon = config.icon;

  const formatTimestamp = (isoString: string) => {
    try {
      return format(new Date(isoString), 'MMM dd, HH:mm:ss');
    } catch {
      return 'Unknown time';
    }
  };

  const healthyChecks = healthStatus.checks.filter(check => check.ok);
  const failedChecks = healthStatus.checks.filter(check => !check.ok);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge 
            variant={config.variant}
            className={cn(
              "flex items-center gap-1 text-xs cursor-help transition-all",
              healthStatus.ok 
                ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900 dark:text-green-200" 
                : "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900 dark:text-red-200"
            )}
            data-testid={config.testId}
          >
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-md p-0" side="bottom" align="end">
          <div className="p-3 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={cn(
                  "h-4 w-4",
                  healthStatus.ok ? "text-green-600" : "text-red-600"
                )} />
                <span className="font-medium text-sm">
                  System Health
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(healthStatus.at)}
              </span>
            </div>

            {/* Failed Checks */}
            {failedChecks.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  ⚠️ Issues ({failedChecks.length})
                </p>
                {failedChecks.map((check, i) => (
                  <div key={i} className="text-xs pl-3 space-y-0.5">
                    <div className="font-medium capitalize text-red-700 dark:text-red-300">
                      {check.name.replace(/-/g, ' ')}
                    </div>
                    <div className="text-muted-foreground">
                      {check.detail}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Healthy Checks */}
            {healthyChecks.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-green-600 dark:text-green-400">
                  ✅ Healthy ({healthyChecks.length})
                </p>
                <div className="text-xs pl-3 space-y-0.5">
                  {healthyChecks.map((check, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="capitalize text-muted-foreground">
                        {check.name.replace(/-/g, ' ')}
                      </span>
                      <span className="text-green-600 dark:text-green-400 text-xs">
                        OK
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="pt-2 border-t text-xs text-muted-foreground">
              {healthStatus.ok 
                ? `All ${healthStatus.checks.length} checks passing`
                : `${failedChecks.length} of ${healthStatus.checks.length} checks failing`
              }
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}