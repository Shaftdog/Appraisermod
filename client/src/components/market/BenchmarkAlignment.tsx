import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, AlertTriangle, CheckCircle2, Activity } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { MarketAdjustment, BenchmarkComparison, Submarket } from '@shared/schema';

interface BenchmarkAlignmentProps {
  orderId: string;
  adjustments: MarketAdjustment[];
  benchmarks: BenchmarkComparison[];
  submarkets: Submarket[];
}

export function BenchmarkAlignment({ orderId, adjustments, benchmarks, submarkets }: BenchmarkAlignmentProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedAdjustment, setSelectedAdjustment] = useState<string>('');
  const [selectedSources, setSelectedSources] = useState<string[]>(['gse-fannie', 'gse-freddie']);
  
  const availableSources = [
    { value: 'gse-fannie', label: 'Fannie Mae GSE' },
    { value: 'gse-freddie', label: 'Freddie Mac GSE' },
    { value: 'truetracts', label: 'TrueTracts Data' },
    { value: 'historical-internal', label: 'Historical Internal' }
  ];
  
  const createBenchmarkMutation = useMutation({
    mutationFn: async () => {
      const adjustment = adjustments.find(a => a.id === selectedAdjustment);
      if (!adjustment) throw new Error('Adjustment required');
      
      const response = await apiRequest('POST', `/api/orders/${orderId}/market/benchmarks`, {
        orderId,
        submarketId: adjustment.submarketId,
        adjustmentId: selectedAdjustment,
        benchmarkSources: selectedSources as any
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/market/benchmarks`] });
      toast({
        title: 'Benchmark Comparison Created',
        description: 'GSE alignment check has been completed.'
      });
      setSelectedAdjustment('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create benchmark',
        variant: 'destructive'
      });
    }
  });
  
  const toggleSource = (source: string) => {
    setSelectedSources(prev => 
      prev.includes(source)
        ? prev.filter(s => s !== source)
        : [...prev, source]
    );
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'within-range':
        return <Badge variant="default" className="bg-green-600">Within Range</Badge>;
      case 'review-recommended':
        return <Badge variant="secondary">Review Recommended</Badge>;
      case 'outside-tolerance':
        return <Badge variant="destructive">Outside Tolerance</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  const getAlertIcon = (level: string) => {
    switch (level) {
      case 'critical':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      default:
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    }
  };
  
  return (
    <div className="space-y-6" data-testid="benchmark-alignment">
      {/* Create Benchmark Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            GSE Alignment & Benchmark Comparison
          </CardTitle>
          <CardDescription>
            Compare your market condition adjustments against GSE benchmarks and industry data sources
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adjustment-select">Select Adjustment to Benchmark</Label>
            <Select value={selectedAdjustment} onValueChange={setSelectedAdjustment}>
              <SelectTrigger id="adjustment-select" data-testid="select-benchmark-adjustment">
                <SelectValue placeholder="Choose adjustment..." />
              </SelectTrigger>
              <SelectContent>
                {adjustments.map(adj => {
                  const submarket = submarkets.find(s => s.id === adj.submarketId);
                  return (
                    <SelectItem key={adj.id} value={adj.id}>
                      {submarket?.name || 'Unknown'} - {adj.calculation.adjustmentPercent.toFixed(2)}% ({new Date(adj.saleDate).toLocaleDateString()})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Benchmark Data Sources</Label>
            <div className="space-y-2">
              {availableSources.map(source => (
                <div key={source.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={source.value}
                    checked={selectedSources.includes(source.value)}
                    onCheckedChange={() => toggleSource(source.value)}
                    data-testid={`checkbox-${source.value}`}
                  />
                  <label
                    htmlFor={source.value}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {source.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
          
          <Button
            onClick={() => createBenchmarkMutation.mutate()}
            disabled={!selectedAdjustment || selectedSources.length === 0 || createBenchmarkMutation.isPending}
            className="w-full"
            data-testid="button-create-benchmark"
          >
            {createBenchmarkMutation.isPending ? 'Comparing...' : 'Run Benchmark Comparison'}
          </Button>
        </CardContent>
      </Card>
      
      {/* Benchmark Results */}
      {benchmarks.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Benchmark Comparison Results</h3>
          {benchmarks.map(benchmark => {
            const submarket = submarkets.find(s => s.id === benchmark.submarketId);
            
            return (
              <Card key={benchmark.id} data-testid={`benchmark-${benchmark.id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">{submarket?.name || 'Unknown Submarket'}</CardTitle>
                      <CardDescription>
                        Comparison Date: {new Date(benchmark.comparisonDate).toLocaleString()}
                      </CardDescription>
                    </div>
                    {getStatusBadge(benchmark.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Our Adjustment */}
                  <div className="border-l-4 border-blue-500 pl-4">
                    <div className="text-sm font-medium text-gray-600 dark:text-gray-400">Our Adjustment</div>
                    <div className="text-xl font-semibold">
                      {benchmark.ourAdjustment.value > 0 ? '+' : ''}{benchmark.ourAdjustment.value.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-500">Method: {benchmark.ourAdjustment.method}</div>
                  </div>
                  
                  {/* Benchmark Values */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {benchmark.benchmarks.map((bench, idx) => (
                      <div key={idx} className="border rounded-lg p-3 space-y-1">
                        <div className="text-sm font-medium">{bench.source.replace(/-/g, ' ').toUpperCase()}</div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-semibold">
                            {bench.value > 0 ? '+' : ''}{bench.value.toFixed(2)}%
                          </span>
                          <span className={`text-sm ${Math.abs(bench.variance) > 1 ? 'text-red-600' : 'text-green-600'}`}>
                            ({bench.variance > 0 ? '+' : ''}{bench.variance.toFixed(2)}% variance)
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          Acceptable Range: {bench.acceptableRange.min.toFixed(2)}% to {bench.acceptableRange.max.toFixed(2)}%
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Alerts */}
                  {benchmark.alerts && benchmark.alerts.length > 0 && (
                    <Alert variant={benchmark.alerts.some(a => a.level === 'critical') ? 'destructive' : 'default'}>
                      <div className="space-y-2">
                        {benchmark.alerts.map((alert, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            {getAlertIcon(alert.level)}
                            <div className="flex-1">
                              <AlertTitle className="text-sm font-medium">{alert.level.toUpperCase()}</AlertTitle>
                              <AlertDescription className="text-sm">
                                {alert.message} (Variance: {alert.variance > 0 ? '+' : ''}{alert.variance.toFixed(2)}%)
                              </AlertDescription>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      
      {benchmarks.length === 0 && adjustments.length > 0 && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No benchmark comparisons yet. Select an adjustment and run a comparison above.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
