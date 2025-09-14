import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'wouter';
import { StatusChip } from '@/components/StatusChip';
import { SignoffPanel } from '@/components/SignoffPanel';
import { VersionDiffViewer } from '@/components/VersionDiffViewer';
import { Toolbar } from '@/components/Toolbar';
import { Order } from '@/types';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { audit } from '../../../../../lib/audit';
import { telemetry } from '../../../../../lib/telemetry';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { TrendingUp, TrendingDown, BarChart3, Settings, RefreshCw, Clock, Calendar, Database, MapPin } from 'lucide-react';
import { MarketSettings, MarketRecord, McrMetrics, TimeAdjustments } from '@shared/schema';
import { computeMonthlyMedians, computeMarketMetrics } from '@/lib/market/stats';
import type { ClosedSale } from '@shared/attom';
import { checkAttomRateLimit, formatRateLimitMessage } from '@/lib/attomRateLimit';

export default function Market() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId;
  const [showVersions, setShowVersions] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'mcr' | 'records' | 'adjustments'>('overview');
  const [currentSettings, setCurrentSettings] = useState<Partial<MarketSettings>>({});
  const [useAttomData, setUseAttomData] = useState(false);
  const [attomImportSettings, setAttomImportSettings] = useState({
    radiusMiles: 1.0,
    monthsBack: 12,
    minSalePrice: 100000,
    maxSalePrice: 2000000
  });
  const [rateLimitStatus, setRateLimitStatus] = useState({ canImport: true, minutesRemaining: 0 });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check rate limit on component mount and when needed
  const checkRateLimit = async () => {
    const status = await checkAttomRateLimit();
    setRateLimitStatus(status);
  };

  // Check rate limit when component mounts
  useEffect(() => {
    checkRateLimit();
  }, []);

  const { data: order, isLoading: orderLoading, isError: orderError, error: orderErrorDetails } = useQuery<Order>({
    queryKey: ['/api/orders', orderId],
    enabled: !!orderId
  });

  // Market data queries
  const { data: marketSettings, isLoading: settingsLoading, isError: settingsError, error: settingsErrorDetails } = useQuery<MarketSettings>({
    queryKey: ['/api/orders', orderId, 'market', 'settings'],
    enabled: !!orderId
  });

  const { data: marketRecords, isLoading: recordsLoading, isError: recordsError, error: recordsErrorDetails } = useQuery<MarketRecord[]>({
    queryKey: ['/api/orders', orderId, 'market', 'records'],
    enabled: !!orderId
  });

  const { data: timeAdjustments, isLoading: adjustmentsLoading, isError: adjustmentsError, error: adjustmentsErrorDetails } = useQuery<TimeAdjustments>({
    queryKey: ['/api/orders', orderId, 'market', 'time-adjustments'],
    enabled: !!orderId
  });

  // ATTOM closed sales query
  const { data: attomClosedSales, isLoading: attomLoading, isError: attomError, error: attomErrorDetails } = useQuery<ClosedSale[]>({
    queryKey: ['/api/orders', orderId, 'attom', 'closed-sales'],
    enabled: !!orderId && useAttomData
  });

  // MCR computation state
  const [mcrMetrics, setMcrMetrics] = useState<McrMetrics | null>(null);

  const signoffMutation = useMutation({
    mutationFn: async (overrideReason?: string) => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/tabs/market/signoff`, {
        action: 'sign-appraiser',
        overrideReason
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
      toast({
        title: "Section signed off",
        description: "Market has been successfully signed off.",
      });
    },
    onError: (error) => {
      toast({
        title: "Sign-off failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Seed market records mutation
  const seedRecordsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/market/records/seed`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'market', 'records'] });
      toast({
        title: "Market records seeded",
        description: "Sample market data has been generated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Seeding failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Compute MCR mutation
  const computeMcrMutation = useMutation({
    mutationFn: async (settings?: Partial<MarketSettings>) => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/market/mcr/compute`, { 
        settings,
        source: useAttomData ? 'attom' : 'local'
      });
      return response.json();
    },
    onSuccess: (data: McrMetrics) => {
      setMcrMetrics(data);
      toast({
        title: "MCR analysis complete",
        description: "Market conditions have been analyzed.",
      });
    },
    onError: (error) => {
      toast({
        title: "MCR analysis failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Save time adjustments mutation
  const saveTimeAdjustmentMutation = useMutation({
    mutationFn: async () => {
      if (mcrMetrics == null || mcrMetrics.trendPctPerMonth == null) throw new Error('No MCR analysis available');
      
      const effectiveDate = currentSettings.effectiveDateISO || marketSettings?.effectiveDateISO || order?.dueDate || new Date().toISOString();
      const basis = currentSettings.metric || marketSettings?.metric || 'salePrice';
      
      const response = await apiRequest('PUT', `/api/orders/${orderId}/market/time-adjustments`, {
        pctPerMonth: mcrMetrics.trendPctPerMonth,
        basis,
        effectiveDateISO: effectiveDate
      });
      return response.json();
    },
    onSuccess: () => {
      // Audit logging for time adjustment save
      audit({
        userId: 'current-user', // Will be populated by server with actual user
        role: 'appraiser',
        action: 'market.time_adjustment_save',
        orderId: orderId!,
        path: 'market.save_time_adjustments',
        after: { 
          pctPerMonth: mcrMetrics?.trendPctPerMonth || 0,
          basis: currentSettings.metric || marketSettings?.metric || 'salePrice',
          trendMethod: mcrMetrics?.trendMethod || 'unknown',
          effectiveDate: currentSettings.effectiveDateISO || marketSettings?.effectiveDateISO || order?.dueDate
        }
      });

      // Telemetry for time adjustment
      telemetry.timeAdjustment(
        Math.abs((mcrMetrics?.trendPctPerMonth || 0) * 100), 
        currentSettings.metric || marketSettings?.metric || 'salePrice',
        orderId
      );

      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'market', 'time-adjustments'] });
      toast({
        title: "Time adjustment saved",
        description: `Applied ${((mcrMetrics?.trendPctPerMonth || 0) * 100).toFixed(2)}%/mo on ${currentSettings.metric || marketSettings?.metric || 'salePrice'} basis.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // ATTOM closed sales import mutation
  const importAttomSalesMutation = useMutation({
    mutationFn: async () => {
      if (!order?.tabs.subject?.data.address) {
        throw new Error('Subject property address is required for ATTOM import');
      }
      
      const response = await apiRequest('POST', '/api/attom/closed-sales/import', {
        orderId,
        subjectAddress: order.tabs.subject.data.address,
        settings: attomImportSettings
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'attom', 'closed-sales'] });
      toast({
        title: "ATTOM import successful",
        description: `Imported ${data.count} closed sales from ATTOM Data Solutions.`,
      });
      // Refresh rate limit status after successful import
      checkRateLimit();
    },
    onError: (error) => {
      toast({
        title: "ATTOM import failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Handle missing orderId
  if (!orderId) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>Order ID is required to view market data.</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Handle loading states - wait for all critical data to load
  const isLoadingAny = orderLoading || settingsLoading || recordsLoading || adjustmentsLoading;
  
  if (isLoadingAny) {
    return (
      <div className="p-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  // Handle critical errors - show specific error messages
  if (orderError) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load order: {orderErrorDetails?.message || 'Unknown error'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Handle market data errors - show warnings but don't block the entire page
  const hasMarketDataErrors = settingsError || recordsError || adjustmentsError;
  const marketDataErrors = [
    settingsError && { type: 'Settings', message: settingsErrorDetails?.message },
    recordsError && { type: 'Records', message: recordsErrorDetails?.message },
    adjustmentsError && { type: 'Time Adjustments', message: adjustmentsErrorDetails?.message }
  ].filter(Boolean) as { type: string; message: string }[];

  if (!order) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>Order not found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const tab = order.tabs.market;
  if (!tab) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>Market tab not found for this order.</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Compute chart data from selected data source
  const selectedDataSource = useAttomData && attomClosedSales ? 
    attomClosedSales.map(sale => ({
      status: 'sold' as const,
      closeDate: sale.closeDate,
      salePrice: sale.closePrice,
      ppsf: sale.gla ? sale.closePrice / sale.gla : undefined,
      listDate: sale.closeDate, // Use close date as fallback
      dom: 0, // Not available in ATTOM data
      spToLp: 1.0 // Assume 100% for closed sales
    })) : marketRecords;
  
  const chartData = selectedDataSource ? computeMonthlyMedians(selectedDataSource, 'salePrice', 12) : [];
  const ppsfData = selectedDataSource ? computeMonthlyMedians(selectedDataSource, 'ppsf', 12) : [];

  // Tab navigation items
  const tabItems = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'mcr', label: 'MCR Analysis', icon: TrendingUp },
    { id: 'records', label: 'Market Records', icon: Settings },
    { id: 'adjustments', label: 'Time Adjustments', icon: Clock }
  ] as const;

  return (
    <div className="p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2" data-testid="heading-market">
            Market Analysis
          </h1>
          <p className="text-muted-foreground">
            Market conditions and trends analysis
          </p>
        </div>
        <div className="mt-4 lg:mt-0">
          <Toolbar onVersionsClick={() => setShowVersions(true)} />
        </div>
      </div>

      <div className="flex space-x-1 bg-muted p-1 rounded-lg mb-6">
        {tabItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              variant={activeTab === item.id ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(item.id)}
              className="flex items-center gap-2"
              data-testid={`tab-${item.id}`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Button>
          );
        })}
      </div>

      {/* Market Data Error Alerts */}
      {hasMarketDataErrors && (
        <div className="mb-6 space-y-3">
          {marketDataErrors.map((error, index) => (
            <Alert key={index} variant="destructive">
              <AlertDescription>
                Failed to load Market {error.type}: {error.message || 'Unknown error'}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-medium text-foreground mb-4">Section Status</h3>
          <div className="flex items-center gap-3 mb-3">
            <StatusChip
              status={tab.qc.status}
              openIssues={tab.qc.openIssues}
              overriddenIssues={tab.qc.overriddenIssues}
              lastReviewedBy={tab.qc.lastReviewedBy}
              lastReviewedAt={tab.qc.lastReviewedAt}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            <p className="mb-1"><span className="font-medium">Open Issues:</span> {tab.qc.openIssues}</p>
            <p className="mb-1"><span className="font-medium">Overridden Issues:</span> {tab.qc.overriddenIssues}</p>
            {tab.qc.lastReviewedBy && tab.qc.lastReviewedAt && (
              <p><span className="font-medium">Last Reviewed:</span> {new Date(tab.qc.lastReviewedAt).toLocaleDateString()} by {tab.qc.lastReviewedBy}</p>
            )}
          </div>
        </div>

        <SignoffPanel
          signoff={tab.signoff}
          status={tab.qc.status}
          openIssues={tab.qc.openIssues}
          onSignoff={signoffMutation.mutateAsync}
        />
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Market Overview</CardTitle>
                <CardDescription>Current market conditions and trends</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid lg:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-foreground mb-1" data-testid="metric-days-on-market">
                      {mcrMetrics?.domMedian ? Math.round(mcrMetrics.domMedian) : tab.currentData.daysOnMarket || '45'}
                    </div>
                    <div className="text-sm text-muted-foreground">Average Days on Market</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-foreground mb-1" data-testid="metric-absorption">
                      {mcrMetrics?.monthsOfInventory ? mcrMetrics.monthsOfInventory.toFixed(1) : tab.currentData.absorption || '6.2'}
                    </div>
                    <div className="text-sm text-muted-foreground">Months of Inventory</div>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold text-foreground mb-1" data-testid="metric-price-change">
                      {mcrMetrics?.trendPctPerMonth ? 
                        `${(mcrMetrics.trendPctPerMonth * 12 * 100).toFixed(1)}%` : 
                        tab.currentData.priceChange || '+3.2%'}
                    </div>
                    <div className="text-sm text-muted-foreground">YoY Price Change</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {chartData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Price Trends</CardTitle>
                  <CardDescription>Median sale prices over the last 12 months</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={{
                      medianSalePrice: {
                        label: "Median Sale Price",
                        color: "hsl(var(--chart-1))",
                      },
                    }}
                    className="h-[300px] w-full"
                  >
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line 
                        type="monotone" 
                        dataKey="medianSalePrice" 
                        stroke="var(--color-medianSalePrice)" 
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Warning Issues */}
            {tab.qc.status === 'yellow' && tab.qc.openIssues > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">⚠️ Warnings ({tab.qc.openIssues})</h4>
                <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                  <li>• Limited comparable sales in past 6 months</li>
                  <li>• Market volatility detected in neighborhood</li>
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'mcr' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>MCR Analysis</CardTitle>
                    <CardDescription>Market conditions rating and trend analysis</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => seedRecordsMutation.mutate()}
                      disabled={seedRecordsMutation.isPending}
                      variant="outline"
                      size="sm"
                      data-testid="button-seed-records"
                    >
                      <RefreshCw className={`h-4 w-4 ${seedRecordsMutation.isPending ? 'animate-spin' : ''}`} />
                      Seed Data
                    </Button>
                    <Button
                      onClick={() => computeMcrMutation.mutate({...marketSettings, ...currentSettings})}
                      disabled={computeMcrMutation.isPending || (!useAttomData && !marketRecords?.length) || (useAttomData && (!attomClosedSales?.length || attomLoading))}
                      size="sm"
                      data-testid="button-compute-mcr"
                    >
                      <BarChart3 className="h-4 w-4" />
                      Compute MCR
                    </Button>
                  </div>
                </div>

                {/* Data Source Toggle */}
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-l-4 border-blue-500">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-medium text-foreground">Data Source</h4>
                      <p className="text-xs text-muted-foreground">Choose between local market records or ATTOM closed sales data</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Label htmlFor="attom-data-toggle" className="text-sm font-medium">
                        <Database className="h-4 w-4 inline mr-1" />
                        Use ATTOM Data
                      </Label>
                      <Switch
                        id="attom-data-toggle"
                        checked={useAttomData}
                        onCheckedChange={setUseAttomData}
                        data-testid="switch-attom-data"
                      />
                    </div>
                  </div>

                  {useAttomData && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="radius-miles" className="text-sm font-medium">
                            Search Radius (miles)
                          </Label>
                          <Input
                            id="radius-miles"
                            type="number"
                            step="0.1"
                            min="0.1"
                            max="5.0"
                            value={attomImportSettings.radiusMiles}
                            onChange={(e) => setAttomImportSettings(prev => ({...prev, radiusMiles: parseFloat(e.target.value)}))}
                            data-testid="input-radius-miles"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="months-back-attom" className="text-sm font-medium">
                            Months Back
                          </Label>
                          <Select
                            value={String(attomImportSettings.monthsBack)}
                            onValueChange={(value) => setAttomImportSettings(prev => ({...prev, monthsBack: Number(value)}))}
                          >
                            <SelectTrigger data-testid="select-months-back-attom">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="6">6 months</SelectItem>
                              <SelectItem value="12">12 months</SelectItem>
                              <SelectItem value="18">18 months</SelectItem>
                              <SelectItem value="24">24 months</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="min-sale-price" className="text-sm font-medium">
                            Min Sale Price
                          </Label>
                          <Input
                            id="min-sale-price"
                            type="number"
                            step="10000"
                            value={attomImportSettings.minSalePrice}
                            onChange={(e) => setAttomImportSettings(prev => ({...prev, minSalePrice: Number(e.target.value)}))}
                            data-testid="input-min-sale-price"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="max-sale-price" className="text-sm font-medium">
                            Max Sale Price
                          </Label>
                          <Input
                            id="max-sale-price"
                            type="number"
                            step="10000"
                            value={attomImportSettings.maxSalePrice}
                            onChange={(e) => setAttomImportSettings(prev => ({...prev, maxSalePrice: Number(e.target.value)}))}
                            data-testid="input-max-sale-price"
                          />
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <Button
                          onClick={() => importAttomSalesMutation.mutate()}
                          disabled={importAttomSalesMutation.isPending || !rateLimitStatus.canImport}
                          variant="outline"
                          size="sm"
                          data-testid="button-import-attom"
                        >
                          <MapPin className={`h-4 w-4 ${importAttomSalesMutation.isPending ? 'animate-spin' : ''}`} />
                          {importAttomSalesMutation.isPending ? 'Importing...' : 
                           !rateLimitStatus.canImport ? `Rate limited (${formatRateLimitMessage(rateLimitStatus.minutesRemaining)})` :
                           'Import ATTOM Sales'}
                        </Button>
                        {attomClosedSales && (
                          <Badge variant="secondary" className="text-xs">
                            {attomClosedSales.length} ATTOM sales loaded
                          </Badge>
                        )}
                      </div>

                      {attomClosedSales && attomClosedSales.length > 0 && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                          <div className="flex items-center gap-2 text-sm text-blue-800 dark:text-blue-200">
                            <MapPin className="h-4 w-4" />
                            <span className="font-medium">ATTOM Data Active:</span>
                            <span>{attomClosedSales.length} closed sales within {attomImportSettings.radiusMiles} miles</span>
                          </div>
                          <div className="mt-2 text-xs text-blue-600 dark:text-blue-300" data-testid="footer-attom-attribution">
                            Source: ATTOM Data Solutions
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* ATTOM Loading and Error States */}
                  {useAttomData && attomLoading && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-sm text-blue-800 dark:text-blue-200">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Loading ATTOM closed sales data...</span>
                      </div>
                    </div>
                  )}
                  
                  {useAttomData && attomError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-sm text-red-800 dark:text-red-200">
                        <MapPin className="h-4 w-4" />
                        <span className="font-medium">ATTOM Data Error:</span>
                        <span>{attomErrorDetails?.message || 'Failed to load ATTOM data'}</span>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Analysis Settings */}
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="effective-date" className="text-sm font-medium">
                        Effective Date
                      </Label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                        <Input
                          id="effective-date"
                          type="date"
                          className="pl-10"
                          value={currentSettings.effectiveDateISO || (marketSettings?.effectiveDateISO ? marketSettings.effectiveDateISO.split('T')[0] : new Date().toISOString().split('T')[0])}
                          onChange={(e) => setCurrentSettings(prev => ({...prev, effectiveDateISO: e.target.value + 'T00:00:00.000Z'}))}
                          data-testid="input-effective-date"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="metric-basis" className="text-sm font-medium">
                        Analysis Basis
                      </Label>
                      <Select
                        value={currentSettings.metric || marketSettings?.metric || 'salePrice'}
                        onValueChange={(value: 'salePrice' | 'ppsf') => setCurrentSettings(prev => ({...prev, metric: value}))}
                      >
                        <SelectTrigger data-testid="select-metric-basis">
                          <SelectValue placeholder="Select basis" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="salePrice">Sale Price</SelectItem>
                          <SelectItem value="ppsf">$/SF</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="months-back" className="text-sm font-medium">
                        Months Back
                      </Label>
                      <Select
                        value={String(currentSettings.monthsBack || marketSettings?.monthsBack || 12)}
                        onValueChange={(value) => setCurrentSettings(prev => ({...prev, monthsBack: Number(value) as 12 | 18 | 24}))}
                      >
                        <SelectTrigger data-testid="select-months-back">
                          <SelectValue placeholder="Select months" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="12">12 months</SelectItem>
                          <SelectItem value="18">18 months</SelectItem>
                          <SelectItem value="24">24 months</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {mcrMetrics ? (
                  <div className="space-y-4">
                    <div className="grid lg:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span>Trend Method:</span>
                          <Badge variant="secondary">{mcrMetrics.trendMethod}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span>Monthly Trend:</span>
                          <span className={mcrMetrics.trendPctPerMonth > 0 ? 'text-green-600' : 'text-red-600'}>
                            {(mcrMetrics.trendPctPerMonth * 100).toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Months of Inventory:</span>
                          <span>{mcrMetrics.monthsOfInventory.toFixed(1)}</span>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span>DOM Median:</span>
                          <span>{mcrMetrics.domMedian ? Math.round(mcrMetrics.domMedian) : 'N/A'} days</span>
                        </div>
                        <div className="flex justify-between">
                          <span>SP/LP Ratio:</span>
                          <span>{mcrMetrics.spToLpMedian ? (mcrMetrics.spToLpMedian * 100).toFixed(1) + '%' : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Records Analyzed:</span>
                          <span>{marketRecords?.length || 0}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Use Time Adjustment Button */}
                    <div className="mt-6 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          Time adjustments calculated to {currentSettings.effectiveDateISO ? new Date(currentSettings.effectiveDateISO).toLocaleDateString() : 'today'} on {currentSettings.metric || marketSettings?.metric || 'salePrice'} basis.
                        </div>
                        <Button
                          onClick={() => saveTimeAdjustmentMutation.mutate()}
                          disabled={saveTimeAdjustmentMutation.isPending || mcrMetrics == null || mcrMetrics.trendPctPerMonth == null}
                          data-testid="button-use-time-adjustment"
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          Use this time adjustment
                        </Button>
                      </div>
                      
                      {timeAdjustments && (
                        <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="text-sm text-green-800 dark:text-green-200">
                            ✓ Applied {(timeAdjustments.pctPerMonth * 100).toFixed(2)}%/mo on {timeAdjustments.basis} basis, effective {new Date(timeAdjustments.effectiveDateISO).toLocaleDateString()}.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">No MCR analysis available</p>
                    <p className="text-sm text-muted-foreground">
                      Seed market data and compute MCR to see analysis results
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'records' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Market Records</CardTitle>
                  <CardDescription>Historical sales data for analysis</CardDescription>
                </div>
                <Badge variant="outline" data-testid="badge-record-count">
                  {marketRecords?.length || 0} records
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {marketRecords && marketRecords.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid lg:grid-cols-4 gap-4 text-sm">
                    <div><strong>Status Distribution:</strong></div>
                    <div>Sold: {marketRecords.filter(r => r.status === 'sold').length}</div>
                    <div>Active: {marketRecords.filter(r => r.status === 'active').length}</div>
                    <div>Pending: {marketRecords.filter(r => r.status === 'pending').length}</div>
                  </div>
                  <Separator />
                  <div className="text-sm text-muted-foreground">
                    Latest records from {marketRecords[0]?.listDate} to {marketRecords[marketRecords.length - 1]?.listDate}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No market records available</p>
                  <Button 
                    onClick={() => seedRecordsMutation.mutate()}
                    disabled={seedRecordsMutation.isPending}
                    data-testid="button-seed-initial"
                  >
                    <RefreshCw className={`h-4 w-4 ${seedRecordsMutation.isPending ? 'animate-spin' : ''}`} />
                    Generate Sample Data
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'adjustments' && (
          <Card>
            <CardHeader>
              <CardTitle>Time Adjustments</CardTitle>
              <CardDescription>Time-based market condition adjustments for comparable properties</CardDescription>
            </CardHeader>
            <CardContent>
              {timeAdjustments ? (
                <div className="space-y-4">
                  <div className="grid lg:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span>Monthly Adjustment Rate:</span>
                        <span className={timeAdjustments.monthlyRate > 0 ? 'text-green-600' : 'text-red-600'}>
                          {(timeAdjustments.monthlyRate * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Method:</span>
                        <Badge variant="secondary">{timeAdjustments.method}</Badge>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span>Confidence Level:</span>
                        <span>{(timeAdjustments.confidence * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Data Points:</span>
                        <span>{timeAdjustments.dataPoints}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Time adjustments will be calculated from MCR analysis</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {showVersions && (
        <VersionDiffViewer
          versions={tab.versions}
          currentData={tab.currentData}
          open={showVersions}
          onClose={() => setShowVersions(false)}
        />
      )}
    </div>
  );
}
