import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'wouter';
import { StatusChip } from '@/components/StatusChip';
import { SignoffPanel } from '@/components/SignoffPanel';
import { VersionDiffViewer } from '@/components/VersionDiffViewer';
import { Toolbar } from '@/components/Toolbar';
import { Order } from '@/types';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, ExternalLink } from 'lucide-react';
import type { AttomProperty } from '@shared/attom';

export default function Subject() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId;
  const [showVersions, setShowVersions] = useState(false);
  const [attomLookup, setAttomLookup] = useState({
    addressLine1: '',
    city: '',
    zip: ''
  });
  const [attomResult, setAttomResult] = useState<AttomProperty | null>(null);
  const [formData, setFormData] = useState({
    legalDescription: '',
    zoning: '',
    address: '',
    yearBuilt: '',
    gla: '',
    bedrooms: '',
    bathrooms: '',
    lotSize: ''
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: order } = useQuery<Order>({
    queryKey: ['/api/orders', orderId],
    enabled: !!orderId
  });

  // Initialize form data from current tab data
  const initializeFormData = (tabData: any) => {
    setFormData({
      legalDescription: tabData?.legalDescription || '',
      zoning: tabData?.zoning || '',
      address: tabData?.address || '',
      yearBuilt: tabData?.yearBuilt || '',
      gla: tabData?.gla || '',
      bedrooms: tabData?.bedrooms || '',
      bathrooms: tabData?.bathrooms || '',
      lotSize: tabData?.lotSize || ''
    });
  };

  // Initialize form when order data loads
  if (order?.tabs.subject?.currentData && formData.legalDescription === '' && formData.zoning === '') {
    initializeFormData(order.tabs.subject.currentData);
  }

  const signoffMutation = useMutation({
    mutationFn: async (overrideReason?: string) => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/tabs/subject/signoff`, {
        action: 'sign-appraiser',
        overrideReason
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
      toast({
        title: "Section signed off",
        description: "Subject has been successfully signed off.",
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

  const attomLookupMutation = useMutation({
    mutationFn: async (lookupData: { addressLine1: string; city: string; state?: string; zip?: string }) => {
      const response = await apiRequest('POST', '/api/attom/subject/lookup', lookupData);
      return response.json();
    },
    onSuccess: (data) => {
      setAttomResult(data.subject);
      toast({
        title: "Property found",
        description: "ATTOM property data loaded successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Lookup failed",
        description: error.message || "Could not find property in ATTOM database.",
        variant: "destructive",
      });
    }
  });

  const updateSubjectMutation = useMutation({
    mutationFn: async (updateData: typeof formData) => {
      const response = await apiRequest('PUT', `/api/orders/${orderId}/tabs/subject`, updateData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
      toast({
        title: "Subject updated",
        description: "Subject property data has been saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to save subject property data.",
        variant: "destructive",
      });
    }
  });

  const handleAttomLookup = () => {
    if (!attomLookup.addressLine1.trim() || !attomLookup.city.trim()) {
      toast({
        title: "Missing information",
        description: "Please enter at least an address and city.",
        variant: "destructive",
      });
      return;
    }
    
    attomLookupMutation.mutate({
      addressLine1: attomLookup.addressLine1,
      city: attomLookup.city,
      state: 'FL',
      zip: attomLookup.zip
    });
  };

  const applyAttomDataToForm = () => {
    if (!attomResult) return;
    
    const updatedFormData = {
      ...formData,
      address: attomResult.address ? `${attomResult.address.line1 || ''}, ${attomResult.address.city || ''}, ${attomResult.address.state || ''} ${attomResult.address.zip || ''}`.trim().replace(/^,\s*|,\s*$/, '') : formData.address,
      yearBuilt: attomResult.char?.yearBuilt?.toString() || formData.yearBuilt,
      gla: attomResult.char?.sqft?.toString() || formData.gla,
      bedrooms: attomResult.char?.beds?.toString() || formData.bedrooms,
      bathrooms: attomResult.char?.baths?.toString() || formData.bathrooms,
      lotSize: attomResult.char?.lotSizeSqft?.toString() || formData.lotSize
    };
    
    setFormData(updatedFormData);
    updateSubjectMutation.mutate(updatedFormData);
    
    toast({
      title: "Fields populated",
      description: "ATTOM data has been applied to the subject form and saved.",
    });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSubjectMutation.mutate(formData);
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!order) return null;

  const tab = order.tabs.subject;
  if (!tab) return null;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2" data-testid="heading-subject">
            Subject Property
          </h1>
          <p className="text-muted-foreground">
            Detailed information about the subject property
          </p>
        </div>
        <div className="mt-4 lg:mt-0">
          <Toolbar onVersionsClick={() => setShowVersions(true)} />
        </div>
      </div>

      {/* Status and Sign-off Panel */}
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
        </div>

        <SignoffPanel
          signoff={tab.signoff}
          status={tab.qc.status}
          openIssues={tab.qc.openIssues}
          onSignoff={signoffMutation.mutateAsync}
        />
      </div>

      {/* ATTOM Lookup Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Lookup from ATTOM
          </CardTitle>
          <CardDescription>
            Search for property information using ATTOM Data Solutions public records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Address</label>
              <Input
                placeholder="123 Main Street"
                value={attomLookup.addressLine1}
                onChange={(e) => setAttomLookup(prev => ({ ...prev, addressLine1: e.target.value }))}
                data-testid="input-attom-address"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">City</label>
              <Input
                placeholder="Orlando"
                value={attomLookup.city}
                onChange={(e) => setAttomLookup(prev => ({ ...prev, city: e.target.value }))}
                data-testid="input-attom-city"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">ZIP Code</label>
              <Input
                placeholder="32801"
                value={attomLookup.zip}
                onChange={(e) => setAttomLookup(prev => ({ ...prev, zip: e.target.value }))}
                data-testid="input-attom-zip"
              />
            </div>
          </div>
          
          <Button 
            onClick={handleAttomLookup}
            disabled={attomLookupMutation.isPending}
            className="mb-4"
            data-testid="button-attom-lookup"
          >
            {attomLookupMutation.isPending ? 'Searching...' : 'Search ATTOM Database'}
          </Button>
          
          {attomResult && (
            <div className="border border-border rounded-lg p-4 bg-muted/50">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">ATTOM Property Data</h4>
                <Badge variant="secondary" className="text-xs">
                  Source: ATTOM Data Solutions
                </Badge>
              </div>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div data-testid="attom-address">
                  <span className="font-medium">Address:</span> {attomResult.address?.line1}, {attomResult.address?.city}, {attomResult.address?.state} {attomResult.address?.zip}
                </div>
                <div data-testid="attom-year-built">
                  <span className="font-medium">Year Built:</span> {attomResult.char?.yearBuilt || 'N/A'}
                </div>
                <div data-testid="attom-gla">
                  <span className="font-medium">Living Area:</span> {attomResult.char?.sqft ? `${attomResult.char.sqft.toLocaleString()} sq ft` : 'N/A'}
                </div>
                <div data-testid="attom-lot-size">
                  <span className="font-medium">Lot Size:</span> {attomResult.char?.lotSizeSqft ? `${attomResult.char.lotSizeSqft.toLocaleString()} sq ft` : 'N/A'}
                </div>
                <div data-testid="attom-bedrooms">
                  <span className="font-medium">Bedrooms:</span> {attomResult.char?.beds || 'N/A'}
                </div>
                <div data-testid="attom-bathrooms">
                  <span className="font-medium">Bathrooms:</span> {attomResult.char?.baths || 'N/A'}
                </div>
                {attomResult.lastSale?.price && (
                  <div data-testid="attom-last-sale">
                    <span className="font-medium">Last Sale:</span> ${attomResult.lastSale.price.toLocaleString()} ({attomResult.lastSale.date})
                  </div>
                )}
                {attomResult.assessment?.totalValue && (
                  <div data-testid="attom-assessed-value">
                    <span className="font-medium">Assessed Value:</span> ${attomResult.assessment.totalValue.toLocaleString()} ({attomResult.assessment.taxYear})
                  </div>
                )}
              </div>
              <Button 
                onClick={applyAttomDataToForm}
                className="mt-4"
                data-testid="button-apply-attom-data"
              >
                Apply to Form
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subject Property Form Content */}
      <form onSubmit={handleFormSubmit} className="bg-card border border-border rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-medium text-foreground">Property Details</h3>
          <Button 
            type="submit" 
            disabled={updateSubjectMutation.isPending}
            data-testid="button-save-subject"
          >
            {updateSubjectMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Address</label>
            <Input
              value={formData.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              placeholder="Property address"
              data-testid="input-subject-address"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Year Built</label>
            <Input
              value={formData.yearBuilt}
              onChange={(e) => handleInputChange('yearBuilt', e.target.value)}
              placeholder="1995"
              data-testid="input-year-built"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Gross Living Area (sq ft)</label>
            <Input
              value={formData.gla}
              onChange={(e) => handleInputChange('gla', e.target.value)}
              placeholder="2,400"
              data-testid="input-gla"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Bedrooms</label>
            <Input
              value={formData.bedrooms}
              onChange={(e) => handleInputChange('bedrooms', e.target.value)}
              placeholder="4"
              data-testid="input-bedrooms"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Bathrooms</label>
            <Input
              value={formData.bathrooms}
              onChange={(e) => handleInputChange('bathrooms', e.target.value)}
              placeholder="3"
              data-testid="input-bathrooms"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Lot Size (sq ft)</label>
            <Input
              value={formData.lotSize}
              onChange={(e) => handleInputChange('lotSize', e.target.value)}
              placeholder="8,400"
              data-testid="input-lot-size"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-2">Legal Description</label>
            <textarea 
              className="w-full p-3 border border-border rounded-lg resize-none" 
              rows={3}
              value={formData.legalDescription}
              onChange={(e) => handleInputChange('legalDescription', e.target.value)}
              placeholder="Lot 15, Block B, Sunrise Hills Subdivision, according to the plat thereof recorded in Volume 45, Page 123 of the Plat Records of Travis County, Texas."
              data-testid="textarea-legal-description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Zoning</label>
            <Input
              value={formData.zoning}
              onChange={(e) => handleInputChange('zoning', e.target.value)}
              placeholder="SF-3 Single Family Residential"
              data-testid="input-zoning"
            />
          </div>
        </div>
      </form>

      {/* Version Diff Viewer */}
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
