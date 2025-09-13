import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  TrendingUp, 
  Calculator, 
  GitCompare, 
  FileBarChart,
  Building2,
  Users,
  Clock,
  MapPin
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type AttrAdjustment, ATTR_METADATA } from "@shared/adjustments";

interface ProvenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  attr: AttrAdjustment | null;
}

const engineConfig = {
  regression: {
    icon: TrendingUp,
    label: "Regression Analysis",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950",
    borderColor: "border-blue-200 dark:border-blue-800"
  },
  cost: {
    icon: Calculator,
    label: "Depreciated Cost Method",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950",
    borderColor: "border-green-200 dark:border-green-800"
  },
  paired: {
    icon: GitCompare,
    label: "Paired Sales Analysis",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950",
    borderColor: "border-purple-200 dark:border-purple-800"
  }
};

export function ProvenanceModal({ isOpen, onClose, attr }: ProvenanceModalProps) {
  if (!attr) return null;

  const metadata = ATTR_METADATA[attr.key];
  
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

  const getRangeText = (lo: number, hi: number, unit: string) => {
    return `${formatValue(lo, unit)} - ${formatValue(hi, unit)}`;
  };

  const getConfidenceLevel = (r2?: number) => {
    if (!r2) return { level: "Unknown", color: "text-gray-400" };
    if (r2 >= 0.8) return { level: "High", color: "text-green-600 dark:text-green-400" };
    if (r2 >= 0.6) return { level: "Moderate", color: "text-yellow-600 dark:text-yellow-400" };
    return { level: "Low", color: "text-red-600 dark:text-red-400" };
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="modal-provenance">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2" data-testid="text-provenance-title">
            <FileBarChart className="h-5 w-5" />
            <span>Adjustment Provenance: {metadata.label}</span>
          </DialogTitle>
          <DialogDescription data-testid="text-provenance-desc">
            Detailed sources and methodology for the {metadata.label.toLowerCase()} adjustment calculation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Summary Card */}
          <Card className="border-2 border-dashed" data-testid="card-summary">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Chosen Value Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Final Adjustment:</span>
                <span className="text-2xl font-bold" data-testid="text-final-value">
                  {formatValue(attr.chosen.value, attr.unit)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Source:</span>
                <Badge variant={attr.chosen.source === 'blend' ? 'default' : 'secondary'} data-testid="badge-source">
                  {attr.chosen.source === 'blend' ? 'Weighted Blend' : 'Manual Override'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Unit:</span>
                <span className="text-sm font-medium" data-testid="text-unit">{attr.unit}</span>
              </div>
            </CardContent>
          </Card>

          {/* Engine Details */}
          <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
            {/* Regression Analysis */}
            {attr.regression && (
              <Card className={cn("border", engineConfig.regression.borderColor, engineConfig.regression.bgColor)} data-testid="card-regression">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center space-x-2 text-base">
                    <TrendingUp className={cn("h-4 w-4", engineConfig.regression.color)} />
                    <span>Regression Analysis</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Suggested Value:</span>
                      <span className="font-semibold" data-testid="text-regression-value">
                        {formatValue(attr.regression.value, attr.unit)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Range:</span>
                      <span className="text-sm" data-testid="text-regression-range">
                        {getRangeText(attr.regression.lo, attr.regression.hi, attr.unit)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Sample Size:</span>
                      <span className="text-sm font-medium" data-testid="text-regression-n">
                        {attr.regression.n} comps
                      </span>
                    </div>
                    {attr.regression.r2 && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">R-squared:</span>
                        <span className={cn("text-sm font-medium", getConfidenceLevel(attr.regression.r2).color)} data-testid="text-regression-r2">
                          {(attr.regression.r2 * 100).toFixed(1)}% ({getConfidenceLevel(attr.regression.r2).level})
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Methodology</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Ordinary Least Squares (OLS) regression analysis using comparable sales data. 
                      Coefficient represents the marginal price impact per unit of this attribute.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Cost Method */}
            {attr.cost && (
              <Card className={cn("border", engineConfig.cost.borderColor, engineConfig.cost.bgColor)} data-testid="card-cost">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center space-x-2 text-base">
                    <Calculator className={cn("h-4 w-4", engineConfig.cost.color)} />
                    <span>Cost Method</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Suggested Value:</span>
                      <span className="font-semibold" data-testid="text-cost-value">
                        {formatValue(attr.cost.value, attr.unit)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Range:</span>
                      <span className="text-sm" data-testid="text-cost-range">
                        {getRangeText(attr.cost.lo, attr.cost.hi, attr.unit)}
                      </span>
                    </div>
                    {attr.cost.basisNote && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Basis:</span>
                        <span className="text-sm font-medium" data-testid="text-cost-basis">
                          Baseline Data
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Methodology</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Depreciated replacement cost approach using local construction baselines. 
                      Accounts for physical depreciation and functional obsolescence.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Paired Sales */}
            {attr.paired && (
              <Card className={cn("border", engineConfig.paired.borderColor, engineConfig.paired.bgColor)} data-testid="card-paired">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center space-x-2 text-base">
                    <GitCompare className={cn("h-4 w-4", engineConfig.paired.color)} />
                    <span>Paired Sales</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Suggested Value:</span>
                      <span className="font-semibold" data-testid="text-paired-value">
                        {formatValue(attr.paired.value, attr.unit)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Range:</span>
                      <span className="text-sm" data-testid="text-paired-range">
                        {getRangeText(attr.paired.lo, attr.paired.hi, attr.unit)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Pairs Found:</span>
                      <span className="text-sm font-medium" data-testid="text-paired-pairs">
                        {attr.paired.nPairs} pairs
                      </span>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Methodology</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Direct comparison of similar property pairs differing primarily in this attribute. 
                      Median value adjustment derived from market evidence.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Provenance Details */}
          {attr.provenance && attr.provenance.length > 0 && (
            <Card data-testid="card-provenance-details">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2 text-base">
                  <Clock className="h-4 w-4" />
                  <span>Audit Trail</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {attr.provenance.map((prov, index) => {
                    const config = engineConfig[prov.engine];
                    const Icon = config.icon;
                    
                    return (
                      <div key={index} className="flex items-center space-x-3 p-3 rounded-lg bg-muted/50" data-testid={`provenance-${prov.engine}`}>
                        <Icon className={cn("h-4 w-4", config.color)} />
                        <div className="flex-1">
                          <div className="font-medium text-sm">{config.label}</div>
                          <div className="text-xs text-muted-foreground font-mono" data-testid={`ref-${prov.engine}`}>
                            {prov.ref}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs" data-testid={`badge-${prov.engine}`}>
                          {prov.engine}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Technical Notes */}
          <Card className="border-dashed" data-testid="card-technical-notes">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center space-x-2 text-base">
                <MapPin className="h-4 w-4" />
                <span>Technical Notes</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  • Adjustment direction: <strong>{attr.direction}</strong> ({attr.direction === 'additive' ? 'dollar amount' : 'percentage'})
                </p>
                <p>
                  • Value precision: Rounded to appropriate significant figures based on unit and magnitude
                </p>
                <p>
                  • Engine blending: Weighted average based on user-defined engine preferences
                </p>
                {attr.locked && (
                  <p className="text-orange-600 dark:text-orange-400">
                    • This adjustment is <strong>locked</strong> and will not be updated on recomputation
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}