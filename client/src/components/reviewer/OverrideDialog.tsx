import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";
import type { RuleHit } from "@/../../types/review";

interface OverrideDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  hit: RuleHit;
}

export function OverrideDialog({ isOpen, onClose, orderId, hit }: OverrideDialogProps) {
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const overrideMutation = useMutation({
    mutationFn: async (data: { ruleId: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/review/${orderId}/override`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Override Applied",
        description: `Rule ${hit.ruleId} has been overridden successfully.`,
      });
      
      // Invalidate both queue and review detail caches
      queryClient.invalidateQueries({ queryKey: ['/api/review/queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/review', orderId] });
      
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Override Failed",
        description: error.message || "Failed to apply override. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (reason.trim().length < 10) {
      toast({
        title: "Invalid Reason",
        description: "Override reason must be at least 10 characters long.",
        variant: "destructive",
      });
      return;
    }

    overrideMutation.mutate({
      ruleId: hit.ruleId,
      reason: reason.trim(),
    });
  };

  const handleClose = () => {
    setReason("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Override Policy Rule
          </DialogTitle>
          <DialogDescription>
            You are about to override the following policy violation. Please provide a detailed reason.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Rule Details */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">Rule ID</Label>
              <p className="font-medium">{hit.ruleId}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Message</Label>
              <p className="text-sm">{hit.message}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Path</Label>
              <p className="text-sm text-muted-foreground">{hit.path}</p>
            </div>
          </div>

          {/* Reason Input */}
          <div className="space-y-2">
            <Label htmlFor="override-reason">Override Reason *</Label>
            <Textarea
              id="override-reason"
              placeholder="Explain why this policy violation should be overridden..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[100px]"
              data-testid="textarea-override-reason"
            />
            <p className="text-xs text-muted-foreground">
              Minimum 10 characters ({reason.length}/10)
            </p>
          </div>

          {/* Warning Notice */}
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/50 rounded-md">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Important:</strong> Overriding policy rules requires careful consideration. 
              This action will be logged and may require additional approval.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={handleClose}
            disabled={overrideMutation.isPending}
            data-testid="button-cancel-override"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={overrideMutation.isPending || reason.trim().length < 10}
            data-testid="button-confirm-override"
          >
            {overrideMutation.isPending ? "Applying Override..." : "Apply Override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}