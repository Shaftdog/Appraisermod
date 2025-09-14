import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RiskChip } from "@/components/reviewer/RiskChip";
import { OverrideDialog } from "@/components/reviewer/OverrideDialog";
import { 
  ArrowLeft, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  MessageSquare,
  GitBranch,
  FileText,
  Clock,
  User
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ReviewItem, RuleHit } from "../../../types/review";

export function OrderReview() {
  const { orderId } = useParams<{ orderId: string }>();
  const { toast } = useToast();
  
  // Dialog states
  const [overrideDialog, setOverrideDialog] = useState<{ open: boolean; hit?: RuleHit }>({ open: false });
  const [approveDialog, setApproveDialog] = useState(false);
  const [rejectDialog, setRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const { data: reviewItem, isLoading } = useQuery<ReviewItem>({
    queryKey: ['/api/review', orderId],
    enabled: !!orderId
  });

  // Signoff mutation for approve/reject actions
  const signoffMutation = useMutation({
    mutationFn: async (data: { accept: boolean; reason?: string }) => {
      const res = await apiRequest("POST", `/api/review/${orderId}/signoff`, data);
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: variables.accept ? "Order Approved" : "Changes Requested",
        description: variables.accept
          ? "The order has been approved successfully."
          : "Change request has been sent to the appraiser.",
      });
      
      // Invalidate both queue and review detail caches
      queryClient.invalidateQueries({ queryKey: ['/api/review/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/review', orderId] });
      
      // Close dialogs
      setApproveDialog(false);
      setRejectDialog(false);
      setRejectReason("");
    },
    onError: (error: Error) => {
      toast({
        title: "Action Failed",
        description: error.message || "Failed to complete review action. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleApprove = () => {
    signoffMutation.mutate({ accept: true });
  };

  const handleReject = () => {
    if (rejectReason.trim().length === 0) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for requesting changes.",
        variant: "destructive",
      });
      return;
    }
    signoffMutation.mutate({ accept: false, reason: rejectReason.trim() });
  };

  const handleOverride = (hit: RuleHit) => {
    setOverrideDialog({ open: true, hit });
  };

  if (isLoading) {
    return (
      <RoleGuard role="reviewer">
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </RoleGuard>
    );
  }

  if (!reviewItem) {
    return (
      <RoleGuard role="reviewer">
        <div className="container mx-auto px-6 py-8">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h1 className="text-2xl font-bold mb-2">Review Not Found</h1>
            <p className="text-muted-foreground mb-4">
              The requested order review could not be found.
            </p>
            <Link href="/reviewer">
              <Button>Back to Queue</Button>
            </Link>
          </div>
        </div>
      </RoleGuard>
    );
  }

  const criticalHits = reviewItem.hits.filter(hit => hit.risk === 'red');
  const warningHits = reviewItem.hits.filter(hit => hit.risk === 'yellow');
  const infoHits = reviewItem.hits.filter(hit => hit.risk === 'green');
  
  // Check if approval is blocked by unresolved red hits
  const unresolvedCriticalHits = criticalHits.filter(hit => 
    !reviewItem.overrides.some(override => override.ruleId === hit.ruleId)
  );
  const isApprovalBlocked = unresolvedCriticalHits.length > 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'changes_requested':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-yellow-500" />;
    }
  };

  return (
    <RoleGuard role="reviewer">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/reviewer">
              <Button variant="ghost" size="sm" data-testid="button-back-to-queue">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Queue
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Order Review</h1>
              <p className="text-sm text-muted-foreground">Order ID: {orderId}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {getStatusIcon(reviewItem.status)}
            <RiskChip risk={reviewItem.overallRisk} />
          </div>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="hits" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="hits" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Policy Hits ({reviewItem.hits.length})
            </TabsTrigger>
            <TabsTrigger value="comments" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Comments ({reviewItem.comments.length})
            </TabsTrigger>
            <TabsTrigger value="diff" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Version Diff
            </TabsTrigger>
            <TabsTrigger value="actions" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Actions
            </TabsTrigger>
          </TabsList>

          {/* Policy Hits Tab */}
          <TabsContent value="hits" className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-red-600">Critical Issues</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{criticalHits.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-yellow-600">Warnings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">{warningHits.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-blue-600">Info</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{infoHits.length}</div>
                </CardContent>
              </Card>
            </div>

            {/* Policy Violations */}
            <div className="space-y-4">
              {reviewItem.hits.map((hit, index) => (
                <Card key={index} className="border-l-4" style={{
                  borderLeftColor: hit.risk === 'red' ? '#ef4444' : hit.risk === 'yellow' ? '#f59e0b' : '#10b981'
                }}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <RiskChip risk={hit.risk} />
                          <Badge variant="outline">{hit.scope}</Badge>
                        </div>
                        <h3 className="font-semibold">{hit.ruleId}</h3>
                        <p className="text-sm text-muted-foreground">{hit.path}</p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleOverride(hit)}
                        data-testid={`button-override-${hit.ruleId}`}
                      >
                        Override
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm mb-3">{hit.message}</p>
                    {hit.entities && (
                      <div className="mb-3">
                        <p className="text-xs text-muted-foreground mb-1">Affected entities:</p>
                        <div className="flex gap-2">
                          {hit.entities.map((entity, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {entity}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {hit.suggestion && (
                      <div className="bg-muted/50 p-3 rounded-md">
                        <p className="text-xs text-muted-foreground mb-1">Suggested fix:</p>
                        <p className="text-sm">Action: {hit.suggestion.action}{hit.suggestion.path && `, Path: ${hit.suggestion.path}`}{hit.suggestion.value !== undefined && `, Value: ${hit.suggestion.value}`}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {reviewItem.hits.length === 0 && (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                <h3 className="text-lg font-semibold mb-2">No Policy Violations</h3>
                <p className="text-muted-foreground">This order passes all policy checks.</p>
              </div>
            )}
          </TabsContent>

          {/* Comments Tab */}
          <TabsContent value="comments" className="space-y-4">
            {reviewItem.comments.map((thread) => (
              <Card key={thread.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Thread: {thread.entityRef}</h3>
                      <p className="text-sm text-muted-foreground">
                        Created by {thread.createdBy}
                      </p>
                    </div>
                    <Badge variant={thread.status === 'resolved' ? 'default' : 'secondary'}>
                      {thread.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {thread.items.map((comment) => (
                    <div key={comment.id} className="border-l-2 border-muted pl-4">
                      <div className="flex items-center gap-2 mb-1">
                        <User className="h-4 w-4" />
                        <span className="text-sm font-medium">{comment.authorId}</span>
                        <Badge variant="outline" className="text-xs">{comment.kind}</Badge>
                        <span className="text-xs text-muted-foreground">{comment.at}</span>
                      </div>
                      <p className="text-sm">{comment.text}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
            
            {reviewItem.comments.length === 0 && (
              <div className="text-center py-12">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Comments</h3>
                <p className="text-muted-foreground">No review comments have been added yet.</p>
              </div>
            )}
          </TabsContent>

          {/* Version Diff Tab */}
          <TabsContent value="diff">
            <Card>
              <CardHeader>
                <CardTitle>Version Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Version diff functionality would be implemented here.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Actions Tab */}
          <TabsContent value="actions" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Reviewer Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Reviewer Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button 
                    className="w-full" 
                    variant="default" 
                    onClick={() => setApproveDialog(true)}
                    disabled={signoffMutation.isPending}
                    data-testid="button-approve-order"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {signoffMutation.isPending ? "Processing..." : "Approve Order"}
                  </Button>
                  <Button 
                    className="w-full" 
                    variant="destructive" 
                    onClick={() => setRejectDialog(true)}
                    disabled={signoffMutation.isPending}
                    data-testid="button-request-changes"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    {signoffMutation.isPending ? "Processing..." : "Request Changes"}
                  </Button>
                </CardContent>
              </Card>

              {/* Sign-off Status */}
              <Card>
                <CardHeader>
                  <CardTitle>Sign-off Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Reviewer Sign-off:</span>
                      {reviewItem.reviewerSignedOff ? (
                        <Badge variant="default">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Signed
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Appraiser Response:</span>
                      {reviewItem.appraiserSignedOff ? (
                        <Badge variant="default">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Responded
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Override Dialog */}
        {overrideDialog.hit && (
          <OverrideDialog
            isOpen={overrideDialog.open}
            onClose={() => setOverrideDialog({ open: false })}
            orderId={orderId!}
            hit={overrideDialog.hit}
          />
        )}

        {/* Approve Confirmation Dialog */}
        <AlertDialog open={approveDialog} onOpenChange={setApproveDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve Order</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to approve this order? This action will mark the review as complete and approved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {isApprovalBlocked && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                    Approval Blocked
                  </p>
                </div>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  Approval requires no Red hits or documented overrides for remaining Red hits.
                </p>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-approve">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleApprove}
                disabled={signoffMutation.isPending || isApprovalBlocked}
                data-testid="button-confirm-approve"
              >
                {signoffMutation.isPending ? "Approving..." : "Approve Order"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reject Confirmation Dialog */}
        <AlertDialog open={rejectDialog} onOpenChange={setRejectDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Request Changes</AlertDialogTitle>
              <AlertDialogDescription>
                Please provide a reason for requesting changes to this order.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Label htmlFor="reject-reason">Reason for Changes *</Label>
              <Textarea
                id="reject-reason"
                placeholder="Explain what changes are needed..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="mt-2"
                data-testid="textarea-reject-reason"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-reject">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleReject}
                disabled={signoffMutation.isPending || rejectReason.trim().length === 0}
                data-testid="button-confirm-reject"
              >
                {signoffMutation.isPending ? "Sending..." : "Request Changes"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RoleGuard>
  );
}