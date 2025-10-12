import { useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, ComposedChart } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { SubmarketTrend, Submarket } from '@shared/schema';

interface TrendDashboardProps {
  submarkets: Submarket[];
  trends: SubmarketTrend[];
  onComputeTrend: (submarketId: string, method: 'linear' | 'polynomial') => void;
  isComputing: boolean;
}

export function TrendDashboard({ submarkets, trends, onComputeTrend, isComputing }: TrendDashboardProps) {
  const [selectedSubmarket, setSelectedSubmarket] = useState<string | 'all'>('all');
  const [regressionMethod, setRegressionMethod] = useState<'linear' | 'polynomial'>('linear');

  // Get trends for selected submarket or all
  const displayTrends = selectedSubmarket === 'all' 
    ? submarkets.map(s => trends.find(t => t.submarketId === s.id)).filter(Boolean) as SubmarketTrend[]
    : trends.filter(t => t.submarketId === selectedSubmarket);

  // Prepare price trend data for chart - generate from regression equation
  const getPriceTrendData = (trend: SubmarketTrend) => {
    const monthsBack = trend.timeRange.monthsBack;
    const data = [];
    
    for (let month = 1; month <= monthsBack; month++) {
      const predicted = calculatePredicted(month, trend.trendAnalysis.coefficients);
      data.push({
        month,
        predicted,
        lower: predicted * (1 - (1 - trend.trendAnalysis.r2) * 0.5), // Approximate confidence band
        upper: predicted * (1 + (1 - trend.trendAnalysis.r2) * 0.5)
      });
    }
    
    return data;
  };

  const calculatePredicted = (month: number, coefficients: number[]) => {
    if (coefficients.length === 2) {
      // Linear: y = a + bx
      return coefficients[0] + coefficients[1] * month;
    } else if (coefficients.length === 3) {
      // Polynomial: y = a + bx + cx²
      return coefficients[0] + coefficients[1] * month + coefficients[2] * Math.pow(month, 2);
    }
    return 0;
  };

  // Prepare comparison data across submarkets
  const comparisonData = submarkets.map(submarket => {
    const trend = trends.find(t => t.submarketId === submarket.id);
    return {
      name: submarket.name,
      monthlyChange: trend?.trendAnalysis.monthlyChange || 0,
      r2: trend?.trendAnalysis.r2 || 0,
      medianDOM: trend?.marketMetrics.medianDOM || 0,
      absorptionRate: trend?.marketMetrics.absorptionRate || 0,
      sampleSize: trend?.sampleSize || 0
    };
  });

  const getTrendIcon = (change: number) => {
    if (change > 0.5) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (change < -0.5) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-600" />;
  };

  return (
    <div className="space-y-6" data-testid="trend-dashboard">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Select value={selectedSubmarket} onValueChange={setSelectedSubmarket}>
            <SelectTrigger data-testid="select-submarket">
              <SelectValue placeholder="Select submarket" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Submarkets</SelectItem>
              {submarkets.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Select value={regressionMethod} onValueChange={(v) => setRegressionMethod(v as 'linear' | 'polynomial')}>
            <SelectTrigger className="w-[180px]" data-testid="select-regression-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="linear">Linear Regression</SelectItem>
              <SelectItem value="polynomial">Polynomial Regression</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedSubmarket !== 'all' && (
          <Button
            onClick={() => onComputeTrend(selectedSubmarket, regressionMethod)}
            disabled={isComputing}
            data-testid="button-recompute-trend"
          >
            Recompute Trend
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="price" data-testid="tab-price">Price Trends</TabsTrigger>
          <TabsTrigger value="dom" data-testid="tab-dom">Days on Market</TabsTrigger>
          <TabsTrigger value="absorption" data-testid="tab-absorption">Absorption Rates</TabsTrigger>
          <TabsTrigger value="comparison" data-testid="tab-comparison">Submarket Comparison</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {comparisonData.map((data) => (
              <Card key={data.name}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">{data.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Monthly Change</span>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(data.monthlyChange)}
                        <span className="font-semibold">
                          {data.monthlyChange > 0 ? '+' : ''}{data.monthlyChange.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">R² Confidence</span>
                      <Badge variant={data.r2 > 0.7 ? 'default' : data.r2 > 0.4 ? 'secondary' : 'outline'}>
                        {data.r2.toFixed(2)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Median DOM</span>
                      <span className="font-semibold">{data.medianDOM} days</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Sample Size</span>
                      <span className="text-sm">{data.sampleSize} sales</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Price Trends Tab */}
        <TabsContent value="price">
          {displayTrends.length > 0 ? (
            <div className="space-y-6">
              {displayTrends.map((trend) => {
                const submarket = submarkets.find(s => s.id === trend.submarketId);
                const chartData = getPriceTrendData(trend);
                
                return (
                  <Card key={trend.id}>
                    <CardHeader>
                      <CardTitle>{submarket?.name} - Price Trend</CardTitle>
                      <CardDescription>
                        {trend.trendAnalysis.coefficients.length === 3 ? 'Polynomial' : 'Linear'} regression 
                        | R² = {trend.trendAnalysis.r2.toFixed(3)} 
                        | Monthly Change: {trend.trendAnalysis.monthlyChange > 0 ? '+' : ''}{trend.trendAnalysis.monthlyChange.toFixed(2)}%
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" label={{ value: 'Month (lookback)', position: 'insideBottom', offset: -5 }} />
                          <YAxis label={{ value: 'Average Price ($)', angle: -90, position: 'insideLeft' }} />
                          <Tooltip 
                            formatter={(value: number) => `$${value.toLocaleString()}`}
                            labelFormatter={(label) => `Month ${label}`}
                          />
                          <Legend />
                          <Area 
                            name="Confidence Band" 
                            dataKey="upper" 
                            stroke="none" 
                            fill="#8884d8" 
                            fillOpacity={0.2} 
                          />
                          <Area 
                            name="" 
                            dataKey="lower" 
                            stroke="none" 
                            fill="#fff" 
                            fillOpacity={1} 
                          />
                          <Line 
                            name="Trend Line" 
                            dataKey="predicted" 
                            stroke="#ff7300" 
                            strokeWidth={2}
                            dot={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                No price trend data available. Compute trends for submarkets first.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Days on Market Tab */}
        <TabsContent value="dom">
          {displayTrends.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Days on Market Comparison</CardTitle>
                <CardDescription>Median days on market by submarket</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparisonData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis label={{ value: 'Days', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="medianDOM" fill="#82ca9d" name="Median DOM" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                No DOM data available
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Absorption Rates Tab */}
        <TabsContent value="absorption">
          {displayTrends.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Absorption Rates</CardTitle>
                <CardDescription>Monthly absorption rate by submarket (sales per month / inventory)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparisonData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis label={{ value: 'Rate', angle: -90, position: 'insideLeft' }} />
                    <Tooltip formatter={(value: number) => value.toFixed(2)} />
                    <Legend />
                    <Bar dataKey="absorptionRate" fill="#8884d8" name="Absorption Rate" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                No absorption rate data available
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Submarket Comparison Tab */}
        <TabsContent value="comparison">
          <Card>
            <CardHeader>
              <CardTitle>Submarket Performance Comparison</CardTitle>
              <CardDescription>Compare key metrics across all submarkets</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={comparisonData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis yAxisId="left" label={{ value: 'Monthly Change (%)', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: 'R²', angle: 90, position: 'insideRight' }} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="monthlyChange" fill="#8884d8" name="Monthly Change (%)" />
                  <Bar yAxisId="right" dataKey="r2" fill="#82ca9d" name="R² Confidence" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
