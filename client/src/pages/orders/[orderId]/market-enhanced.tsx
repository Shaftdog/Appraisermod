import { useEffect, useState } from 'react';
import { useParams } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { EnhancedMarketMap } from '@/components/map/EnhancedMarketMap';
import { TrendDashboard } from '@/components/market/TrendDashboard';
import { AdjustmentCalculator } from '@/components/market/AdjustmentCalculator';
import { BenchmarkAlignment } from '@/components/market/BenchmarkAlignment';
import { ValidationWorkflow } from '@/components/market/ValidationWorkflow';
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

  // Compute trend mutation (updated to accept method parameter)
  const computeTrendMutation = useMutation({
    mutationFn: async ({ submarketId, method }: { submarketId: string; method: 'linear' | 'polynomial' }) => {
      return apiRequest(`/api/orders/${orderId}/market/trends/compute`, {
        method: 'POST',
        body: JSON.stringify({
          submarketId,
          timeRange: { monthsBack: 12, startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString() },
          method
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
          {submarkets.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                Create submarkets first to analyze trends
              </CardContent>
            </Card>
          ) : (
            <TrendDashboard
              submarkets={submarkets}
              trends={trends}
              onComputeTrend={(submarketId, method) => computeTrendMutation.mutate({ submarketId, method })}
              isComputing={computeTrendMutation.isPending}
            />
          )}
        </TabsContent>

        {/* Adjustments Tab */}
        <TabsContent value="adjustments" className="space-y-4">
          {/* Calculator */}
          {compsData && compsData.comps.length > 0 && submarkets.length > 0 && trends.length > 0 ? (
            <AdjustmentCalculator
              orderId={orderId!}
              submarkets={submarkets}
              trends={trends}
              comps={compsData.comps}
              onAdjustmentComputed={() => {
                // Refresh adjustments list
              }}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                {submarkets.length === 0 && "Create submarkets first"}
                {submarkets.length > 0 && trends.length === 0 && "Compute trends for submarkets"}
                {trends.length > 0 && (!compsData || compsData.comps.length === 0) && "Add comparable sales to compute adjustments"}
              </CardContent>
            </Card>
          )}
          
          {/* Adjustments List */}
          {adjustments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Computed Adjustments</CardTitle>
                <CardDescription>
                  Historical market condition adjustments with audit trails
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {adjustments.map((adj) => (
                    <div key={adj.id} className="border rounded p-3 text-sm" data-testid={`adjustment-${adj.id}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{adj.adjustmentType}</div>
                          <div className="text-gray-500 text-xs mt-1">
                            {new Date(adj.saleDate).toLocaleDateString()} → {new Date(adj.effectiveDate).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            Method: {adj.calculation.method} | R²: {adj.metadata?.confidence?.toFixed(2)}
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
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Validation Tab */}
        <TabsContent value="validation" className="space-y-4">
          {/* GSE Benchmark Alignment */}
          {adjustments.length > 0 && (
            <BenchmarkAlignment
              orderId={orderId!}
              adjustments={adjustments}
              benchmarks={benchmarks}
              submarkets={submarkets}
            />
          )}
          
          {/* Validation Workflow */}
          <ValidationWorkflow
            orderId={orderId!}
            adjustments={adjustments}
            validations={validations}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
