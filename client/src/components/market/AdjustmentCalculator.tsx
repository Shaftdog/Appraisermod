import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calculator, AlertCircle, TrendingUp, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Submarket, SubmarketTrend, MarketAdjustment, CompProperty } from '@shared/schema';

interface AdjustmentCalculatorProps {
  orderId: string;
  submarkets: Submarket[];
  trends: SubmarketTrend[];
  comps: CompProperty[];
  onAdjustmentComputed: () => void;
}

export function AdjustmentCalculator({ orderId, submarkets, trends, comps, onAdjustmentComputed }: AdjustmentCalculatorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedComp, setSelectedComp] = useState<string>('');
  const [selectedSubmarket, setSelectedSubmarket] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState<'linear-trend' | 'polynomial-trend' | 'median-comparison'>('linear-trend');
  
  // Get selected comp details
  const comp = comps.find(c => c.id === selectedComp);
  
  // Get trend for selected submarket
  const trend = trends.find(t => t.submarketId === selectedSubmarket);
  
  // Calculate preview
  const getPreviewCalculation = () => {
    if (!comp || !trend) return null;
    
    const saleDate = new Date(comp.saleDate);
    const effective = new Date(effectiveDate);
    const monthsDiff = (effective.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    
    let adjustmentPercent = 0;
    
    if (method === 'linear-trend') {
      adjustmentPercent = trend.trendAnalysis.monthlyChange * monthsDiff;
    } else if (method === 'polynomial-trend' && trend.trendAnalysis.coefficients.length === 3) {
      const [a, b, c] = trend.trendAnalysis.coefficients;
      
      // Calculate positions relative to trend analysis end date
      const trendEndDate = new Date(trend.analysisDate);
      const monthsSinceTrendEnd_sale = (trendEndDate.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      const monthsSinceTrendEnd_effective = (trendEndDate.getTime() - effective.getTime()) / (1000 * 60 * 60 * 24 * 30);
      
      // Regression uses months 1 to monthsBack
      const saleMonthIndex = trend.timeRange.monthsBack - monthsSinceTrendEnd_sale;
      const effectiveMonthIndex = trend.timeRange.monthsBack - monthsSinceTrendEnd_effective;
      
      const priceAtSale = a + b * saleMonthIndex + c * Math.pow(saleMonthIndex, 2);
      const priceAtEffective = a + b * effectiveMonthIndex + c * Math.pow(effectiveMonthIndex, 2);
      adjustmentPercent = ((priceAtEffective - priceAtSale) / priceAtSale) * 100;
    } else {
      adjustmentPercent = trend.trendAnalysis.monthlyChange * monthsDiff;
    }
    
    const adjustmentDollars = comp.salePrice * (adjustmentPercent / 100);
    
    return {
      monthsDiff: Math.round(monthsDiff * 10) / 10,
      adjustmentPercent: Math.round(adjustmentPercent * 100) / 100,
      adjustmentDollars: Math.round(adjustmentDollars),
      adjustedPrice: comp.salePrice + adjustmentDollars,
      confidence: trend.trendAnalysis.r2
    };
  };
  
  const preview = getPreviewCalculation();
  
  const computeMutation = useMutation({
    mutationFn: async () => {
      if (!comp || !trend) throw new Error('Comp and trend required');
      
      return apiRequest('POST', `/api/orders/${orderId}/market/adjustments/compute`, {
        orderId,
        submarketId: selectedSubmarket,
        effectiveDate,
        saleDate: comp.saleDate,
        adjustmentType: 'market-conditions' as const,
        baseValue: comp.salePrice,
        method,
        trendId: trend.id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/market/adjustments`] });
      toast({
        title: 'Adjustment Computed',
        description: 'Market condition adjustment has been calculated and saved.'
      });
      onAdjustmentComputed();
      // Reset form
      setSelectedComp('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to compute adjustment',
        variant: 'destructive'
      });
    }
  });
  
  const canCompute = selectedComp && selectedSubmarket && effectiveDate && trend;
  
  return (
    <Card data-testid="adjustment-calculator">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Market Condition Adjustment Calculator
        </CardTitle>
        <CardDescription>
          Calculate time-based market adjustments using trend analysis with transparent, defensible methodology
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="comp-select">Select Comparable Sale</Label>
            <Select value={selectedComp} onValueChange={setSelectedComp}>
              <SelectTrigger id="comp-select" data-testid="select-comp">
                <SelectValue placeholder="Choose comp..." />
              </SelectTrigger>
              <SelectContent>
                {comps.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.address} - ${c.salePrice.toLocaleString()} ({new Date(c.saleDate).toLocaleDateString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="submarket-select">Submarket (for trend)</Label>
            <Select value={selectedSubmarket} onValueChange={setSelectedSubmarket}>
              <SelectTrigger id="submarket-select" data-testid="select-adjustment-submarket">
                <SelectValue placeholder="Choose submarket..." />
              </SelectTrigger>
              <SelectContent>
                {submarkets.map(s => {
                  const hasTrend = trends.some(t => t.submarketId === s.id);
                  return (
                    <SelectItem key={s.id} value={s.id} disabled={!hasTrend}>
                      {s.name} {!hasTrend && '(no trend)'}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="effective-date">Effective Date (Appraisal Date)</Label>
            <Input
              id="effective-date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              data-testid="input-effective-date"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="method-select">Calculation Method</Label>
            <Select value={method} onValueChange={(v: any) => setMethod(v)}>
              <SelectTrigger id="method-select" data-testid="select-calculation-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="linear-trend">Linear Trend</SelectItem>
                <SelectItem value="polynomial-trend">Polynomial Trend</SelectItem>
                <SelectItem value="median-comparison">Median Comparison</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* Preview Calculation */}
        {preview && (
          <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <TrendingUp className="h-4 w-4 text-blue-600" />
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-semibold text-blue-900 dark:text-blue-100">Preview Calculation:</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-blue-600 dark:text-blue-400">Time Difference</div>
                    <div className="font-semibold text-blue-900 dark:text-blue-100">
                      {preview.monthsDiff.toFixed(1)} months
                    </div>
                  </div>
                  <div>
                    <div className="text-blue-600 dark:text-blue-400">Adjustment %</div>
                    <div className="font-semibold text-blue-900 dark:text-blue-100">
                      {preview.adjustmentPercent > 0 ? '+' : ''}{preview.adjustmentPercent.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-blue-600 dark:text-blue-400">Adjustment $</div>
                    <div className="font-semibold text-blue-900 dark:text-blue-100">
                      {preview.adjustmentDollars > 0 ? '+' : ''}${Math.abs(preview.adjustmentDollars).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-blue-600 dark:text-blue-400">Adjusted Price</div>
                    <div className="font-semibold text-blue-900 dark:text-blue-100">
                      ${preview.adjustedPrice.toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm text-blue-600 dark:text-blue-400">Model Confidence (R²):</span>
                  <Badge variant={preview.confidence > 0.7 ? 'default' : preview.confidence > 0.4 ? 'secondary' : 'outline'}>
                    {preview.confidence.toFixed(3)}
                  </Badge>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Warnings */}
        {trend && trend.trendAnalysis.r2 < 0.5 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Low confidence (R² = {trend.trendAnalysis.r2.toFixed(2)}). Consider using additional comps or median-comparison method.
            </AlertDescription>
          </Alert>
        )}
        
        {/* Compute Button */}
        <div className="flex justify-end">
          <Button
            onClick={() => computeMutation.mutate()}
            disabled={!canCompute || computeMutation.isPending}
            size="lg"
            data-testid="button-compute-adjustment"
          >
            {computeMutation.isPending ? (
              <>Computing...</>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Compute & Save Adjustment
              </>
            )}
          </Button>
        </div>
        
        {/* Methodology Note */}
        <div className="border-t pt-4 mt-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <div className="font-semibold mb-2">Methodology:</div>
            {method === 'linear-trend' && (
              <p>Linear trend method uses the monthly rate of change from regression analysis. Adjustment = Monthly Change × Months Difference.</p>
            )}
            {method === 'polynomial-trend' && (
              <p>Polynomial trend method uses quadratic regression to model non-linear market changes. Calculates price difference using y = a + bx + cx².</p>
            )}
            {method === 'median-comparison' && (
              <p>Median comparison uses a conservative linear approximation based on median price trends, suitable for markets with high variance.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
