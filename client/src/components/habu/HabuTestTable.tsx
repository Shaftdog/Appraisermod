import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { UseEvaluation } from '@shared/habu';

interface HabuTestTableProps {
  rankedUses: UseEvaluation[];
  weights: { physical: number; legal: number; financial: number; productive: number };
}

const USE_CATEGORY_LABELS: Record<string, string> = {
  singleFamily: 'Single Family Residential',
  multiFamily: 'Multi-Family Residential',
  townhome: 'Townhome',
  condo: 'Condominium',
  office: 'Office',
  retail: 'Retail',
  industrial: 'Industrial',
  mixedUse: 'Mixed Use',
  ag: 'Agricultural',
  specialPurpose: 'Special Purpose',
  vacantResidential: 'Vacant Residential',
  vacantCommercial: 'Vacant Commercial'
};

const FLAG_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  zoningConflict: { label: 'Zoning Conflict', color: 'destructive', icon: XCircle },
  utilityConstraint: { label: 'Utility Issue', color: 'destructive', icon: AlertTriangle },
  siteConstraint: { label: 'Site Constraint', color: 'secondary', icon: AlertTriangle },
  marketWeak: { label: 'Weak Market', color: 'secondary', icon: AlertTriangle },
  costUnfavorable: { label: 'Cost Issue', color: 'secondary', icon: AlertTriangle }
};

const TEST_LABELS = {
  'Physically Possible': 'Physical',
  'Legally Permissible': 'Legal',
  'Financially Feasible': 'Financial',
  'Maximally Productive': 'Productive'
};

export function HabuTestTable({ rankedUses, weights }: HabuTestTableProps) {
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    if (score >= 0.4) return 'text-orange-600';
    return 'text-red-600';
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-500';
    if (score >= 0.6) return 'bg-yellow-500';
    if (score >= 0.4) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-4" data-testid="habu-test-table">
      {/* Weights Summary */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium mb-3">Test Weights</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{(weights.physical * 100).toFixed(0)}%</div>
            <div className="text-sm text-muted-foreground">Physical</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{(weights.legal * 100).toFixed(0)}%</div>
            <div className="text-sm text-muted-foreground">Legal</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{(weights.financial * 100).toFixed(0)}%</div>
            <div className="text-sm text-muted-foreground">Financial</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">{(weights.productive * 100).toFixed(0)}%</div>
            <div className="text-sm text-muted-foreground">Productive</div>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Use Category</TableHead>
              <TableHead className="text-center">Physical</TableHead>
              <TableHead className="text-center">Legal</TableHead>
              <TableHead className="text-center">Financial</TableHead>
              <TableHead className="text-center">Productive</TableHead>
              <TableHead className="text-center">Composite</TableHead>
              <TableHead className="w-[150px]">Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rankedUses.map((evaluation, index) => (
              <TableRow 
                key={evaluation.use} 
                className={index === 0 ? 'bg-green-50 dark:bg-green-950/20' : undefined}
                data-testid={`use-row-${evaluation.use}`}
              >
                <TableCell>
                  <div className="space-y-1">
                    <div className="font-medium">
                      {USE_CATEGORY_LABELS[evaluation.use] || evaluation.use}
                    </div>
                    {index === 0 && (
                      <Badge variant="default" className="text-xs">
                        Highest Ranked
                      </Badge>
                    )}
                  </div>
                </TableCell>
                
                {evaluation.tests.map((test) => (
                  <TableCell key={test.label} className="text-center">
                    <div className="space-y-1">
                      <div className={`font-medium ${getScoreColor(test.score)}`}>
                        {(test.score * 100).toFixed(0)}%
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${getScoreBarColor(test.score)}`}
                          style={{ width: `${test.score * 100}%` }}
                        />
                      </div>
                    </div>
                  </TableCell>
                ))}
                
                <TableCell className="text-center">
                  <div className="space-y-1">
                    <div className={`text-lg font-bold ${getScoreColor(evaluation.composite)}`}>
                      {(evaluation.composite * 100).toFixed(0)}%
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${getScoreBarColor(evaluation.composite)}`}
                        style={{ width: `${evaluation.composite * 100}%` }}
                      />
                    </div>
                  </div>
                </TableCell>
                
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {evaluation.flags.length === 0 ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-3 h-3" />
                        <span className="text-xs">Clear</span>
                      </div>
                    ) : (
                      evaluation.flags.map((flag) => {
                        const flagInfo = FLAG_LABELS[flag];
                        if (!flagInfo) return null;
                        const Icon = flagInfo.icon;
                        return (
                          <Badge
                            key={flag}
                            variant={flagInfo.color as any}
                            className="text-xs flex items-center gap-1"
                          >
                            <Icon className="w-3 h-3" />
                            {flagInfo.label}
                          </Badge>
                        );
                      })
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Detailed Test Results */}
      <div className="space-y-4">
        <h4 className="font-medium">Detailed Test Rationale</h4>
        <div className="grid gap-4">
          {rankedUses.slice(0, 3).map((evaluation) => (
            <div
              key={evaluation.use}
              className="border rounded-lg p-4 space-y-3"
              data-testid={`rationale-${evaluation.use}`}
            >
              <div className="flex items-center justify-between">
                <h5 className="font-medium">
                  {USE_CATEGORY_LABELS[evaluation.use] || evaluation.use}
                </h5>
                <Badge variant="outline">
                  Rank #{rankedUses.indexOf(evaluation) + 1}
                </Badge>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                {evaluation.tests.map((test) => (
                  <div key={test.label} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {TEST_LABELS[test.label] || test.label}
                      </span>
                      <span className={`text-sm font-medium ${getScoreColor(test.score)}`}>
                        {(test.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {test.rationale}
                    </p>
                    {test.evidence.length > 0 && (
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {test.evidence.map((evidence, idx) => (
                          <li key={idx} className="flex items-start gap-1">
                            <span className="text-primary">•</span>
                            <span>{evidence}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-medium mb-3">Analysis Summary</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Total Uses Analyzed: </span>
            <span className="font-medium">{rankedUses.length}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Legally Permissible: </span>
            <span className="font-medium">
              {rankedUses.filter(e => e.tests.find(t => t.label === 'Legally Permissible')?.score === 1).length}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">High Feasibility (≥80%): </span>
            <span className="font-medium">
              {rankedUses.filter(e => e.composite >= 0.8).length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}