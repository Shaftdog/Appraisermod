import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Signoff, RiskStatus } from '@/types';
import { ConfirmDialog } from './ConfirmDialog';
import { cn } from '@/lib/utils';

interface SignoffPanelProps {
  signoff: Signoff;
  status: RiskStatus;
  openIssues: number;
  onSignoff: (overrideReason?: string) => Promise<void>;
  className?: string;
}

export function SignoffPanel({ signoff, status, openIssues, onSignoff, className }: SignoffPanelProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSignoffClick = () => {
    setShowConfirm(true);
  };

  const handleConfirmSignoff = async (overrideReason?: string) => {
    await onSignoff(overrideReason);
    setShowConfirm(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={cn("bg-card border border-border rounded-lg p-6", className)}>
      <h3 className="font-medium text-foreground mb-4">Sign-off Status</h3>
      
      <div className="space-y-3">
        {signoff.state === 'signed-appraiser' ? (
          <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
            <div>
              <p className="text-sm font-medium text-green-800" data-testid="text-signed-status">
                Signed by Appraiser
              </p>
              <p className="text-xs text-green-600" data-testid="text-signed-details">
                {signoff.signedBy} • {signoff.signedAt ? formatDate(signoff.signedAt) : ''}
              </p>
              {signoff.overrideReason && (
                <p className="text-xs text-green-600 mt-1">
                  <button 
                    className="underline hover:no-underline"
                    data-testid="button-view-overrides"
                  >
                    View override reason
                  </button>
                </p>
              )}
            </div>
            <Check className="w-5 h-5 text-green-600" />
          </div>
        ) : (
          <Button 
            onClick={handleSignoffClick}
            className={cn(
              "w-full",
              status === 'red' && "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            )}
            data-testid="button-sign-section"
          >
            {status === 'red' ? 'Sign with Override Required' : 'Sign this Section'}
          </Button>
        )}

        {signoff.state === 'signed-appraiser' && (
          <button 
            className="w-full p-3 border-2 border-dashed border-border text-muted-foreground rounded-lg hover:border-primary hover:text-primary transition-colors"
            data-testid="button-awaiting-reviewer"
          >
            Awaiting Reviewer Sign-off
          </button>
        )}
      </div>

      {showConfirm && (
        <ConfirmDialog
          status={status}
          openIssues={openIssues}
          onConfirm={handleConfirmSignoff}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
