import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RiskStatus } from '@/types';

interface ConfirmDialogProps {
  status: RiskStatus;
  openIssues: number;
  onConfirm: (overrideReason?: string) => void;
  onCancel: () => void;
}

export function ConfirmDialog({ status, openIssues, onConfirm, onCancel }: ConfirmDialogProps) {
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState('');

  const hasRedIssues = status === 'red';
  const requiresOverride = hasRedIssues && openIssues > 0;

  const handleConfirm = () => {
    if (requiresOverride && !overrideReason.trim()) {
      setError('Override reason is required for critical issues.');
      return;
    }

    onConfirm(overrideReason.trim() || undefined);
  };

  const getIssuesSummary = () => {
    if (status === 'red') {
      return {
        title: 'Critical Issues Found',
        items: ['Insufficient comparable sales data'],
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        textColor: 'text-red-800',
        listColor: 'text-red-700'
      };
    }
    if (status === 'yellow') {
      return {
        title: 'Warnings Found',
        items: ['Limited comparable sales in past 6 months', 'Market volatility detected'],
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200', 
        textColor: 'text-yellow-800',
        listColor: 'text-yellow-700'
      };
    }
    return null;
  };

  const issuesSummary = getIssuesSummary();

  return (
    <Dialog open={true} onOpenChange={() => onCancel()}>
      <DialogContent className="w-full max-w-md" data-testid="dialog-confirm-signoff">
        <DialogHeader>
          <DialogTitle>Confirm Section Sign-off</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Issue Summary */}
          {issuesSummary && (
            <div className={`${issuesSummary.bgColor} border ${issuesSummary.borderColor} rounded-lg p-3`}>
              <h4 className={`font-medium ${issuesSummary.textColor} mb-2`}>
                {issuesSummary.title}
              </h4>
              <ul className={`text-sm ${issuesSummary.listColor} space-y-1`}>
                {issuesSummary.items.map((item, index) => (
                  <li key={index}>• {item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Override Reason (Required for Red Status) */}
          {requiresOverride && (
            <div className="space-y-2">
              <Label htmlFor="override-reason" className="text-sm font-medium">
                Reason for proceeding <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="override-reason"
                value={overrideReason}
                onChange={(e) => {
                  setOverrideReason(e.target.value);
                  setError('');
                }}
                placeholder="Please provide justification for proceeding with critical issues..."
                rows={3}
                className="resize-none"
                data-testid="textarea-override-reason"
              />
              {error && (
                <p className="text-sm text-red-600" data-testid="text-error-message">
                  {error}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button 
              variant="outline" 
              onClick={onCancel}
              className="flex-1"
              data-testid="button-cancel-signoff"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm}
              className="flex-1"
              data-testid="button-confirm-signoff"
            >
              Confirm Sign-off
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
