import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { MapPin, Grid, List, Filter } from "lucide-react";
import { CompCard } from "./CompCard";
import { PrimaryCompTray } from "./PrimaryCompTray";
import { MarketMap } from "../map/MarketMap";
import { SwapDialog } from "./SwapDialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CompProperty, Subject, MarketPolygon, CompSelection } from "@shared/schema";

interface CompListProps {
  orderId: string;
  refreshTrigger?: number; // Optional prop to force refresh
}

interface CompsResponse {
  comps: CompProperty[];
  weights: any; // OrderWeights type if needed
}

interface SubjectResponse {
  subject: Subject;
}

interface PolygonResponse {
  polygon: MarketPolygon | null;
}

interface SelectionResponse {
  selection: CompSelection;
}

export function CompList({ orderId, refreshTrigger }: CompListProps) {
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [swapCandidate, setSwapCandidate] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch comps with scoring
  const { data: compsData, isLoading: compsLoading, error: compsError } = useQuery<CompsResponse>({
    queryKey: ["/api/orders", orderId, "comps", ...(refreshTrigger ? [refreshTrigger] : [])],
    refetchOnWindowFocus: false
  });

  // Fetch subject
  const { data: subjectData } = useQuery<SubjectResponse>({
    queryKey: ["/api/orders", orderId, "market", "subject"],
    refetchOnWindowFocus: false
  });

  // Fetch polygon
  const { data: polygonData } = useQuery<PolygonResponse>({
    queryKey: ["/api/orders", orderId, "market", "polygon"],
    refetchOnWindowFocus: false
  });

  // Fetch selection state
  const { data: selectionData } = useQuery<SelectionResponse>({
    queryKey: ["/api/orders", orderId, "comps", "selection"],
    refetchOnWindowFocus: false
  });

  const comps: CompProperty[] = compsData?.comps || [];
  const weights = compsData?.weights;
  const subject = subjectData?.subject;
  const polygon = polygonData?.polygon || null;
  const selection = selectionData?.selection || { orderId, primary: [], locked: [], restrictToPolygon: false };

  // Separate primary and candidate comps
  const primaryComps: (CompProperty | null)[] = [
    comps.find(c => c.id === selection.primary[0]) || null,
    comps.find(c => c.id === selection.primary[1]) || null,
    comps.find(c => c.id === selection.primary[2]) || null
  ];
  
  const candidateComps = comps.filter(c => !selection.primary.includes(c.id));

  // Mutations
  const lockMutation = useMutation({
    mutationFn: async ({ compId, locked }: { compId: string; locked: boolean }) => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/comps/lock`, { compId, locked });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "comps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "comps", "selection"] });
      toast({ title: "Comp lock status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update lock status", variant: "destructive" });
    }
  });

  const promoteMutation = useMutation({
    mutationFn: async (compId: string) => {
      // Find first empty slot or append
      const emptyIndex = selection.primary.findIndex(id => !id || !comps.find(c => c.id === id));
      const targetIndex = emptyIndex !== -1 ? emptyIndex : selection.primary.length < 3 ? selection.primary.length : 2;
      
      const response = await apiRequest('POST', `/api/orders/${orderId}/comps/swap`, { candidateId: compId, targetIndex });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "comps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "comps", "selection"] });
      toast({ title: "Comp promoted to primary" });
    },
    onError: () => {
      toast({ title: "Failed to promote comp", variant: "destructive" });
    }
  });

  const polygonMutation = useMutation({
    mutationFn: async (polygon: MarketPolygon | null) => {
      if (polygon) {
        const response = await apiRequest('PUT', `/api/orders/${orderId}/market/polygon`, { polygon });
        return response.json();
      } else {
        const response = await apiRequest('DELETE', `/api/orders/${orderId}/market/polygon`);
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "market", "polygon"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "comps"] });
      toast({ title: "Market polygon updated" });
    },
    onError: () => {
      toast({ title: "Failed to update market polygon", variant: "destructive" });
    }
  });

  const restrictMutation = useMutation({
    mutationFn: async (restrictToPolygon: boolean) => {
      const response = await apiRequest('PUT', `/api/orders/${orderId}/comps/selection`, { restrictToPolygon });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "comps", "selection"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "comps"] });
      toast({ title: "Polygon restriction updated" });
    },
    onError: () => {
      toast({ title: "Failed to update polygon restriction", variant: "destructive" });
    }
  });

  // Event handlers
  const handleLock = (compId: string, locked: boolean) => {
    lockMutation.mutate({ compId, locked });
  };

  const handlePromote = (compId: string) => {
    promoteMutation.mutate(compId);
  };

  const handleSwap = (compId: string) => {
    setSwapCandidate(compId);
    setShowSwapDialog(true);
  };

  const handleViewOnMap = (compId: string) => {
    setViewMode('map');
    // TODO: Focus on the specific comp marker
    toast({ title: `Focusing on ${comps.find(c => c.id === compId)?.address}` });
  };

  const handleSavePolygon = (polygon: MarketPolygon | null) => {
    polygonMutation.mutate(polygon);
  };

  const handleToggleRestrict = (restricted: boolean) => {
    restrictMutation.mutate(restricted);
  };

  if (compsLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (compsError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comparable Properties</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Failed to load comparable properties
          </div>
        </CardContent>
      </Card>
    );
  }


  return (
    <div className="space-y-6" data-testid="enhanced-comp-list">
      {/* Primary Comparables */}
      <PrimaryCompTray
        primaryComps={primaryComps}
        selection={selection}
        onLock={handleLock}
        onSwap={handleSwap}
        onViewOnMap={handleViewOnMap}
      />

      {/* View Mode Toggle */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Market Analysis
            </CardTitle>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {candidateComps.length} candidates
                </Badge>
                {weights && (
                  <Badge variant="secondary" className="text-xs">
                    Ranked by weights
                  </Badge>
                )}
              </div>
              <div className="flex items-center border rounded-lg p-1">
                <Button
                  variant={viewMode === 'map' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('map')}
                  className="h-8 px-3"
                  data-testid="view-mode-map"
                >
                  <MapPin className="h-4 w-4 mr-1" />
                  Map
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="h-8 px-3"
                  data-testid="view-mode-list"
                >
                  <List className="h-4 w-4 mr-1" />
                  List
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Map View */}
      {viewMode === 'map' && subject && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <MarketMap
              subject={subject}
              comps={comps}
              polygon={polygon}
              restrictToPolygon={selection.restrictToPolygon}
              onSavePolygon={handleSavePolygon}
              onToggleRestrict={handleToggleRestrict}
              onFocusComp={handleViewOnMap}
            />
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Top Candidates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {candidateComps.slice(0, 5).map((comp) => (
                  <CompCard
                    key={comp.id}
                    comp={comp}
                    showPromote={true}
                    showSwap={true}
                    onLock={handleLock}
                    onPromote={handlePromote}
                    onSwap={handleSwap}
                    onViewOnMap={handleViewOnMap}
                    className="w-full"
                  />
                ))}
                {candidateComps.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No candidate properties available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <Card>
          <CardHeader>
            <CardTitle>All Candidate Properties</CardTitle>
          </CardHeader>
          <CardContent>
            {candidateComps.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No candidate properties available
              </div>
            ) : (
              <div className="grid gap-4">
                {candidateComps.map((comp) => (
                  <CompCard
                    key={comp.id}
                    comp={comp}
                    showPromote={true}
                    showSwap={true}
                    onLock={handleLock}
                    onPromote={handlePromote}
                    onSwap={handleSwap}
                    onViewOnMap={handleViewOnMap}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Swap Dialog */}
      {showSwapDialog && swapCandidate && (
        <SwapDialog
          isOpen={showSwapDialog}
          onOpenChange={(open) => {
            setShowSwapDialog(open);
            if (!open) setSwapCandidate(null);
          }}
          candidateComp={comps.find(c => c.id === swapCandidate)!}
          primaryComps={primaryComps}
          selection={selection}
          onSwap={async (targetIndex: 0 | 1 | 2, confirm?: boolean) => {
            try {
              const response = await apiRequest('POST', `/api/orders/${orderId}/comps/swap`, 
                { candidateId: swapCandidate, targetIndex, confirm });
              
              queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "comps"] });
              queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "comps", "selection"] });
              
              toast({ title: "Comp swapped successfully" });
            } catch (error: any) {
              if (error.status === 409) {
                // Handle locked comp confirmation in SwapDialog
                throw error;
              } else {
                toast({ title: "Failed to swap comp", variant: "destructive" });
                throw error;
              }
            }
          }}
        />
      )}
    </div>
  );
}