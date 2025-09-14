import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, User, Activity as ActivityIcon, Search, Filter, RefreshCw } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';

interface AuditEvent {
  id: string;
  at: string;
  userId: string;
  role: string;
  action: string;
  orderId?: string;
  path?: string;
  before?: any;
  after?: any;
  ip: string;
}

export default function Activity() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId;
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [limit, setLimit] = useState(50);

  const { data: auditEvents, isLoading, error, refetch } = useQuery<AuditEvent[]>({
    queryKey: ['/api/ops/audit', { orderId, limit }],
    enabled: !!orderId,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (orderId) params.append('orderId', orderId);
      params.append('limit', limit.toString());
      
      const response = await fetch(`/api/ops/audit?${params}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch audit events');
      }
      
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds for recent activity
  });

  if (!orderId) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>Order ID is required to view activity.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load activity: {error instanceof Error ? error.message : 'Unknown error'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Filter events based on search and action filter
  const filteredEvents = auditEvents ? auditEvents.filter(event => {
    const matchesSearch = !search || 
      event.action.toLowerCase().includes(search.toLowerCase()) ||
      event.userId.toLowerCase().includes(search.toLowerCase()) ||
      event.path?.toLowerCase().includes(search.toLowerCase());
    
    const matchesAction = actionFilter === 'all' || event.action.includes(actionFilter);
    
    return matchesSearch && matchesAction;
  }) : [];

  // Extract unique action types for filter dropdown
  const actionTypes = auditEvents ? Array.from(new Set(
    auditEvents.map(event => event.action.split('.')[0]).filter(Boolean)
  )).sort() : [];

  const formatTimestamp = (isoString: string) => {
    try {
      const date = parseISO(isoString);
      if (!isValid(date)) return 'Invalid date';
      return format(date, 'MMM dd, yyyy HH:mm:ss');
    } catch {
      return 'Invalid date';
    }
  };

  const getActionBadgeVariant = (action: string) => {
    if (action.includes('signoff') || action.includes('save')) return 'default';
    if (action.includes('override') || action.includes('edit')) return 'secondary';
    if (action.includes('review') || action.includes('qc')) return 'outline';
    return 'secondary';
  };

  const renderValue = (value: any) => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  return (
    <div className="p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2" data-testid="heading-activity">
            Order Activity
          </h1>
          <p className="text-muted-foreground">
            Audit trail and activity history for this order
          </p>
        </div>
        <div className="mt-4 lg:mt-0">
          <Button
            onClick={() => refetch()}
            variant="outline"
            size="sm"
            data-testid="button-refresh-activity"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label htmlFor="search-events" className="text-sm font-medium">
                Search Events
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  id="search-events"
                  type="text"
                  placeholder="Search by action, user, or path..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search-events"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="action-filter" className="text-sm font-medium">
                Action Type
              </label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger data-testid="select-action-filter">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {actionTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)} Actions
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="limit-select" className="text-sm font-medium">
                Results Limit
              </label>
              <Select value={limit.toString()} onValueChange={(value) => setLimit(Number(value))}>
                <SelectTrigger data-testid="select-limit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 events</SelectItem>
                  <SelectItem value="50">50 events</SelectItem>
                  <SelectItem value="100">100 events</SelectItem>
                  <SelectItem value="200">200 events</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ActivityIcon className="h-5 w-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>
                {isLoading ? (
                  'Loading events...'
                ) : (
                  `Showing ${filteredEvents.length} of ${auditEvents?.length || 0} events`
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <ActivityIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No activity events found</p>
              {search || actionFilter !== 'all' ? (
                <p className="text-sm">Try adjusting your filters</p>
              ) : null}
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-48">Timestamp</TableHead>
                    <TableHead className="w-32">User</TableHead>
                    <TableHead className="w-40">Action</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.map((event) => (
                    <TableRow key={event.id} data-testid={`row-event-${event.id}`}>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {formatTimestamp(event.at)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm font-medium" data-testid={`text-user-${event.id}`}>
                              {event.userId}
                            </div>
                            <div className="text-xs text-muted-foreground capitalize">
                              {event.role}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={getActionBadgeVariant(event.action)}
                          data-testid={`badge-action-${event.id}`}
                        >
                          {event.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {event.path || 'N/A'}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-md">
                          {event.before && (
                            <details className="mb-1">
                              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                Before
                              </summary>
                              <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                                {renderValue(event.before)}
                              </pre>
                            </details>
                          )}
                          {event.after && (
                            <details className="mb-1">
                              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                After
                              </summary>
                              <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                                {renderValue(event.after)}
                              </pre>
                            </details>
                          )}
                          {!event.before && !event.after && (
                            <span className="text-sm text-muted-foreground">No details</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}