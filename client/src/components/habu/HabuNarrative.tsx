import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Copy, FileText, Edit, Save, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { HabuState } from '@shared/habu';

interface HabuNarrativeProps {
  habuState: HabuState | null;
  onNotesUpdate: (notes: { reviewerNotes?: string; appraiserNotes?: string }) => void;
  isPending: boolean;
}

const USE_CATEGORY_LABELS: Record<string, string> = {
  singleFamily: 'Single Family Residential',
  multiFamily: 'Multi-Family Residential',
  townhome: 'Townhome',
  condo: 'Condominium',
  office: 'Office',
  retail: 'Retail',
  industrial: 'Industrial',
  mixedUse: 'Mixed Use',
  ag: 'Agricultural',
  specialPurpose: 'Special Purpose',
  vacantResidential: 'Vacant Residential',
  vacantCommercial: 'Vacant Commercial'
};

export function HabuNarrative({ habuState, onNotesUpdate, isPending }: HabuNarrativeProps) {
  const [editMode, setEditMode] = useState<'none' | 'appraiser' | 'reviewer'>('none');
  const [appraiserNotes, setAppraiserNotes] = useState(habuState?.appraiserNotes || '');
  const [reviewerNotes, setReviewerNotes] = useState(habuState?.reviewerNotes || '');
  const { toast } = useToast();

  const handleSaveNotes = () => {
    const updates: { reviewerNotes?: string; appraiserNotes?: string } = {};
    
    if (editMode === 'appraiser') {
      updates.appraiserNotes = appraiserNotes;
    } else if (editMode === 'reviewer') {
      updates.reviewerNotes = reviewerNotes;
    }
    
    onNotesUpdate(updates);
    setEditMode('none');
  };

  const handleCopyNarrative = () => {
    if (habuState?.result?.asIfVacantConclusion.narrative) {
      navigator.clipboard.writeText(habuState.result.asIfVacantConclusion.narrative);
      toast({
        title: "Narrative copied",
        description: "HABU narrative has been copied to clipboard.",
      });
    }
  };

  const generateSampleNarrative = (habuState: HabuState): string => {
    if (!habuState.result) return '';

    const conclusion = habuState.result.asIfVacantConclusion;
    const useLabel = USE_CATEGORY_LABELS[conclusion.use] || conclusion.use;
    const confidence = (conclusion.confidence * 100).toFixed(0);
    
    return `Based on the highest and best use analysis as of ${new Date(habuState.inputs.asOfDateISO).toLocaleDateString()}, the subject property's highest and best use as if vacant is **${useLabel}** with a confidence level of ${confidence}%.

This conclusion is supported by comprehensive analysis across the four tests of highest and best use:

**Legally Permissible**: The proposed ${useLabel} use is permitted under the current ${habuState.inputs.zoning.code || 'zoning classification'} and complies with applicable density, height, and setback requirements.

**Physically Possible**: The site characteristics, including ${habuState.inputs.subject.siteAreaSqft?.toLocaleString() || 'adequate'} square feet of land area and available utilities, support the proposed development.

**Financially Feasible**: Current market conditions ${habuState.inputs.marketSignals.monthsOfInventory ? `with ${habuState.inputs.marketSignals.monthsOfInventory} months of inventory` : ''} indicate favorable economic conditions for ${useLabel} development.

**Maximally Productive**: Among the analyzed alternatives, ${useLabel} represents the use that will generate the highest net return to the land and therefore constitutes the property's highest and best use.`;
  };

  if (!habuState) {
    return (
      <Alert>
        <FileText className="w-4 h-4" />
        <AlertDescription>
          Complete the HABU analysis to generate narrative content.
        </AlertDescription>
      </Alert>
    );
  }

  const generatedNarrative = habuState.result?.asIfVacantConclusion.narrative || generateSampleNarrative(habuState);

  return (
    <div className="space-y-6" data-testid="habu-narrative">
      {/* Generated Narrative */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Generated HABU Narrative
              </CardTitle>
              <CardDescription>
                Automatically generated analysis summary based on HABU results
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyNarrative}
                className="flex items-center gap-2"
                data-testid="button-copy-narrative"
              >
                <Copy className="w-4 h-4" />
                Copy
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {habuState.result ? (
            <div className="space-y-4">
              {/* Conclusion Summary */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Highest & Best Use</Label>
                    <div className="text-lg font-semibold text-primary">
                      {USE_CATEGORY_LABELS[habuState.result.asIfVacantConclusion.use] || habuState.result.asIfVacantConclusion.use}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Confidence Level</Label>
                    <div className="text-lg font-semibold text-primary">
                      {(habuState.result.asIfVacantConclusion.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Generated Text */}
              <div className="prose prose-sm max-w-none">
                <div 
                  className="text-foreground leading-relaxed whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ 
                    __html: generatedNarrative.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
                  }}
                />
              </div>

              {/* Analysis Metadata */}
              <Separator />
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div>
                  <span>Generated: </span>
                  <span>{new Date(habuState.result.generatedAt).toLocaleString()}</span>
                </div>
                <div>
                  <span>Version: </span>
                  <Badge variant="outline">{habuState.result.version}</Badge>
                </div>
                <div>
                  <span>Author: </span>
                  <span>{habuState.result.author || 'System'}</span>
                </div>
              </div>
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                Run the HABU analysis to generate the narrative content.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Appraiser Notes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Appraiser Notes</CardTitle>
              <CardDescription>
                Additional analysis notes and customizations to the narrative
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {editMode === 'appraiser' ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditMode('none')}
                    data-testid="button-cancel-appraiser"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveNotes}
                    disabled={isPending}
                    className="flex items-center gap-2"
                    data-testid="button-save-appraiser"
                  >
                    <Save className="w-4 h-4" />
                    {isPending ? 'Saving...' : 'Save'}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditMode('appraiser')}
                  className="flex items-center gap-2"
                  data-testid="button-edit-appraiser"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {editMode === 'appraiser' ? (
            <div className="space-y-2">
              <Textarea
                value={appraiserNotes}
                onChange={(e) => setAppraiserNotes(e.target.value)}
                placeholder="Add your analysis notes, methodological explanations, or narrative customizations..."
                rows={6}
                className="resize-none"
                data-testid="textarea-appraiser-notes"
              />
              <div className="text-sm text-muted-foreground">
                {appraiserNotes.length} characters
              </div>
            </div>
          ) : (
            <div className="min-h-[100px] flex items-center justify-center">
              {appraiserNotes ? (
                <div className="w-full">
                  <div className="prose prose-sm max-w-none">
                    <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                      {appraiserNotes}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No appraiser notes added yet</p>
                  <p className="text-sm">Click Edit to add analysis notes</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reviewer Notes */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Reviewer Notes</CardTitle>
              <CardDescription>
                Review feedback and comments on the HABU analysis
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {editMode === 'reviewer' ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditMode('none')}
                    data-testid="button-cancel-reviewer"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveNotes}
                    disabled={isPending}
                    className="flex items-center gap-2"
                    data-testid="button-save-reviewer"
                  >
                    <Save className="w-4 h-4" />
                    {isPending ? 'Saving...' : 'Save'}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditMode('reviewer')}
                  className="flex items-center gap-2"
                  data-testid="button-edit-reviewer"
                >
                  <Edit className="w-4 h-4" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {editMode === 'reviewer' ? (
            <div className="space-y-2">
              <Textarea
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                placeholder="Add review comments, questions, or feedback on the HABU analysis..."
                rows={6}
                className="resize-none"
                data-testid="textarea-reviewer-notes"
              />
              <div className="text-sm text-muted-foreground">
                {reviewerNotes.length} characters
              </div>
            </div>
          ) : (
            <div className="min-h-[100px] flex items-center justify-center">
              {reviewerNotes ? (
                <div className="w-full">
                  <div className="prose prose-sm max-w-none">
                    <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                      {reviewerNotes}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No reviewer notes added yet</p>
                  <p className="text-sm">Click Edit to add review feedback</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle>Export Options</CardTitle>
          <CardDescription>
            Export HABU analysis for use in final reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleCopyNarrative}
              disabled={!habuState.result}
              className="flex items-center gap-2"
              data-testid="button-export-narrative"
            >
              <Copy className="w-4 h-4" />
              Copy Narrative
            </Button>
            <Button
              variant="outline"
              disabled={!habuState.result}
              className="flex items-center gap-2"
              data-testid="button-export-summary"
            >
              <FileText className="w-4 h-4" />
              Export Summary
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}