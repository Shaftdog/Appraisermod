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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Operations Dashboard
        </CardTitle>
        <CardDescription>
          System metrics, health checks, and operational insights.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border text-center">
            <Database className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">--</div>
            <div className="text-sm text-muted-foreground">Total Orders</div>
          </div>
          <div className="p-4 rounded-lg border text-center">
            <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">--</div>
            <div className="text-sm text-muted-foreground">Active Reviews</div>
          </div>
          <div className="p-4 rounded-lg border text-center">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <div className="text-2xl font-bold">--</div>
            <div className="text-sm text-muted-foreground">System Alerts</div>
          </div>
        </div>
        <Separator className="my-4" />
        <p className="text-sm text-muted-foreground text-center">
          Detailed telemetry dashboard will be available once telemetry features are enabled.
        </p>
      </CardContent>
    </Card>
  );
}