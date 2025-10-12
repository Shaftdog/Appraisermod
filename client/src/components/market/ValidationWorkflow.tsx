import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, AlertTriangle, FileCheck } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { MarketAdjustment, AdjustmentValidation } from '@shared/schema';

interface ValidationWorkflowProps {
  orderId: string;
  adjustments: MarketAdjustment[];
  validations: AdjustmentValidation[];
}

export function ValidationWorkflow({ orderId, adjustments, validations }: ValidationWorkflowProps) {
  const [selectedAdjustments, setSelectedAdjustments] = useState<string[]>([]);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [reviewValidationId, setReviewValidationId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected' | 'needs-review'>('approved');
  const [reviewNotes, setReviewNotes] = useState('');
  const { toast } = useToast();

  // Filter out adjustments whose LATEST validation is approved
  // Adjustments with rejected or needs-review status can be re-validated
  const getLatestValidationStatus = (adjId: string): string | null => {
    const adjValidations = validations
      .filter(v => v.adjustmentIds.includes(adjId))
      .sort((a, b) => new Date(b.validationDate).getTime() - new Date(a.validationDate).getTime());
    
    return adjValidations.length > 0 ? adjValidations[0].status : null;
  };
  
  const pendingAdjustments = adjustments.filter(adj => {
    const latestStatus = getLatestValidationStatus(adj.id);
    // Show if no validation, or if latest is pending/rejected/needs-review
    return latestStatus !== 'approved';
  });

  const toggleAdjustment = (adjId: string) => {
    setSelectedAdjustments(prev =>
      prev.includes(adjId) ? prev.filter(id => id !== adjId) : [...prev, adjId]
    );
  };

  const runValidationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/market/validations`, {
        orderId,
        adjustmentIds: selectedAdjustments,
        approvalNotes: approvalNotes || undefined
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/market/validations`] });
      setSelectedAdjustments([]);
      setApprovalNotes('');
      toast({
        title: 'Validation Complete',
        description: 'Adjustment validation checks have been performed'
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Validation Failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const updateValidationMutation = useMutation({
    mutationFn: async () => {
      if (!reviewValidationId) throw new Error('No validation selected');
      const response = await apiRequest(
        'PUT',
        `/api/orders/${orderId}/market/validations/${reviewValidationId}`,
        {
          status: reviewStatus,
          notes: reviewNotes || undefined
        }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/market/validations`] });
      setReviewValidationId(null);
      setReviewNotes('');
      toast({
        title: 'Validation Updated',
        description: `Validation has been marked as ${reviewStatus}`
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'approved': return 'default';
      case 'rejected': return 'destructive';
      case 'needs-review': return 'secondary';
      case 'pending': return 'outline';
      default: return 'outline';
    }
  };

  const getCheckIcon = (passed: boolean) => {
    return passed ? (
      <CheckCircle2 className="h-4 w-4 text-green-600" />
    ) : (
      <XCircle className="h-4 w-4 text-red-600" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Run Validation Section */}
      {pendingAdjustments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              Run Validation Checks
            </CardTitle>
            <CardDescription>
              Select adjustments to validate against GSE guidelines and internal benchmarks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Validation checks include: GSE alignment verification, sample size adequacy,
                confidence threshold analysis, and trend significance testing
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="font-medium text-sm">Select Adjustments to Validate:</div>
              {pendingAdjustments.map((adj) => (
                <div
                  key={adj.id}
                  className="flex items-start gap-3 border rounded-lg p-3 hover:bg-gray-50 dark:hover:bg-gray-800"
                  data-testid={`adjustment-validation-${adj.id}`}
                >
                  <Checkbox
                    checked={selectedAdjustments.includes(adj.id)}
                    onCheckedChange={() => toggleAdjustment(adj.id)}
                    data-testid={`checkbox-adjustment-${adj.id}`}
                  />
                  <div className="flex-1">
                    <div className="font-medium">
                      {adj.adjustmentType === 'time' && 'Time Adjustment'}
                      {adj.adjustmentType === 'location' && 'Location Adjustment'}
                      {adj.adjustmentType === 'market-conditions' && 'Market Conditions Adjustment'}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {adj.calculation.method} • {adj.calculation.adjustmentPercent.toFixed(2)}% 
                      • ${adj.calculation.adjustmentDollars.toFixed(0)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Sale Date: {new Date(adj.saleDate).toLocaleDateString()} →
                      Effective Date: {new Date(adj.effectiveDate).toLocaleDateString()}
                      {adj.metadata.trendId && ` • Trend-based (n=${adj.metadata.sampleSize})`}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Review Notes (Optional)</label>
              <Textarea
                placeholder="Add any notes about these adjustments for the audit trail..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                rows={3}
                data-testid="textarea-approval-notes"
              />
            </div>

            <Button
              onClick={() => runValidationMutation.mutate()}
              disabled={selectedAdjustments.length === 0 || runValidationMutation.isPending}
              className="w-full"
              data-testid="button-run-validation"
            >
              {runValidationMutation.isPending ? 'Running Validation...' : 'Run Validation Checks'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Validation Results */}
      {validations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Validation Results</CardTitle>
            <CardDescription>Review and approve or reject validation outcomes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {validations.map((validation) => (
              <div
                key={validation.id}
                className="border rounded-lg p-4 space-y-3"
                data-testid={`validation-result-${validation.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={getStatusBadgeVariant(validation.status)}>
                      {validation.status}
                    </Badge>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {new Date(validation.validationDate).toLocaleDateString()} at{' '}
                      {new Date(validation.validationDate).toLocaleTimeString()}
                    </span>
                  </div>
                  {validation.status === 'pending' && !reviewValidationId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReviewValidationId(validation.id)}
                      data-testid={`button-review-${validation.id}`}
                    >
                      Review & Approve
                    </Button>
                  )}
                </div>

                <div className="text-sm space-y-2">
                  <div className="font-medium">Validation Checks:</div>
                  {validation.checks.map((check, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      {getCheckIcon(check.passed)}
                      <div className="flex-1">
                        <div className={check.passed ? '' : 'text-red-600 dark:text-red-400'}>
                          <span className="font-medium">{check.checkType}:</span> {check.details}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {validation.approvalNotes && (
                  <div className="text-sm bg-gray-50 dark:bg-gray-800 p-3 rounded">
                    <div className="font-medium mb-1">Review Notes:</div>
                    <div className="text-gray-700 dark:text-gray-300">{validation.approvalNotes}</div>
                  </div>
                )}

                {/* Review Form */}
                {reviewValidationId === validation.id && (
                  <div className="border-t pt-4 space-y-3">
                    <div className="font-medium">Appraiser Decision:</div>
                    <div className="flex gap-2">
                      <Button
                        variant={reviewStatus === 'approved' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setReviewStatus('approved')}
                        data-testid="button-status-approved"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        variant={reviewStatus === 'needs-review' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setReviewStatus('needs-review')}
                        data-testid="button-status-review"
                      >
                        <AlertTriangle className="h-4 w-4 mr-1" />
                        Needs Review
                      </Button>
                      <Button
                        variant={reviewStatus === 'rejected' ? 'destructive' : 'outline'}
                        size="sm"
                        onClick={() => setReviewStatus('rejected')}
                        data-testid="button-status-rejected"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                    <Textarea
                      placeholder="Add review notes (optional)..."
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      rows={2}
                      data-testid="textarea-review-notes"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => updateValidationMutation.mutate()}
                        disabled={updateValidationMutation.isPending}
                        data-testid="button-submit-review"
                      >
                        {updateValidationMutation.isPending ? 'Submitting...' : 'Submit Decision'}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setReviewValidationId(null);
                          setReviewNotes('');
                          setReviewStatus('approved');
                        }}
                        data-testid="button-cancel-review"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {pendingAdjustments.length === 0 && validations.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No adjustments available for validation. Create market adjustments first.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
