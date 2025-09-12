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

export default function Subject() {
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
      const response = await apiRequest('POST', `/api/orders/${orderId}/tabs/subject/signoff`, {
        action: 'sign-appraiser',
        overrideReason
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
      toast({
        title: "Section signed off",
        description: "Subject has been successfully signed off.",
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

  const tab = order.tabs.subject;
  if (!tab) return null;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2" data-testid="heading-subject">
            Subject Property
          </h1>
          <p className="text-muted-foreground">
            Detailed information about the subject property
          </p>
        </div>
        <div className="mt-4 lg:mt-0">
          <Toolbar onVersionsClick={() => setShowVersions(true)} />
        </div>
      </div>

      {/* Status and Sign-off Panel */}
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

      {/* Subject Property Form Content */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="font-medium text-foreground mb-4">Property Details</h3>
        <div className="grid lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Legal Description</label>
            <textarea 
              className="w-full p-3 border border-border rounded-lg resize-none" 
              rows={3}
              defaultValue={tab.currentData.legalDescription || "Lot 15, Block B, Sunrise Hills Subdivision, according to the plat thereof recorded in Volume 45, Page 123 of the Plat Records of Travis County, Texas."}
              data-testid="textarea-legal-description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Zoning</label>
            <input 
              type="text" 
              className="w-full p-3 border border-border rounded-lg" 
              defaultValue={tab.currentData.zoning || "SF-3 Single Family Residential"}
              data-testid="input-zoning"
            />
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
