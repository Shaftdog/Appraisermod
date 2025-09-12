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

export default function Market() {
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
      const response = await apiRequest('POST', `/api/orders/${orderId}/tabs/market/signoff`, {
        action: 'sign-appraiser',
        overrideReason
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
      toast({
        title: "Section signed off",
        description: "Market has been successfully signed off.",
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

  const tab = order.tabs.market;
  if (!tab) return null;

  return (
    <div className="p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2" data-testid="heading-market">
            Market Analysis
          </h1>
          <p className="text-muted-foreground">
            Market conditions and trends analysis
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
          <div className="text-sm text-muted-foreground">
            <p className="mb-1"><span className="font-medium">Open Issues:</span> {tab.qc.openIssues}</p>
            <p className="mb-1"><span className="font-medium">Overridden Issues:</span> {tab.qc.overriddenIssues}</p>
            {tab.qc.lastReviewedBy && tab.qc.lastReviewedAt && (
              <p><span className="font-medium">Last Reviewed:</span> {new Date(tab.qc.lastReviewedAt).toLocaleDateString()} by {tab.qc.lastReviewedBy}</p>
            )}
          </div>
        </div>

        <SignoffPanel
          signoff={tab.signoff}
          status={tab.qc.status}
          openIssues={tab.qc.openIssues}
          onSignoff={signoffMutation.mutateAsync}
        />
      </div>

      {/* Market Analysis Content */}
      <div className="space-y-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-medium text-foreground mb-4">Market Conditions</h3>
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-foreground mb-1" data-testid="metric-days-on-market">
                {tab.currentData.daysOnMarket || '45'}
              </div>
              <div className="text-sm text-muted-foreground">Average Days on Market</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-foreground mb-1" data-testid="metric-absorption">
                {tab.currentData.absorption || '6.2'}
              </div>
              <div className="text-sm text-muted-foreground">Months of Inventory</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-foreground mb-1" data-testid="metric-price-change">
                {tab.currentData.priceChange || '+3.2%'}
              </div>
              <div className="text-sm text-muted-foreground">YoY Price Change</div>
            </div>
          </div>
        </div>

        {/* Warning Issues */}
        {tab.qc.status === 'yellow' && tab.qc.openIssues > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-800 mb-2">⚠️ Warnings ({tab.qc.openIssues})</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Limited comparable sales in past 6 months</li>
              <li>• Market volatility detected in neighborhood</li>
            </ul>
          </div>
        )}
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
