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

export default function Comps() {
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
      const response = await apiRequest('POST', `/api/orders/${orderId}/tabs/comps/signoff`, {
        action: 'sign-appraiser',
        overrideReason
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
      toast({
        title: "Section signed off",
        description: "Comps has been successfully signed off.",
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

  const tab = order.tabs.comps;
  if (!tab) return null;

  return (
    <div className="p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2" data-testid="heading-comps">
            Comparable Sales
          </h1>
          <p className="text-muted-foreground">
            Analysis of comparable property sales
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

      {/* Critical Issue Alert */}
      {tab.qc.status === 'red' && tab.qc.openIssues > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h4 className="font-medium text-red-800 mb-2">🚨 Critical Issue</h4>
          <p className="text-sm text-red-700">Insufficient comparable sales data - only 2 valid comps found within required criteria</p>
        </div>
      )}

      {/* Comps Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-6 border-b border-border">
          <h3 className="font-medium text-foreground">Comparable Sales Data</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Address</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Sale Price</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Sale Date</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">Sq Ft</th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">$/Sq Ft</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="p-4 text-sm" data-testid="comp-address-1">1240 Oak Street</td>
                <td className="p-4 text-sm font-medium" data-testid="comp-price-1">$472,000</td>
                <td className="p-4 text-sm" data-testid="comp-date-1">Feb 15, 2024</td>
                <td className="p-4 text-sm" data-testid="comp-sqft-1">2,380</td>
                <td className="p-4 text-sm" data-testid="comp-price-per-sqft-1">$198</td>
              </tr>
              <tr className="border-b border-border">
                <td className="p-4 text-sm" data-testid="comp-address-2">1156 Maple Avenue</td>
                <td className="p-4 text-sm font-medium" data-testid="comp-price-2">$495,000</td>
                <td className="p-4 text-sm" data-testid="comp-date-2">Jan 28, 2024</td>
                <td className="p-4 text-sm" data-testid="comp-sqft-2">2,520</td>
                <td className="p-4 text-sm" data-testid="comp-price-per-sqft-2">$196</td>
              </tr>
            </tbody>
          </table>
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
