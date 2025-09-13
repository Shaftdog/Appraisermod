import { useState } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  TrendingUp, 
  Calculator, 
  GitCompare, 
  Info, 
  Edit2, 
  Check, 
  X,
  AlertCircle 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type AttrAdjustment, ATTR_METADATA } from "@shared/adjustments";

interface AttrTableProps {
  attrs: AttrAdjustment[];
  onOverride: (attrKey: string, value: number) => void;
  onShowProvenance: (attrKey: string) => void;
  className?: string;
}

const engineIcons = {
  regression: TrendingUp,
  cost: Calculator,
  paired: GitCompare
};

const engineColors = {
  regression: "text-blue-600 dark:text-blue-400",
  cost: "text-green-600 dark:text-green-400", 
  paired: "text-purple-600 dark:text-purple-400"
};

export function AttrTable({ attrs, onOverride, onShowProvenance, className }: AttrTableProps) {
  const [editingAttr, setEditingAttr] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const startEditing = (attr: AttrAdjustment) => {
    setEditingAttr(attr.key);
    setEditValue(attr.chosen.value.toString());
  };

  const saveEdit = () => {
    if (editingAttr) {
      const numValue = parseFloat(editValue);
      if (!isNaN(numValue)) {
        onOverride(editingAttr, numValue);
      }
      setEditingAttr(null);
      setEditValue("");
    }
  };

  const cancelEdit = () => {
    setEditingAttr(null);
    setEditValue("");
  };

  const formatValue = (value: number | undefined, unit: string) => {
    if (value === undefined) return "—";
    
    if (unit === '%') {
      return `${(value * 100).toFixed(1)}%`;
    } else if (unit === '$') {
      return `$${value.toLocaleString()}`;
    } else if (unit === '$/sf') {
      return `$${value.toFixed(0)}/sf`;
    }
    return value.toLocaleString();
  };

  const getConfidenceColor = (r2?: number) => {
    if (!r2) return "text-gray-400";
    if (r2 >= 0.8) return "text-green-600 dark:text-green-400";
    if (r2 >= 0.6) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const getDirectionIcon = (direction: 'additive' | 'multiplicative') => {
    switch (direction) {
      case 'additive': return '↗';
      case 'multiplicative': return '↘';
      default: return '↔';
    }
  };

  return (
    <Card className={cn("w-full", className)} data-testid="card-attr-table">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center" data-testid="text-attr-table-title">
          Attribute Adjustments
          <Badge variant="secondary" className="ml-2" data-testid="badge-attr-count">
            {attrs.length} attributes
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32" data-testid="header-attribute">Attribute</TableHead>
                <TableHead className="w-24 text-center" data-testid="header-regression">
                  <div className="flex items-center justify-center space-x-1">
                    <TrendingUp className="h-4 w-4 text-blue-600" />
                    <span>Regression</span>
                  </div>
                </TableHead>
                <TableHead className="w-24 text-center" data-testid="header-cost">
                  <div className="flex items-center justify-center space-x-1">
                    <Calculator className="h-4 w-4 text-green-600" />
                    <span>Cost</span>
                  </div>
                </TableHead>
                <TableHead className="w-24 text-center" data-testid="header-paired">
                  <div className="flex items-center justify-center space-x-1">
                    <GitCompare className="h-4 w-4 text-purple-600" />
                    <span>Paired</span>
                  </div>
                </TableHead>
                <TableHead className="w-28 text-center" data-testid="header-chosen">Chosen Value</TableHead>
                <TableHead className="w-20 text-center" data-testid="header-actions">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attrs.map((attr) => {
                const metadata = ATTR_METADATA[attr.key];
                const isEditing = editingAttr === attr.key;
                
                return (
                  <TableRow key={attr.key} data-testid={`row-attr-${attr.key}`}>
                    {/* Attribute Name */}
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-2">
                        <span className="text-lg" data-testid={`icon-${attr.key}`}>
                          {getDirectionIcon(metadata.direction)}
                        </span>
                        <div>
                          <div className="font-medium" data-testid={`name-${attr.key}`}>
                            {metadata.label}
                          </div>
                          <div className="text-xs text-muted-foreground" data-testid={`unit-${attr.key}`}>
                            per {attr.unit}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    
                    {/* Regression Value */}
                    <TableCell className="text-center">
                      {attr.regression ? (
                        <div className="space-y-1">
                          <div className="font-medium" data-testid={`regression-value-${attr.key}`}>
                            {formatValue(attr.regression.value, attr.unit)}
                          </div>
                          {attr.regression.r2 && (
                            <div className={cn("text-xs", getConfidenceColor(attr.regression.r2))} data-testid={`regression-r2-${attr.key}`}>
                              R² {(attr.regression.r2 * 100).toFixed(0)}%
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400" data-testid={`regression-na-${attr.key}`}>N/A</span>
                      )}
                    </TableCell>
                    
                    {/* Cost Value */}
                    <TableCell className="text-center">
                      {attr.cost ? (
                        <div className="space-y-1">
                          <div className="font-medium" data-testid={`cost-value-${attr.key}`}>
                            {formatValue(attr.cost.value, attr.unit)}
                          </div>
                          {attr.cost.basisNote && (
                            <div className="text-xs text-muted-foreground" data-testid={`cost-basis-${attr.key}`}>
                              Baseline
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400" data-testid={`cost-na-${attr.key}`}>N/A</span>
                      )}
                    </TableCell>
                    
                    {/* Paired Value */}
                    <TableCell className="text-center">
                      {attr.paired ? (
                        <div className="space-y-1">
                          <div className="font-medium" data-testid={`paired-value-${attr.key}`}>
                            {formatValue(attr.paired.value, attr.unit)}
                          </div>
                          {attr.paired.nPairs && (
                            <div className="text-xs text-muted-foreground" data-testid={`paired-pairs-${attr.key}`}>
                              {attr.paired.nPairs} pairs
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400" data-testid={`paired-na-${attr.key}`}>N/A</span>
                      )}
                    </TableCell>
                    
                    {/* Chosen Value */}
                    <TableCell className="text-center">
                      {isEditing ? (
                        <div className="flex items-center space-x-1">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-20 h-8 text-center"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            autoFocus
                            data-testid={`input-edit-${attr.key}`}
                          />
                          <Button size="sm" variant="ghost" onClick={saveEdit} className="h-8 w-8 p-0" data-testid={`button-save-${attr.key}`}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-8 w-8 p-0" data-testid={`button-cancel-${attr.key}`}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="font-bold text-lg" data-testid={`chosen-value-${attr.key}`}>
                            {formatValue(attr.chosen.value, attr.unit)}
                          </div>
                          <div className="text-xs text-muted-foreground" data-testid={`chosen-source-${attr.key}`}>
                            {attr.chosen.source === 'blend' ? 'Blended' : attr.chosen.source}
                          </div>
                        </div>
                      )}
                    </TableCell>
                    
                    {/* Actions */}
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEditing(attr)}
                          className="h-8 w-8 p-0"
                          data-testid={`button-edit-${attr.key}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onShowProvenance(attr.key)}
                          className="h-8 w-8 p-0"
                          data-testid={`button-provenance-${attr.key}`}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        
        {attrs.length === 0 && (
          <div className="text-center py-8" data-testid="empty-attr-table">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No adjustments computed yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Click "Compute Adjustments" to analyze attributes.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}