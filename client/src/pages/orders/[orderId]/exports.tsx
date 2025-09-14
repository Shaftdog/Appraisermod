import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'wouter';
import { StatusChip } from '@/components/StatusChip';
import { SignoffPanel } from '@/components/SignoffPanel';
import { VersionDiffViewer } from '@/components/VersionDiffViewer';
import { Toolbar } from '@/components/Toolbar';
import { Order } from '@/types';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// Delivery system imports
import { DeliveryDrawer } from '@/components/delivery/DeliveryDrawer';
import { DeliveryBadges } from '@/components/delivery/DeliveryBadges';
import { Button } from '@/components/ui/button';
import { Download, FileText, Grid } from 'lucide-react';

export default function Exports() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId;
  const [showVersions, setShowVersions] = useState(false);
  const [showDeliveryDrawer, setShowDeliveryDrawer] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: order } = useQuery<Order>({
    queryKey: ['/api/orders', orderId],
    enabled: !!orderId
  });

  const signoffMutation = useMutation({
    mutationFn: async (overrideReason?: string) => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/tabs/exports/signoff`, {
        action: 'sign-appraiser',
        overrideReason
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
      toast({
        title: "Section signed off",
        description: "Exports has been successfully signed off.",
      });
    },
    onError: (error) => {
      toast({
        title: "Sign-off failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  if (!order) return null;

  const tab = order.tabs.exports;
  if (!tab) return null;

  return (
    <div className="p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2" data-testid="heading-exports">
            Exports
          </h1>
          <p className="text-muted-foreground">
            Generate and download reports
          </p>
        </div>
        <div className="mt-4 lg:mt-0">
          <Toolbar onVersionsClick={() => setShowVersions(true)} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-medium text-foreground mb-4">Section Status</h3>
          <div className="flex items-center gap-3 mb-3">
            <StatusChip
              status={tab.qc.status}
              openIssues={tab.qc.openIssues}
              overriddenIssues={tab.qc.overriddenIssues}
              lastReviewedBy={tab.qc.lastReviewedBy}
              lastReviewedAt={tab.qc.lastReviewedAt}
            />
          </div>
          
          {/* Delivery Status */}
          <div className="mt-4">
            <h4 className="text-sm font-medium text-foreground mb-2">Delivery Status</h4>
            <DeliveryBadges 
              orderId={orderId!} 
              onRequestDelivery={() => setShowDeliveryDrawer(true)}
              className="flex items-center gap-2"
            />
          </div>
        </div>

        <SignoffPanel
          signoff={tab.signoff}
          status={tab.qc.status}
          openIssues={tab.qc.openIssues}
          onSignoff={signoffMutation.mutateAsync}
        />
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="font-medium text-foreground mb-4">Export Options</h3>
        <div className="grid lg:grid-cols-2 gap-4 mb-6">
          <button className="p-4 border border-border rounded-lg hover:bg-muted transition-colors text-left" data-testid="button-export-pdf">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div className="font-medium text-foreground">PDF Report</div>
            </div>
            <div className="text-sm text-muted-foreground">Complete appraisal report</div>
          </button>
          <button className="p-4 border border-border rounded-lg hover:bg-muted transition-colors text-left" data-testid="button-export-excel">
            <div className="flex items-center gap-2 mb-1">
              <Grid className="h-4 w-4 text-muted-foreground" />
              <div className="font-medium text-foreground">Excel Summary</div>
            </div>
            <div className="text-sm text-muted-foreground">Data export for analysis</div>
          </button>
        </div>

        {/* Delivery Options */}
        <div className="border-t border-border pt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-foreground">Professional Delivery</h4>
            <Button
              onClick={() => setShowDeliveryDrawer(true)}
              size="sm"
              data-testid="button-request-delivery"
            >
              <Download className="h-3 w-3 mr-1" />
              Request Delivery
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Generate MISMO UAD XML, package photos, and create complete workfile deliveries for clients
          </p>
          
          {/* Recent deliveries summary */}
          <div className="bg-muted/50 rounded-lg p-3">
            <h5 className="text-xs font-medium text-foreground mb-2">Recent Deliveries</h5>
            <DeliveryBadges 
              orderId={orderId!} 
              onRequestDelivery={() => setShowDeliveryDrawer(true)}
              className="flex items-center gap-2"
            />
          </div>
        </div>
      </div>

      {showVersions && (
        <VersionDiffViewer
          versions={tab.versions}
          currentData={tab.currentData}
          open={showVersions}
          onClose={() => setShowVersions(false)}
        />
      )}

      {/* Delivery Drawer */}
      <DeliveryDrawer
        orderId={orderId!}
        isOpen={showDeliveryDrawer}
        onClose={() => setShowDeliveryDrawer(false)}
      />
    </div>
  );
}
