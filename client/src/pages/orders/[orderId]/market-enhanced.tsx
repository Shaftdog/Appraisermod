import { useEffect, useState } from 'react';
import { useParams } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { EnhancedMarketMap } from '@/components/map/EnhancedMarketMap';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, Calculator, CheckCircle2 } from 'lucide-react';
import type { Subject, CompProperty, Submarket, SubmarketTrend, MarketAdjustment, BenchmarkComparison, AdjustmentValidation, LatLng, MarketPolygon } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';

export default function EnhancedMarketAnalysisPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('map');

  // Fetch subject and comps data
  const { data: subject } = useQuery<Subject>({
    queryKey: [`/api/orders/${orderId}/subject`],
    enabled: !!orderId
  });

  const { data: compsData } = useQuery<{ comps: CompProperty[] }>({
    queryKey: [`/api/orders/${orderId}/comps`],
    enabled: !!orderId
  });

  // Fetch submarkets
  const { data: submarkets = [], isLoading: submarkets Loading } = useQuery<Submarket[]>({
    queryKey: [`/api/orders/${orderId}/market/submarkets`],
    enabled: !!orderId
  });

  // Fetch trends
  const { data: trends = [] } = useQuery<SubmarketTrend[]>({
    queryKey: [`/api/orders/${orderId}/market/trends`],
    enabled: !!orderId
  });

  // Fetch adjustments
  const { data: adjustments = [] } = useQuery<MarketAdjustment[]>({
    queryKey: [`/api/orders/${orderId}/market/adjustments`],
    enabled: !!orderId
  });

  // Fetch benchmarks
  const { data: benchmarks = [] } = useQuery<BenchmarkComparison[]>({
    queryKey: [`/api/orders/${orderId}/market/benchmarks`],
    enabled: !!orderId
  });

  // Fetch validations
  const { data: validations = [] } = useQuery<AdjustmentValidation[]>({
    queryKey: [`/api/orders/${orderId}/market/validations`],
    enabled: !!orderId
  });

  // Create submarket mutation
  const createSubmarketMutation = useMutation({
    mutationFn: async (data: { name: string; polygon: LatLng[] }) => {
      // Convert LatLng[] to MarketPolygon GeoJSON format
      const marketPolygon: MarketPolygon = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[...data.polygon.map(p => [p.lng, p.lat]), [data.polygon[0].lng, data.polygon[0].lat]]]
        },
        properties: {}
      };

      return apiRequest(`/api/orders/${orderId}/market/submarkets`, {
        method: 'POST',
        body: JSON.stringify({
          orderId,
          name: data.name,
          polygon: marketPolygon
        })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/market/submarkets`] });
      toast({
        title: 'Submarket Created',
        description: 'The submarket boundary has been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create submarket',
        variant: 'destructive'
      });
    }
  });

  // Delete submarket mutation
  const deleteSubmarketMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/orders/${orderId}/market/submarkets/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/market/submarkets`] });
      toast({
        title: 'Submarket Deleted',
        description: 'The submarket has been removed.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete submarket',
        variant: 'destructive'
      });
    }
  });

  // Compute trend mutation
  const computeTrendMutation = useMutation({
    mutationFn: async (submarketId: string) => {
      return apiRequest(`/api/orders/${orderId}/market/trends/compute`, {
        method: 'POST',
        body: JSON.stringify({
          submarketId,
          timeRange: { monthsBack: 12, startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString() },
          method: 'linear'
        })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/market/trends`] });
      toast({
        title: 'Trend Computed',
        description: 'Market trend analysis has been completed.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to compute trend',
        variant: 'destructive'
      });
    }
  });

  // Auto-tag comps to submarkets mutation
  const autoTagMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/orders/${orderId}/market/submarkets/auto-tag`, {
        method: 'POST'
      });
    },
    onSuccess: (data: { tagged: number; untagged: number }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${orderId}/comps`] });
      toast({
        title: 'Comps Auto-Tagged',
        description: `Successfully tagged ${data.tagged} comps to submarkets. ${data.untagged} comps remain untagged.`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to auto-tag comps',
        variant: 'destructive'
      });
    }
  });

  if (!subject || !compsData) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="enhanced-market-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Enhanced Market Analysis</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Define submarkets, analyze trends, and create defensible adjustments with GSE benchmarking
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="map" data-testid="tab-map">
            Submarkets Map
          </TabsTrigger>
          <TabsTrigger value="trends" data-testid="tab-trends">
            <TrendingUp className="h-4 w-4 mr-1" />
            Trends ({trends.length})
          </TabsTrigger>
          <TabsTrigger value="adjustments" data-testid="tab-adjustments">
            <Calculator className="h-4 w-4 mr-1" />
            Adjustments ({adjustments.length})
          </TabsTrigger>
          <TabsTrigger value="validation" data-testid="tab-validation">
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Validation ({validations.length})
          </TabsTrigger>
        </TabsList>

        {/* Map Tab */}
        <TabsContent value="map" className="space-y-4">
          {submarkets.length > 0 && (
            <div className="flex justify-end">
              <Button
                onClick={() => autoTagMutation.mutate()}
                disabled={autoTagMutation.isPending}
                data-testid="button-auto-tag-comps"
              >
                {autoTagMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Auto-Tag Comps to Submarkets
              </Button>
            </div>
          )}
          <EnhancedMarketMap
            subject={subject}
            comps={compsData.comps}
            submarkets={submarkets}
            onCreateSubmarket={(data) => createSubmarketMutation.mutate(data)}
            onDeleteSubmarket={(id) => deleteSubmarketMutation.mutate(id)}
            className="h-[600px]"
          />
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Market Trends Analysis</CardTitle>
              <CardDescription>
                Linear regression analysis of price trends, DOM, and absorption rates per submarket
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submarkets.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Create submarkets first to analyze trends
                </div>
              ) : (
                <div className="space-y-4">
                  {submarkets.map((submarket) => {
                    const submarketTrends = trends.filter(t => t.submarketId === submarket.id);
                    const latestTrend = submarketTrends[0];

                    return (
                      <div key={submarket.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold">{submarket.name}</h3>
                          <Button
                            size="sm"
                            onClick={() => computeTrendMutation.mutate(submarket.id)}
                            disabled={computeTrendMutation.isPending}
                            data-testid={`button-compute-trend-${submarket.id}`}
                          >
                            {computeTrendMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Compute Trend'
                            )}
                          </Button>
                        </div>

                        {latestTrend ? (
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <div className="text-gray-500">Monthly Change</div>
                              <div className="font-semibold text-lg">
                                {latestTrend.trendAnalysis.monthlyChange > 0 ? '+' : ''}
                                {latestTrend.trendAnalysis.monthlyChange.toFixed(2)}%
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-500">R² Confidence</div>
                              <div className="font-semibold text-lg">
                                {latestTrend.trendAnalysis.r2.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-500">Sample Size</div>
                              <div className="font-semibold text-lg">
                                {latestTrend.sampleSize} sales
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">No trend analysis available</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Adjustments Tab */}
        <TabsContent value="adjustments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Market Condition Adjustments</CardTitle>
              <CardDescription>
                Time-based adjustments calculated from trend analysis with audit trails
              </CardDescription>
            </CardHeader>
            <CardContent>
              {adjustments.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  No adjustments computed yet
                </div>
              ) : (
                <div className="space-y-2">
                  {adjustments.map((adj) => (
                    <div key={adj.id} className="border rounded p-3 text-sm" data-testid={`adjustment-${adj.id}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{adj.adjustmentType}</div>
                          <div className="text-gray-500 text-xs mt-1">
                            {new Date(adj.saleDate).toLocaleDateString()} → {new Date(adj.effectiveDate).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">
                            {adj.calculation.adjustmentPercent > 0 ? '+' : ''}
                            {adj.calculation.adjustmentPercent.toFixed(2)}%
                          </div>
                          <div className="text-xs text-gray-500">
                            ${Math.abs(adj.calculation.adjustmentDollars).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Validation Tab */}
        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>GSE Alignment & Validation</CardTitle>
              <CardDescription>
                Benchmark comparisons with variance tracking and approval workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              {validations.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  No validations performed yet
                </div>
              ) : (
                <div className="space-y-4">
                  {validations.map((validation) => (
                    <div key={validation.id} className="border rounded-lg p-4" data-testid={`validation-${validation.id}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-semibold">
                          Validation - {new Date(validation.validationDate).toLocaleDateString()}
                        </div>
                        <Badge
                          variant={
                            validation.status === 'approved' ? 'default' :
                            validation.status === 'rejected' ? 'destructive' :
                            'secondary'
                          }
                        >
                          {validation.status}
                        </Badge>
                      </div>
                      <div className="text-sm space-y-2">
                        {validation.checks.map((check, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            {check.passed ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <div className="h-4 w-4 rounded-full border-2 border-red-600" />
                            )}
                            <span className={check.passed ? 'text-gray-700' : 'text-red-600'}>
                              {check.checkType}: {check.details}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
