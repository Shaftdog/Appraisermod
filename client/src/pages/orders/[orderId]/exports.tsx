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

export default function Exports() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId;
  const [showVersions, setShowVersions] = useState(false);
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
        <div className="grid lg:grid-cols-2 gap-4">
          <button className="p-4 border border-border rounded-lg hover:bg-muted transition-colors text-left" data-testid="button-export-pdf">
            <div className="font-medium text-foreground mb-1">PDF Report</div>
            <div className="text-sm text-muted-foreground">Complete appraisal report</div>
          </button>
          <button className="p-4 border border-border rounded-lg hover:bg-muted transition-colors text-left" data-testid="button-export-excel">
            <div className="font-medium text-foreground mb-1">Excel Summary</div>
            <div className="text-sm text-muted-foreground">Data export for analysis</div>
          </button>
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
    </div>
  );
}
