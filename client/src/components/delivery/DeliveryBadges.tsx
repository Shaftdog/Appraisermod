import { useQuery } from '@tanstack/react-query';
import { 
  Download, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Package,
  FileText,
  Image,
  Loader2
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { DeliveryPackage, PackageItem } from '../../../../types/delivery';

interface DeliveryBadgesProps {
  orderId: string;
  onRequestDelivery?: () => void;
  className?: string;
}

type FormatType = 'uad_xml' | 'photos' | 'workfile_zip';

const formatIcons: Record<FormatType, any> = {
  uad_xml: FileText,
  photos: Image,
  workfile_zip: Package,
};

const formatLabels: Record<FormatType, string> = {
  uad_xml: 'UAD XML',
  photos: 'Photos',
  workfile_zip: 'Workfile',
};

const isValidFormat = (format: string): format is FormatType => {
  return ['uad_xml', 'photos', 'workfile_zip'].includes(format);
};

function getStatusVariant(status: string) {
  switch (status) {
    case 'completed':
      return 'default';
    case 'processing':
      return 'secondary';
    case 'failed':
      return 'destructive';
    case 'pending':
    default:
      return 'outline';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return CheckCircle;
    case 'processing':
      return Loader2;
    case 'failed':
      return AlertCircle;
    case 'pending':
    default:
      return Clock;
  }
}

export function DeliveryBadges({ orderId, onRequestDelivery, className = '' }: DeliveryBadgesProps) {
  // Load deliveries for this order
  const { data: deliveries = [], isLoading } = useQuery<DeliveryPackage[]>({
    queryKey: ['/api/delivery/orders', orderId, 'deliveries'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const latestDelivery = deliveries[0]; // Most recent delivery
  const hasCompletedDeliveries = deliveries.some((d: DeliveryPackage) => d.status === 'completed');
  const hasActiveDeliveries = deliveries.some((d: DeliveryPackage) => d.status === 'processing' || d.status === 'pending');

  const handleDownload = (deliveryId: string, filename?: string) => {
    const downloadUrl = filename 
      ? `/api/delivery/download/${deliveryId}/${filename}`
      : `/api/delivery/download/${deliveryId}`;
    
    window.open(downloadUrl, '_blank');
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading deliveries...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={`flex items-center gap-2 ${className}`}>
        {/* No deliveries - show request button */}
        {deliveries.length === 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRequestDelivery}
            data-testid="button-request-first-delivery"
          >
            <Download className="h-3 w-3 mr-1" />
            Request Delivery
          </Button>
        )}

        {/* Show latest delivery status */}
        {latestDelivery && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <Badge variant={getStatusVariant(latestDelivery.status)} data-testid={`badge-delivery-status-${latestDelivery.status}`}>
                  {(() => {
                    const StatusIcon = getStatusIcon(latestDelivery.status);
                    return (
                      <>
                        <StatusIcon className={`h-3 w-3 mr-1 ${latestDelivery.status === 'processing' ? 'animate-spin' : ''}`} />
                        {latestDelivery.status === 'completed' ? 'Ready' : 
                         latestDelivery.status === 'processing' ? 'Processing' :
                         latestDelivery.status === 'failed' ? 'Failed' : 'Pending'}
                      </>
                    );
                  })()}
                </Badge>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <p className="font-medium">Latest Delivery</p>
                <p className="text-xs">
                  Requested: {new Date(latestDelivery.requestedAt).toLocaleString()}
                </p>
                {latestDelivery.completedAt && (
                  <p className="text-xs">
                    Completed: {new Date(latestDelivery.completedAt).toLocaleString()}
                  </p>
                )}
                <p className="text-xs">
                  Formats: {latestDelivery.formats.map(f => isValidFormat(f) ? formatLabels[f] : f).join(', ')}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Show format badges for completed deliveries */}
        {latestDelivery?.status === 'completed' && (
          <div className="flex items-center gap-1">
            {latestDelivery.formats.map((format: string) => {
              if (!isValidFormat(format)) return null;
              const FormatIcon = formatIcons[format];
              const matchingItem = latestDelivery.packageItems.find((item: PackageItem) => 
                item.type === format || 
                (format === 'photos' && item.type === 'photo') ||
                item.filename.toLowerCase().includes(format.toLowerCase())
              );
              
              return (
                <Tooltip key={format}>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 py-0"
                      onClick={() => matchingItem && handleDownload(latestDelivery.id, matchingItem.filename)}
                      data-testid={`button-download-format-${format}`}
                    >
                      <FormatIcon className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Download {isValidFormat(format) ? formatLabels[format] : format}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}

        {/* Show delivery count if multiple deliveries exist */}
        {deliveries.length > 1 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="text-xs" data-testid="badge-delivery-count">
                {deliveries.length}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>{deliveries.length} total deliveries</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Request new delivery button for existing orders */}
        {(hasCompletedDeliveries || hasActiveDeliveries) && onRequestDelivery && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRequestDelivery}
            className="h-6 px-2 py-0"
            data-testid="button-request-new-delivery"
          >
            <Download className="h-3 w-3" />
          </Button>
        )}
      </div>
    </TooltipProvider>
  );
}

// Summary component for overview displays
interface DeliverySummaryProps {
  orderId: string;
  className?: string;
}

export function DeliverySummary({ orderId, className = '' }: DeliverySummaryProps) {
  const { data: deliveries = [], isLoading } = useQuery<DeliveryPackage[]>({
    queryKey: ['/api/delivery/orders', orderId, 'deliveries'],
  });

  if (isLoading) {
    return (
      <div className={`text-sm text-muted-foreground ${className}`}>
        Loading...
      </div>
    );
  }

  if (deliveries.length === 0) {
    return (
      <div className={`text-sm text-muted-foreground ${className}`} data-testid="text-no-deliveries">
        No deliveries
      </div>
    );
  }

  const completedCount = deliveries.filter((d: DeliveryPackage) => d.status === 'completed').length;
  const processingCount = deliveries.filter((d: DeliveryPackage) => d.status === 'processing').length;
  const failedCount = deliveries.filter((d: DeliveryPackage) => d.status === 'failed').length;

  return (
    <div className={`text-sm ${className}`} data-testid="text-delivery-summary">
      {completedCount > 0 && (
        <span className="text-green-600 dark:text-green-400">
          {completedCount} completed
        </span>
      )}
      {processingCount > 0 && (
        <span className="text-blue-600 dark:text-blue-400 ml-2">
          {processingCount} processing
        </span>
      )}
      {failedCount > 0 && (
        <span className="text-red-600 dark:text-red-400 ml-2">
          {failedCount} failed
        </span>
      )}
    </div>
  );
}