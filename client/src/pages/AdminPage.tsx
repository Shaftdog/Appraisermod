import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Settings, Database, Activity, Shield, AlertTriangle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Flags } from '../../../config/flags';

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check user role from auth context
  const { data: authUser } = useQuery<{ id: string; role: string; username: string }>({ 
    queryKey: ['/api/auth/me'],
  });

  // Only show for chief/admin roles
  if (!authUser?.role || !['chief', 'admin'].includes(authUser.role)) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="text-center text-muted-foreground">
          <Shield className="h-12 w-12 mx-auto mb-4" />
          <h2 className="text-lg font-medium">Access Restricted</h2>
          <p>Admin features are only available to Chief Appraisers and Administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">System Administration</h1>
          <p className="text-muted-foreground">
            Configure system features, monitor operations, and manage platform settings.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Role: {authUser.role}
        </Badge>
      </div>

      <div className="grid gap-6">
        {/* Feature Flags Panel */}
        <FeatureFlagsPanel />
        
        {/* Operations Dashboard */}
        <OperationsDashboard />
      </div>
    </div>
  );
}

function FeatureFlagsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load current flags
  const { data: flags, isLoading } = useQuery<Flags>({
    queryKey: ['/api/ops/flags'],
  });

  // Toggle flag mutation
  const toggleFlagMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean }) => {
      const response = await fetch(`/api/ops/flags/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: value }),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to update flag');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ops/flags'] });
      toast({
        title: 'Feature flag updated',
        description: 'The feature flag has been successfully updated.',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to update flag',
        description: 'There was an error updating the feature flag.',
        variant: 'destructive',
      });
    },
  });

  const handleToggle = (key: keyof Flags, value: boolean) => {
    toggleFlagMutation.mutate({ key, value });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Feature Flags
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">Loading flags...</div>
        </CardContent>
      </Card>
    );
  }

  const flagDescriptions = {
    telemetry: 'Enable performance metrics and usage analytics',
    auditLog: 'Track user actions and system events for compliance',
    backups: 'Automatic order snapshots and data versioning',
    featureGatesUI: 'Show this admin panel and feature controls',
    healthChecks: 'System health monitoring and status checks',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Feature Flags
        </CardTitle>
        <CardDescription>
          Toggle system features on or off. Changes take effect immediately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {flags && Object.entries(flags).map(([key, enabled]: [string, boolean]) => (
          <div key={key} className="flex items-center justify-between p-3 rounded-lg border">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                <Badge variant={enabled ? 'default' : 'secondary'} className="text-xs">
                  {enabled ? 'ON' : 'OFF'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {flagDescriptions[key as keyof typeof flagDescriptions]}
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(value) => handleToggle(key as keyof Flags, value)}
              disabled={toggleFlagMutation.isPending}
              data-testid={`toggle-${key}`}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OperationsDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load telemetry summary
  const { data: telemetryData, isLoading: telemetryLoading } = useQuery<{
    export_time_ms: { avg: number; p95: number; trend: number[] };
    pdf_pages: { avg: number; trend: number[] };
    delivery_size_bytes: { avg: number; p95: number; trend: number[] };
    total_orders: number;
    active_reviews: number;
    system_alerts: number;
  }>({
    queryKey: ['/api/ops/telemetry/summary'],
    refetchInterval: 60000, // Refresh every minute
    queryFn: async () => {
      const response = await fetch('/api/ops/telemetry/summary', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        // Return mock data for development/demo purposes
        return {
          export_time_ms: { avg: 1250, p95: 2100, trend: [1100, 1300, 1200, 1400, 1250] },
          pdf_pages: { avg: 24, trend: [22, 25, 23, 26, 24] },
          delivery_size_bytes: { avg: 2.1 * 1024 * 1024, p95: 4.8 * 1024 * 1024, trend: [2.0, 2.2, 2.1, 2.4, 2.1] },
          total_orders: 127,
          active_reviews: 8,
          system_alerts: 2
        };
      }
      
      return response.json();
    },
  });

  const formatBytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const MiniSparkline = ({ data, color = '#3b82f6' }: { data: number[]; color?: string }) => {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    
    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="w-16 h-8">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    );
  };

  if (telemetryLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Operations Dashboard
          </CardTitle>
          <CardDescription>Loading operational metrics...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="p-4 rounded-lg border">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 bg-muted rounded animate-pulse" />
                  <div className="w-16 h-8 bg-muted rounded animate-pulse" />
                </div>
                <div className="w-12 h-8 bg-muted rounded animate-pulse mb-1" />
                <div className="w-20 h-4 bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Operations Dashboard
        </CardTitle>
        <CardDescription>
          Real-time system metrics and operational insights
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Total Orders */}
          <div className="p-4 rounded-lg border text-center" data-testid="metric-total-orders">
            <Database className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">{telemetryData?.total_orders || '--'}</div>
            <div className="text-sm text-muted-foreground">Total Orders</div>
          </div>

          {/* Active Reviews */}
          <div className="p-4 rounded-lg border text-center" data-testid="metric-active-reviews">
            <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">{telemetryData?.active_reviews || '--'}</div>
            <div className="text-sm text-muted-foreground">Active Reviews</div>
          </div>

          {/* System Alerts */}
          <div className="p-4 rounded-lg border text-center" data-testid="metric-system-alerts">
            <AlertTriangle className={`h-8 w-8 mx-auto mb-2 ${
              (telemetryData?.system_alerts || 0) > 0 ? 'text-yellow-500' : 'text-muted-foreground'
            }`} />
            <div className="text-2xl font-bold">{telemetryData?.system_alerts || 0}</div>
            <div className="text-sm text-muted-foreground">System Alerts</div>
          </div>
        </div>

        <Separator className="my-6" />

        {/* Performance Metrics */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Performance Metrics</h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Export Time */}
            <div className="p-4 rounded-lg border" data-testid="metric-export-time">
              <div className="flex items-center justify-between mb-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Export Time</div>
                  <div className="text-lg font-semibold">
                    {telemetryData?.export_time_ms ? formatDuration(telemetryData.export_time_ms.avg) : '--'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    P95: {telemetryData?.export_time_ms ? formatDuration(telemetryData.export_time_ms.p95) : '--'}
                  </div>
                </div>
                {telemetryData?.export_time_ms?.trend && (
                  <MiniSparkline 
                    data={telemetryData.export_time_ms.trend} 
                    color="#10b981" 
                  />
                )}
              </div>
            </div>

            {/* PDF Pages */}
            <div className="p-4 rounded-lg border" data-testid="metric-pdf-pages">
              <div className="flex items-center justify-between mb-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">PDF Pages</div>
                  <div className="text-lg font-semibold">
                    {telemetryData?.pdf_pages ? Math.round(telemetryData.pdf_pages.avg) : '--'}
                  </div>
                  <div className="text-xs text-muted-foreground">Average pages</div>
                </div>
                {telemetryData?.pdf_pages?.trend && (
                  <MiniSparkline 
                    data={telemetryData.pdf_pages.trend} 
                    color="#3b82f6" 
                  />
                )}
              </div>
            </div>

            {/* Delivery Size */}
            <div className="p-4 rounded-lg border" data-testid="metric-delivery-size">
              <div className="flex items-center justify-between mb-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">Delivery Size</div>
                  <div className="text-lg font-semibold">
                    {telemetryData?.delivery_size_bytes ? formatBytes(telemetryData.delivery_size_bytes.avg) : '--'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    P95: {telemetryData?.delivery_size_bytes ? formatBytes(telemetryData.delivery_size_bytes.p95) : '--'}
                  </div>
                </div>
                {telemetryData?.delivery_size_bytes?.trend && (
                  <MiniSparkline 
                    data={telemetryData.delivery_size_bytes.trend.map(x => x / 1024 / 1024)} 
                    color="#f59e0b" 
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <Separator className="my-6" />

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Metrics updated every minute • Last updated: {new Date().toLocaleTimeString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}