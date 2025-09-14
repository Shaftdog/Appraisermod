import { useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CompProperty, CompSelection } from "@shared/schema";

interface SwapDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  candidateComp: CompProperty;
  primaryComps: (CompProperty | null)[];
  selection: CompSelection;
  onSwap: (targetIndex: 0 | 1 | 2, confirm?: boolean) => void;
}

export function SwapDialog({ 
  isOpen, 
  onOpenChange, 
  candidateComp, 
  primaryComps, 
  selection,
  onSwap 
}: SwapDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState<0 | 1 | 2 | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  
  const isTargetLocked = selectedIndex !== null && 
    primaryComps[selectedIndex] && 
    selection.locked.includes(primaryComps[selectedIndex]!.id);

  const requiredConfirmText = isTargetLocked ? "REPLACE LOCKED" : "";
  const canProceed = selectedIndex !== null && 
    (!isTargetLocked || confirmationText === requiredConfirmText);

  const handleSwap = () => {
    if (selectedIndex !== null && canProceed) {
      onSwap(selectedIndex, isTargetLocked || false);
      onOpenChange(false);
      setSelectedIndex(null);
      setConfirmationText("");
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setSelectedIndex(null);
    setConfirmationText("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="swap-dialog">
        <DialogHeader>
          <DialogTitle>Replace Primary Comparable</DialogTitle>
          <DialogDescription>
            Choose which primary comp to replace with{" "}
            <span className="font-medium">{candidateComp.address}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {primaryComps.map((primaryComp, index) => {
            const isLocked = primaryComp && selection.locked.includes(primaryComp.id);
            const isEmpty = !primaryComp;
            
            return (
              <div key={index} className="space-y-2">
                <button
                  onClick={() => setSelectedIndex(index as 0 | 1 | 2)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                    selectedIndex === index
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                      : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
                  }`}
                  data-testid={`swap-target-${index}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">#{index + 1} Primary</div>
                      {isEmpty ? (
                        <div className="text-sm text-gray-500">Empty slot</div>
                      ) : (
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {primaryComp.address}
                        </div>
                      )}
                    </div>
                    {isLocked && (
                      <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Lock className="h-4 w-4" />
                        <span className="text-xs">Locked</span>
                      </div>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {isTargetLocked && (
          <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-200">
              <div className="space-y-2">
                <p>You're about to replace a locked comparable. This action requires confirmation.</p>
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Type "{requiredConfirmText}" to confirm:
                  </label>
                  <input
                    type="text"
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-800 dark:border-gray-600"
                    placeholder={requiredConfirmText}
                    data-testid="confirmation-input"
                  />
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} data-testid="cancel-swap">
            Cancel
          </Button>
          <Button 
            onClick={handleSwap} 
            disabled={!canProceed}
            data-testid="confirm-swap"
          >
            {isTargetLocked ? "Force Replace" : "Replace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}