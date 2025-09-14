import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RiskChip } from "./RiskChip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  AlertTriangle, 
  CheckCircle2, 
  MessageSquare, 
  Send, 
  Eye,
  Clock
} from "lucide-react";
import { ReviewItem, RuleHit } from "../../../../types/review";

interface ReviewerFeedbackBannerProps {
  orderId: string;
}

export function ReviewerFeedbackBanner({ orderId }: ReviewerFeedbackBannerProps) {
  const { toast } = useToast();
  const [revisionMessage, setRevisionMessage] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  const { data: reviewItem, isLoading } = useQuery<ReviewItem>({
    queryKey: ['/api/review', orderId],
    enabled: !!orderId
  });

  // Mutation for submitting revisions
  const revisionMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", `/api/review/${orderId}/signoff`, {
        message: message.trim()
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Revisions Submitted",
        description: "Your revisions have been sent to the reviewer for re-evaluation.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/review', orderId] });
      setRevisionMessage("");
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit revisions. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmitRevisions = () => {
    if (revisionMessage.trim().length < 10) {
      toast({
        title: "Message Too Short",
        description: "Please provide a detailed description of the changes made (minimum 10 characters).",
        variant: "destructive",
      });
      return;
    }
    revisionMutation.mutate(revisionMessage);
  };

  // Show loading state to prevent flicker
  if (isLoading) {
    return (
      <Card className="mb-6 border-l-4 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-3 text-lg">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            Loading review status...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  // Don't show banner if no review data exists
  if (!reviewItem) return null;

  const criticalHits = reviewItem.hits.filter((hit: RuleHit) => hit.risk === 'red');
  const warningHits = reviewItem.hits.filter((hit: RuleHit) => hit.risk === 'yellow');

  const getBannerStyle = () => {
    if (reviewItem.status === 'approved') {
      return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20';
    }
    if (reviewItem.status === 'changes_requested') {
      return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20';
    }
    if (criticalHits.length > 0) {
      return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20';
    }
    if (warningHits.length > 0) {
      return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20';
    }
    return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20';
  };

  const getStatusIcon = () => {
    if (reviewItem.status === 'changes_requested') {
      return <AlertTriangle className="h-5 w-5 text-red-600" />;
    }
    if (reviewItem.status === 'approved') {
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    }
    return <Clock className="h-5 w-5 text-blue-600" />;
  };

  const getStatusMessage = () => {
    if (reviewItem.status === 'changes_requested') {
      return 'Changes Requested by Reviewer';
    }
    if (reviewItem.status === 'approved') {
      return 'Approved by Reviewer';
    }
    return 'Under Review';
  };

  return (
    <Card className={`mb-6 border-l-4 ${getBannerStyle()}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-lg">
          {getStatusIcon()}
          {getStatusMessage()}
          {reviewItem.overallRisk && <RiskChip risk={reviewItem.overallRisk} />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {reviewItem.status === 'approved' && reviewItem.hits.length === 0 && (
          <div className="text-sm text-green-700 dark:text-green-400">
            This order has been approved with no policy violations found.
          </div>
        )}
        
        {reviewItem.status === 'changes_requested' && (
          <div className="text-sm text-red-700 dark:text-red-400">
            This order has been returned for revisions. Please address the policy violations below and resubmit.
          </div>
        )}
        
        {(reviewItem.status === 'open' || reviewItem.status === 'in_review') && reviewItem.hits.length === 0 && (
          <div className="text-sm text-blue-700 dark:text-blue-400">
            This order is currently under review. No policy violations have been identified yet.
          </div>
        )}

        {/* Policy Hits Summary - Only show if there are hits or comments */}
        {(reviewItem.hits.length > 0 || reviewItem.comments.length > 0) && (
          <div className="flex flex-wrap gap-2">
          {criticalHits.length > 0 && (
            <Badge variant="destructive" className="text-xs">
              {criticalHits.length} Critical Issue{criticalHits.length !== 1 ? 's' : ''}
            </Badge>
          )}
          {warningHits.length > 0 && (
            <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
              {warningHits.length} Warning{warningHits.length !== 1 ? 's' : ''}
            </Badge>
          )}
          {reviewItem.comments.length > 0 && (
            <Badge variant="outline" className="text-xs">
              <MessageSquare className="h-3 w-3 mr-1" />
              {reviewItem.comments.length} Comment{reviewItem.comments.length !== 1 ? 's' : ''}
            </Badge>
          )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          {/* Only show feedback details button if there are hits to view */}
          {reviewItem.hits.length > 0 && (
            <Dialog open={showDetails} onOpenChange={setShowDetails}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-view-feedback">
                  <Eye className="h-4 w-4 mr-2" />
                  View Feedback Details
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Reviewer Feedback Details</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {reviewItem.hits.map((hit: RuleHit, index: number) => (
                  <Card key={index} className="border-l-4" style={{
                    borderLeftColor: hit.risk === 'red' ? '#ef4444' : hit.risk === 'yellow' ? '#f59e0b' : '#10b981'
                  }}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <RiskChip risk={hit.risk} />
                        <Badge variant="outline">{hit.scope}</Badge>
                      </div>
                      <h4 className="font-semibold">{hit.ruleId}</h4>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm mb-2">{hit.message}</p>
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
              </DialogContent>
            </Dialog>
          )}

          {reviewItem.status === 'changes_requested' && (
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-submit-revisions">
                  <Send className="h-4 w-4 mr-2" />
                  Submit Revisions
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Submit Revisions</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Describe the changes you've made:
                    </label>
                    <Textarea
                      placeholder="Please provide a detailed description of the revisions made to address the reviewer's concerns..."
                      value={revisionMessage}
                      onChange={(e) => setRevisionMessage(e.target.value)}
                      className="min-h-[100px]"
                      data-testid="textarea-revision-message"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Minimum 10 characters required
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <DialogTrigger asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogTrigger>
                    <Button 
                      onClick={handleSubmitRevisions}
                      disabled={revisionMutation.isPending || revisionMessage.trim().length < 10}
                      data-testid="button-confirm-submit-revisions"
                    >
                      {revisionMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Submit Revisions
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}