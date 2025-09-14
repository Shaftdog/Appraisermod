import { useState, useEffect } from 'react';
import { checkAttomRateLimit, formatRateLimitMessage } from '@/lib/attomRateLimit';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Building, MapPin, Calendar, Ruler, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import type { ClosedSale } from '@shared/attom';
import type { TimeAdjustments } from '@shared/schema';
import { calculateTimeAdjustment } from '@shared/timeAdjust';

interface AttomClosedSalesPickerProps {
  orderId: string;
  timeAdjustments?: TimeAdjustments;
}


export function AttomClosedSalesPicker({ orderId, timeAdjustments }: AttomClosedSalesPickerProps) {
  const [selectedSales, setSelectedSales] = useState<Record<string, boolean>>({});
  const [importSettings, setImportSettings] = useState({
    radiusMiles: 0.5,
    monthsBack: 12,
    minSalePrice: 100000,
    maxSalePrice: 1500000
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rateLimitStatus, setRateLimitStatus] = useState({ canImport: true, minutesRemaining: 0 });

  // Check rate limit on component mount and when needed
  const checkRateLimit = async () => {
    const status = await checkAttomRateLimit();
    setRateLimitStatus(status);
  };

  // Check rate limit when component mounts
  useEffect(() => {
    checkRateLimit();
  }, []);

  // Fetch ATTOM closed sales for this order
  const { data: attomSales, isLoading: salesLoading, error: salesError } = useQuery<ClosedSale[]>({
    queryKey: ['/api/orders', orderId, 'attom', 'closed-sales'],
    enabled: !!orderId
  });

  // Import ATTOM sales mutation
  const importSalesMutation = useMutation({
    mutationFn: async () => {
      // Get subject data for API call
      const subjectResponse = await apiRequest('GET', `/api/orders/${orderId}/subject`);
      const subject = await subjectResponse.json();
      
      const response = await apiRequest('POST', '/api/attom/closed-sales/import', {
        orderId,
        subjectAddress: subject.address,
        settings: importSettings
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

  // Add selected sales as comparables mutation
  const addComparablesMutation = useMutation({
    mutationFn: async () => {
      const selectedSaleIds = Object.keys(selectedSales).filter(id => selectedSales[id]);
      const response = await apiRequest('POST', `/api/orders/${orderId}/comps/add-attom-sales`, {
        saleIds: selectedSaleIds,
        applyTimeAdjustments: !!timeAdjustments
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'comps'] });
      setSelectedSales({});
      toast({
        title: "Comparables added",
        description: `Added ${data.count} ATTOM sales as comparable properties.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to add comparables",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const calculateTimeAdjustedPrice = (salePrice: number, saleDate: string, gla?: number): number => {
    if (!timeAdjustments?.pctPerMonth) return salePrice;
    
    // Use shared calculation utility for consistency with backend
    const result = calculateTimeAdjustment(
      salePrice,
      saleDate,
      gla,
      timeAdjustments.effectiveDateISO,
      timeAdjustments.pctPerMonth,
      timeAdjustments.basis || 'salePrice'
    );
    
    return Math.round(result.adjustedPrice || salePrice);
  };

  const handleSaleToggle = (saleId: string, checked: boolean) => {
    setSelectedSales(prev => ({
      ...prev,
      [saleId]: checked
    }));
  };

  const selectedCount = Object.values(selectedSales).filter(Boolean).length;

  if (salesError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load ATTOM closed sales: {salesError.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="h-5 w-5" />
          ATTOM Closed Sales
        </CardTitle>
        <CardDescription>
          Import and select closed sales from ATTOM Data Solutions as comparable properties
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Import Controls */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="radius-comps" className="text-sm font-medium">
                Search Radius (miles)
              </Label>
              <Input
                id="radius-comps"
                type="number"
                step="0.1"
                min="0.1"
                max="3.0"
                value={importSettings.radiusMiles}
                onChange={(e) => setImportSettings(prev => ({...prev, radiusMiles: parseFloat(e.target.value)}))}
                data-testid="input-comps-radius"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="months-comps" className="text-sm font-medium">
                Months Back
              </Label>
              <Input
                id="months-comps"
                type="number"
                min="6"
                max="24"
                value={importSettings.monthsBack}
                onChange={(e) => setImportSettings(prev => ({...prev, monthsBack: Number(e.target.value)}))}
                data-testid="input-comps-months"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="min-price-comps" className="text-sm font-medium">
                Min Sale Price
              </Label>
              <Input
                id="min-price-comps"
                type="number"
                step="10000"
                value={importSettings.minSalePrice}
                onChange={(e) => setImportSettings(prev => ({...prev, minSalePrice: Number(e.target.value)}))}
                data-testid="input-comps-min-price"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-price-comps" className="text-sm font-medium">
                Max Sale Price
              </Label>
              <Input
                id="max-price-comps"
                type="number"
                step="10000"
                value={importSettings.maxSalePrice}
                onChange={(e) => setImportSettings(prev => ({...prev, maxSalePrice: Number(e.target.value)}))}
                data-testid="input-comps-max-price"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => importSalesMutation.mutate()}
              disabled={importSalesMutation.isPending || !rateLimitStatus.canImport}
              variant="outline"
              data-testid="button-import-attom-comps"
            >
              <MapPin className={`h-4 w-4 ${importSalesMutation.isPending ? 'animate-spin' : ''}`} />
              {importSalesMutation.isPending ? 'Importing...' : 
               !rateLimitStatus.canImport ? `Rate limited (${formatRateLimitMessage(rateLimitStatus.minutesRemaining)})` :
               'Import ATTOM Sales'}
            </Button>
            {attomSales && attomSales.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {attomSales.length} sales available
              </Badge>
            )}
          </div>
        </div>

        {salesLoading && (
          <div className="text-center py-8 text-muted-foreground">
            Loading ATTOM closed sales...
          </div>
        )}

        {attomSales && attomSales.length > 0 && (
          <>
            <Separator />
            
            {/* Selection Controls */}
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                Available Sales ({attomSales.length})
              </div>
              <div className="flex items-center gap-2">
                {selectedCount > 0 && (
                  <Badge variant="default">
                    {selectedCount} selected
                  </Badge>
                )}
                <Button
                  onClick={() => addComparablesMutation.mutate()}
                  disabled={selectedCount === 0 || addComparablesMutation.isPending}
                  size="sm"
                  data-testid="button-add-comps"
                >
                  <Plus className="h-4 w-4" />
                  Add as Comparables
                </Button>
              </div>
            </div>

            {/* Time Adjustment Info */}
            {timeAdjustments?.pctPerMonth && (
              <Alert>
                <Calendar className="h-4 w-4" />
                <AlertDescription>
                  Time adjustments will be applied: {(timeAdjustments.pctPerMonth * 100).toFixed(2)}%/month 
                  based on {timeAdjustments.basis} trend analysis.
                </AlertDescription>
              </Alert>
            )}

            {/* Sales List */}
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {attomSales.map((sale, index) => {
                const adjustedPrice = calculateTimeAdjustedPrice(sale.closePrice, sale.closeDate);
                const priceChange = adjustedPrice - sale.closePrice;
                // Use the actual sale ID that the backend expects
                const saleKey = sale.id || `fallback-${index}`;
                
                return (
                  <div key={saleKey} className="border border-border rounded-lg p-4 space-y-3" data-testid={`card-sale-${saleKey}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id={`sale-${saleKey}`}
                          checked={selectedSales[saleKey] || false}
                          onCheckedChange={(checked) => handleSaleToggle(saleKey, checked as boolean)}
                          data-testid={`checkbox-sale-${saleKey}`}
                        />
                        <div className="space-y-1">
                          <div className="font-medium text-sm">
                            {sale.address}{sale.city ? `, ${sale.city}` : ''}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(sale.closeDate).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <Ruler className="h-3 w-3" />
                              {sale.gla?.toLocaleString() || 'N/A'} sq ft
                            </span>
                            <span>N/A beds / N/A baths</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <div className="font-medium text-sm" data-testid={`text-price-${saleKey}`}>
                          ${sale.closePrice.toLocaleString()}
                        </div>
                        {timeAdjustments?.pctPerMonth && priceChange !== 0 && (
                          <div className="text-xs">
                            <div className={`${priceChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {priceChange > 0 ? '+' : ''}${priceChange.toLocaleString()} adj.
                            </div>
                            <div className="font-medium">
                              ${adjustedPrice.toLocaleString()}
                            </div>
                          </div>
                        )}
                        {sale.gla && (
                          <div className="text-xs text-muted-foreground">
                            ${Math.round(sale.closePrice / sale.gla)}/sq ft
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {attomSales && attomSales.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No ATTOM closed sales found. Try importing with different criteria.
          </div>
        )}
      </CardContent>
    </Card>
  );
}