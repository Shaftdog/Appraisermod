import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select,
  SelectContent, 
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RiskChip } from "./RiskChip";
import { Search, Filter, ChevronRight, Clock, AlertTriangle } from "lucide-react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import type { ReviewQueueItem } from "@/../../types/review";

interface QueueFilters {
  search: string;
  status: string;
  risk: string;
  sortBy: 'dueDate' | 'updatedAt' | 'risk';
  sortOrder: 'asc' | 'desc';
}

export function ReviewQueue() {
  const [filters, setFilters] = useState<QueueFilters>({
    search: '',
    status: 'all',
    risk: 'all',
    sortBy: 'dueDate',
    sortOrder: 'asc'
  });

  const { data: queueItems = [], isLoading } = useQuery<ReviewQueueItem[]>({
    queryKey: ['/api/review/queue']
  });

  const filteredItems = queueItems
    .filter(item => {
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        return (
          item.address.toLowerCase().includes(searchLower) ||
          item.client.toLowerCase().includes(searchLower) ||
          item.appraiser.toLowerCase().includes(searchLower)
        );
      }
      return true;
    })
    .filter(item => filters.status === 'all' || item.status === filters.status)
    .filter(item => filters.risk === 'all' || item.overallRisk === filters.risk)
    .sort((a, b) => {
      const multiplier = filters.sortOrder === 'desc' ? -1 : 1;
      
      if (filters.sortBy === 'dueDate') {
        return multiplier * (new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      }
      if (filters.sortBy === 'updatedAt') {
        return multiplier * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      }
      if (filters.sortBy === 'risk') {
        const riskOrder = { red: 3, yellow: 2, green: 1 };
        return multiplier * (riskOrder[a.overallRisk] - riskOrder[b.overallRisk]);
      }
      return 0;
    });

  const formatDueDate = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d');
  };

  const getDueDateUrgency = (dateStr: string) => {
    const date = parseISO(dateStr);
    const now = new Date();
    const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (diffHours < 0) return 'overdue';
    if (diffHours < 24) return 'urgent';
    if (diffHours < 48) return 'soon';
    return 'normal';
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
      changes_requested: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400',
      approved: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
    };
    
    const labels = {
      open: 'Open',
      changes_requested: 'Changes Requested',
      approved: 'Approved'
    };

    return (
      <Badge className={variants[status as keyof typeof variants]}>
        {labels[status as keyof typeof labels]}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Review Queue</h1>
          <p className="text-sm text-muted-foreground">
            {filteredItems.length} orders pending review
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by address, client, or appraiser..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="pl-10"
              data-testid="input-queue-search"
            />
          </div>
        </div>

        <Select 
          value={filters.status}
          onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
        >
          <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="changes_requested">Changes Requested</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>

        <Select 
          value={filters.risk}
          onValueChange={(value) => setFilters(prev => ({ ...prev, risk: value }))}
        >
          <SelectTrigger className="w-[140px]" data-testid="select-risk-filter">
            <AlertTriangle className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk</SelectItem>
            <SelectItem value="red">High Risk</SelectItem>
            <SelectItem value="yellow">Medium Risk</SelectItem>
            <SelectItem value="green">Low Risk</SelectItem>
          </SelectContent>
        </Select>

        <Select 
          value={`${filters.sortBy}-${filters.sortOrder}`}
          onValueChange={(value) => {
            const [sortBy, sortOrder] = value.split('-');
            setFilters(prev => ({ 
              ...prev, 
              sortBy: sortBy as any, 
              sortOrder: sortOrder as any 
            }));
          }}
        >
          <SelectTrigger className="w-[140px]" data-testid="select-sort-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dueDate-asc">Due Date ↑</SelectItem>
            <SelectItem value="dueDate-desc">Due Date ↓</SelectItem>
            <SelectItem value="risk-desc">Risk Level ↓</SelectItem>
            <SelectItem value="updatedAt-desc">Recently Updated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Queue Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Property</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Appraiser</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Risk Level</TableHead>
              <TableHead>Policy Hits</TableHead>
              <TableHead className="w-[100px]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.map((item) => {
              const urgency = getDueDateUrgency(item.dueDate);
              
              return (
                <TableRow key={item.orderId} className="hover:bg-muted/50">
                  <TableCell>
                    <div className="font-medium">{item.address}</div>
                    <div className="text-sm text-muted-foreground">
                      Order: {item.orderId}
                    </div>
                  </TableCell>
                  
                  <TableCell className="font-medium">{item.client}</TableCell>
                  
                  <TableCell>{item.appraiser}</TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {urgency === 'overdue' && (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      )}
                      {urgency === 'urgent' && (
                        <Clock className="h-4 w-4 text-orange-500" />
                      )}
                      <span className={
                        urgency === 'overdue' ? 'text-red-600 font-medium' :
                        urgency === 'urgent' ? 'text-orange-600 font-medium' :
                        urgency === 'soon' ? 'text-yellow-600' :
                        'text-muted-foreground'
                      }>
                        {formatDueDate(item.dueDate)}
                      </span>
                    </div>
                  </TableCell>
                  
                  <TableCell>{getStatusBadge(item.status)}</TableCell>
                  
                  <TableCell>
                    <RiskChip risk={item.overallRisk} />
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex gap-1">
                      {item.hitsCount.red > 0 && (
                        <RiskChip risk="red" count={item.hitsCount.red} className="text-xs py-0" />
                      )}
                      {item.hitsCount.yellow > 0 && (
                        <RiskChip risk="yellow" count={item.hitsCount.yellow} className="text-xs py-0" />
                      )}
                      {item.hitsCount.info > 0 && (
                        <span className="text-xs text-muted-foreground">
                          +{item.hitsCount.info} info
                        </span>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <Link href={`/reviewer/orders/${item.orderId}`}>
                      <Button variant="ghost" size="sm" data-testid={`button-review-${item.orderId}`}>
                        Review
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        
        {filteredItems.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No orders match your current filters.
          </div>
        )}
      </div>
    </div>
  );
}