import { Plus, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CompCard } from "./CompCard";
import { CompProperty, CompSelection } from "@shared/schema";
import { cn } from "@/lib/utils";

interface PrimaryCompTrayProps {
  primaryComps: (CompProperty | null)[];
  selection: CompSelection;
  className?: string;
  onLock?: (compId: string, locked: boolean) => void;
  onSwap?: (compId: string) => void;
  onViewOnMap?: (compId: string) => void;
}

interface EmptySlotProps {
  index: 0 | 1 | 2;
  onFillSlot?: (index: 0 | 1 | 2) => void;
}

function EmptySlot({ index, onFillSlot }: EmptySlotProps) {
  return (
    <Card 
      className="border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
      data-testid={`empty-slot-${index}`}
    >
      <CardContent className="flex flex-col items-center justify-center py-8">
        <Badge variant="outline" className="mb-3">
          #{index + 1}
        </Badge>
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center mb-2">
            <Plus className="h-6 w-6 text-gray-400" />
          </div>
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Empty Primary Slot
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-500">
            Promote a comparable to fill this position
          </div>
          {onFillSlot && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFillSlot(index)}
              className="mt-2"
              data-testid={`fill-slot-${index}`}
            >
              Select Comparable
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function PrimaryCompTray({
  primaryComps,
  selection,
  className,
  onLock,
  onSwap,
  onViewOnMap
}: PrimaryCompTrayProps) {
  const filledSlots = primaryComps.filter(comp => comp !== null).length;

  return (
    <div className={cn("space-y-4", className)} data-testid="primary-comp-tray">
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-blue-600" />
            Primary Comparables
            <Badge variant="secondary" className="ml-auto">
              {filledSlots}/3
            </Badge>
          </CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Your top 3 comparable properties for analysis. These will be featured prominently in reports.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {primaryComps.map((comp, index) => {
              const slotIndex = index as 0 | 1 | 2;
              
              if (!comp) {
                return (
                  <EmptySlot
                    key={`empty-${index}`}
                    index={slotIndex}
                  />
                );
              }

              return (
                <CompCard
                  key={comp.id}
                  comp={comp}
                  isPrimary={true}
                  primaryIndex={slotIndex}
                  showSwap={true}
                  onLock={onLock}
                  onSwap={onSwap}
                  onViewOnMap={onViewOnMap}
                  className="border-blue-300 dark:border-blue-700"
                />
              );
            })}
          </div>

          {filledSlots === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <div className="text-base font-medium mb-1">No Primary Comparables Selected</div>
              <div className="text-sm">
                Promote comparable properties from the candidate list below to establish your primary set.
              </div>
            </div>
          )}

          {filledSlots > 0 && filledSlots < 3 && (
            <div className="mt-4 p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Tip:</strong> You have {3 - filledSlots} empty slot{3 - filledSlots > 1 ? 's' : ''} remaining. 
                Consider promoting high-scoring candidates to strengthen your comparable set.
              </div>
            </div>
          )}

          {selection.locked.length > 0 && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/50 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <strong>{selection.locked.length}</strong> comparable{selection.locked.length > 1 ? 's' : ''} locked. 
                Locked comparables won't be replaced automatically during re-ranking.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}