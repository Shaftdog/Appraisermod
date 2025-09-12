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

export default function OrderSummary() {
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
      const response = await apiRequest('POST', `/api/orders/${orderId}/tabs/orderSummary/signoff`, {
        action: 'sign-appraiser',
        overrideReason
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
      toast({
        title: "Section signed off",
        description: "Order Summary has been successfully signed off.",
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

  const tab = order.tabs.orderSummary;
  if (!tab) return null;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2" data-testid="heading-order-summary">
            Order Summary
          </h1>
          <p className="text-muted-foreground">
            Overview of the appraisal order and current status
          </p>
        </div>
        <div className="mt-4 lg:mt-0">
          <Toolbar onVersionsClick={() => setShowVersions(true)} />
        </div>
      </div>

      {/* Status and Sign-off Panel */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Status Panel */}
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
            <p className="mb-1">
              <span className="font-medium">Open Issues:</span> {tab.qc.openIssues}
            </p>
            <p className="mb-1">
              <span className="font-medium">Overridden Issues:</span> {tab.qc.overriddenIssues}
            </p>
            {tab.qc.lastReviewedBy && tab.qc.lastReviewedAt && (
              <p>
                <span className="font-medium">Last Reviewed:</span>{' '}
                {new Date(tab.qc.lastReviewedAt).toLocaleDateString()} by {tab.qc.lastReviewedBy}
              </p>
            )}
          </div>
        </div>

        {/* Sign-off Panel */}
        <SignoffPanel
          signoff={tab.signoff}
          status={tab.qc.status}
          openIssues={tab.qc.openIssues}
          onSignoff={signoffMutation.mutateAsync}
        />
      </div>

      {/* Order Details Content */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-medium text-foreground mb-4">Property Information</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Address:</span>
              <span className="font-medium" data-testid="text-property-address">
                {tab.currentData.propertyAddress || '1234 Oak Street, Austin, TX 78701'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Property Type:</span>
              <span className="font-medium" data-testid="text-property-type">
                {tab.currentData.propertyType || 'Single Family Residence'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Square Footage:</span>
              <span className="font-medium" data-testid="text-square-footage">
                {tab.currentData.squareFootage || '2,450 sq ft'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Year Built:</span>
              <span className="font-medium" data-testid="text-year-built">
                {tab.currentData.yearBuilt || '1995'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-medium text-foreground mb-4">Assignment Details</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Loan Purpose:</span>
              <span className="font-medium" data-testid="text-loan-purpose">
                {tab.currentData.loanPurpose || 'Purchase'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Effective Date:</span>
              <span className="font-medium" data-testid="text-effective-date">
                {tab.currentData.effectiveDate || 'March 5, 2024'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Report Type:</span>
              <span className="font-medium" data-testid="text-report-type">
                {tab.currentData.reportType || 'Appraisal Report'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contract Price:</span>
              <span className="font-medium" data-testid="text-contract-price">
                {tab.currentData.contractPrice || '$485,000'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Version Diff Viewer */}
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
