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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Building, Calculator, FileText, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { HabuInputsForm } from '@/components/habu/HabuInputsForm';
import { ZoningFetchPanel } from '@/components/habu/ZoningFetchPanel';
import { HabuTestTable } from '@/components/habu/HabuTestTable';
import { HabuWeights } from '@/components/habu/HabuWeights';
import { HabuNarrative } from '@/components/habu/HabuNarrative';
import type { HabuState, HabuResult, HabuInputs, UseCategory } from '@shared/habu';

export default function Habu() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId;
  const [showVersions, setShowVersions] = useState(false);
  const [activeTab, setActiveTab] = useState<'inputs' | 'analysis' | 'narrative'>('inputs');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: order } = useQuery<Order>({
    queryKey: ['/api/orders', orderId],
    enabled: !!orderId
  });

  const { data: habuState, isLoading: habuLoading } = useQuery<HabuState | null>({
    queryKey: ['/api/orders', orderId, 'habu'],
    enabled: !!orderId
  });

  const saveInputsMutation = useMutation({
    mutationFn: async (inputs: HabuInputs) => {
      const response = await apiRequest('PUT', `/api/orders/${orderId}/habu/inputs`, inputs);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'habu'] });
      toast({
        title: "HABU inputs saved",
        description: "Your highest and best use inputs have been saved.",
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

  const computeHabuMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/habu/compute`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'habu'] });
      toast({
        title: "HABU analysis complete",
        description: "Highest and best use analysis has been computed successfully.",
      });
      setActiveTab('analysis');
    },
    onError: (error) => {
      toast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const updateNotesMutation = useMutation({
    mutationFn: async (notes: { reviewerNotes?: string; appraiserNotes?: string }) => {
      const response = await apiRequest('PUT', `/api/orders/${orderId}/habu/notes`, notes);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'habu'] });
      toast({
        title: "Notes updated",
        description: "HABU notes have been saved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const signoffMutation = useMutation({
    mutationFn: async (overrideReason?: string) => {
      const response = await apiRequest('POST', `/api/orders/${orderId}/tabs/habu/signoff`, {
        action: 'sign-appraiser',
        overrideReason
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId] });
      toast({
        title: "Section signed off",
        description: "HABU analysis has been successfully signed off.",
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

  if (!order) return null;

  const tab = order.tabs.habu;
  const hasInputs = habuState?.inputs;
  const hasResult = habuState?.result;

  // Calculate QC status
  const getQcStatus = (): 'green' | 'yellow' | 'red' => {
    if (!hasInputs) return 'red'; // No inputs
    if (!hasResult) return 'yellow'; // Inputs but no analysis
    
    const result = habuState!.result!;
    const topUse = result.asIfVacantConclusion.use;
    const zoningConflict = !habuState!.inputs.zoning.allowedUses.includes(topUse);
    
    if (zoningConflict) return 'red'; // Zoning conflict
    if (result.asIfVacantConclusion.confidence < 0.7) return 'yellow'; // Low confidence
    return 'green'; // All good
  };

  return (
    <div className="p-6" data-testid="page-habu">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2" data-testid="heading-habu">
            Highest & Best Use Analysis
          </h1>
          <p className="text-muted-foreground">
            Comprehensive analysis using the four tests of highest and best use
          </p>
        </div>
        <div className="mt-4 lg:mt-0">
          <Toolbar onVersionsClick={() => setShowVersions(true)} />
        </div>
      </div>

      {/* Status and Sign-off Panel */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Status Panel */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-medium text-foreground mb-4">Section Status</h3>
          <StatusChip status={getQcStatus()} size="lg" data-testid="status-habu" />
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Inputs Complete</span>
              <span className="text-foreground font-medium">
                {hasInputs ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                )}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Analysis Complete</span>
              <span className="text-foreground font-medium">
                {hasResult ? (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                )}
              </span>
            </div>
            {hasResult && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Confidence Level</span>
                <span className="text-foreground font-medium">
                  {(habuState!.result!.asIfVacantConclusion.confidence * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sign-off Panel */}
        <SignoffPanel
          status={tab?.signoff || 'pending'}
          signedBy={tab?.signedBy}
          signedAt={tab?.signedAt}
          overrideReason={tab?.overrideReason}
          onSignoff={(overrideReason) => signoffMutation.mutate(overrideReason)}
          isPending={signoffMutation.isPending}
          data-testid="signoff-habu"
        />
      </div>

      {/* Quick Summary */}
      {hasResult && (
        <Alert className="mb-6">
          <TrendingUp className="w-4 h-4" />
          <AlertDescription>
            <strong>Conclusion:</strong> The highest and best use as if vacant is{' '}
            <strong>{habuState!.result!.asIfVacantConclusion.use}</strong> with{' '}
            {(habuState!.result!.asIfVacantConclusion.confidence * 100).toFixed(0)}% confidence.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inputs" className="flex items-center gap-2" data-testid="tab-inputs">
            <Building className="w-4 h-4" />
            Inputs & Setup
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex items-center gap-2" data-testid="tab-analysis">
            <Calculator className="w-4 h-4" />
            Analysis Results
          </TabsTrigger>
          <TabsTrigger value="narrative" className="flex items-center gap-2" data-testid="tab-narrative">
            <FileText className="w-4 h-4" />
            Narrative
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inputs" className="mt-6">
          <div className="space-y-6">
            {/* Zoning Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="w-5 h-5" />
                  Zoning Information
                </CardTitle>
                <CardDescription>
                  Fetch and configure zoning data for legal permissibility analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ZoningFetchPanel
                  orderId={orderId!}
                  currentZoning={habuState?.inputs?.zoning}
                  currentHabuInputs={habuState?.inputs}
                  onZoningUpdate={() => queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'habu'] })}
                />
              </CardContent>
            </Card>

            {/* HABU Inputs Form */}
            <Card>
              <CardHeader>
                <CardTitle>Subject Property & Market Data</CardTitle>
                <CardDescription>
                  Configure property characteristics and market conditions for analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <HabuInputsForm
                  initialInputs={habuState?.inputs}
                  onSave={(inputs) => saveInputsMutation.mutate(inputs)}
                  isPending={saveInputsMutation.isPending}
                />
              </CardContent>
            </Card>

            {/* Analysis Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Run Analysis</CardTitle>
                <CardDescription>
                  Execute the four-tests analysis to determine highest and best use
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => computeHabuMutation.mutate()}
                  disabled={!hasInputs || computeHabuMutation.isPending}
                  className="w-full"
                  data-testid="button-compute-habu"
                >
                  {computeHabuMutation.isPending ? (
                    <>
                      <Calculator className="w-4 h-4 mr-2 animate-spin" />
                      Computing Analysis...
                    </>
                  ) : (
                    <>
                      <Calculator className="w-4 h-4 mr-2" />
                      Compute HABU Analysis
                    </>
                  )}
                </Button>
                {!hasInputs && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Complete the inputs above before running analysis
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="mt-6">
          {hasResult ? (
            <div className="space-y-6">
              {/* Weights Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle>Test Weights</CardTitle>
                  <CardDescription>
                    Adjust the relative importance of each test in the analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <HabuWeights
                    weights={habuState!.result!.weights}
                    onWeightsChange={async (weights) => {
                      try {
                        // Save updated weights and trigger recomputation
                        const response = await apiRequest('PUT', `/api/orders/${orderId}/habu/weights`, { weights });
                        
                        // Invalidate cache to refresh data
                        queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'habu'] });
                        
                        // Automatically recompute with new weights
                        await computeHabuMutation.mutateAsync();
                        
                        toast({
                          title: "Weights updated",
                          description: "Analysis has been recomputed with updated weights.",
                        });
                      } catch (error) {
                        toast({
                          title: "Update failed",
                          description: "Failed to save weights and recompute analysis.",
                          variant: "destructive",
                        });
                      }
                    }}
                  />
                </CardContent>
              </Card>

              {/* Results Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Analysis Results</CardTitle>
                  <CardDescription>
                    Detailed scores for each use category across the four tests
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <HabuTestTable
                    rankedUses={habuState!.result!.rankedUses}
                    weights={habuState!.result!.weights}
                  />
                </CardContent>
              </Card>

              {/* Conclusions */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>As If Vacant</CardTitle>
                    <CardDescription>Highest and best use assuming the site is vacant</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-center">
                        <Badge variant="outline" className="text-lg px-4 py-2">
                          {habuState!.result!.asIfVacantConclusion.use}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Composite Score</span>
                          <span className="font-medium">
                            {(habuState!.result!.asIfVacantConclusion.composite * 100).toFixed(1)}%
                          </span>
                        </div>
                        <Progress value={habuState!.result!.asIfVacantConclusion.confidence * 100} className="h-2" />
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Confidence</span>
                          <span className="font-medium">
                            {(habuState!.result!.asIfVacantConclusion.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {habuState!.result!.asImprovedConclusion && (
                  <Card>
                    <CardHeader>
                      <CardTitle>As Improved</CardTitle>
                      <CardDescription>Highest and best use considering existing improvements</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="text-center">
                          <Badge variant="outline" className="text-lg px-4 py-2">
                            {habuState!.result!.asImprovedConclusion.use}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Composite Score</span>
                            <span className="font-medium">
                              {(habuState!.result!.asImprovedConclusion.composite * 100).toFixed(1)}%
                            </span>
                          </div>
                          <Progress value={habuState!.result!.asImprovedConclusion.confidence * 100} className="h-2" />
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Confidence</span>
                            <span className="font-medium">
                              {(habuState!.result!.asImprovedConclusion.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <Calculator className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No Analysis Results</h3>
                  <p className="text-muted-foreground mb-4">
                    Complete the inputs and run the HABU analysis to see results here.
                  </p>
                  <Button onClick={() => setActiveTab('inputs')} variant="outline">
                    Go to Inputs
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="narrative" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>HABU Narrative</CardTitle>
              <CardDescription>
                Generated analysis summary and editable narrative for the final report
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HabuNarrative
                habuState={habuState}
                onNotesUpdate={(notes) => updateNotesMutation.mutate(notes)}
                isPending={updateNotesMutation.isPending}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Version Diff Viewer */}
      {showVersions && (
        <VersionDiffViewer
          orderId={orderId!}
          tabKey="habu"
          onClose={() => setShowVersions(false)}
        />
      )}
    </div>
  );
}