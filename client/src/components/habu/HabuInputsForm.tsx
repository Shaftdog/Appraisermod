import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Calendar, Home, Settings, TrendingUp } from 'lucide-react';
import type { HabuInputs, UseCategory } from '@shared/habu';
import { habuInputsSchema } from '@shared/habu';

interface HabuInputsFormProps {
  initialInputs?: HabuInputs;
  onSave: (inputs: HabuInputs) => void;
  isPending: boolean;
}

// Form type derived from schema
type HabuInputsFormValues = z.infer<typeof habuInputsSchema>;

// Default form values
const getDefaultValues = (initialInputs?: HabuInputs): HabuInputsFormValues => ({
  asOfDateISO: initialInputs?.asOfDateISO || new Date().toISOString().split('T')[0],
  asIfVacant: initialInputs?.asIfVacant ?? true,
  subject: {
    siteAreaSqft: initialInputs?.subject.siteAreaSqft,
    topography: initialInputs?.subject.topography || 'level',
    utilities: {
      water: initialInputs?.subject.utilities?.water ?? true,
      sewer: initialInputs?.subject.utilities?.sewer ?? true,
      electric: initialInputs?.subject.utilities?.electric ?? true,
      gas: initialInputs?.subject.utilities?.gas ?? false
    },
    access: initialInputs?.subject.access || 'local',
    exposure: initialInputs?.subject.exposure || 'interior',
    gla: initialInputs?.subject.gla,
    yearBuilt: initialInputs?.subject.yearBuilt,
    condition: (initialInputs?.subject.condition as 1 | 2 | 3 | 4 | 5) || 4,
    quality: (initialInputs?.subject.quality as 1 | 2 | 3 | 4 | 5) || 4,
    parking: initialInputs?.subject.parking
  },
  zoning: {
    source: initialInputs?.zoning.source || 'manual',
    code: initialInputs?.zoning.code,
    description: initialInputs?.zoning.description,
    allowedUses: initialInputs?.zoning.allowedUses || ['singleFamily'],
    minLotSizeSqft: initialInputs?.zoning.minLotSizeSqft,
    maxDensityDUA: initialInputs?.zoning.maxDensityDUA,
    maxHeightFt: initialInputs?.zoning.maxHeightFt,
    setbacks: initialInputs?.zoning.setbacks,
    notes: initialInputs?.zoning.notes,
    fetchedAt: initialInputs?.zoning.fetchedAt,
    providerRef: initialInputs?.zoning.providerRef
  },
  marketSignals: {
    trendPctPerMonth: initialInputs?.marketSignals.trendPctPerMonth,
    monthsOfInventory: initialInputs?.marketSignals.monthsOfInventory,
    spToLpMedian: initialInputs?.marketSignals.spToLpMedian,
    domMedian: initialInputs?.marketSignals.domMedian
  },
  costSignals: {
    replacementCostUsdPerSf: initialInputs?.costSignals?.replacementCostUsdPerSf,
    externalObsolPct: initialInputs?.costSignals?.externalObsolPct,
    physicalDepreciationPct: initialInputs?.costSignals?.physicalDepreciationPct
  },
  candidateUses: initialInputs?.candidateUses || ['singleFamily', 'multiFamily', 'townhome']
});

const USE_CATEGORIES: UseCategory[] = [
  'singleFamily', 'multiFamily', 'townhome', 'condo',
  'office', 'retail', 'industrial', 'mixedUse',
  'ag', 'specialPurpose', 'vacantResidential', 'vacantCommercial'
];

const USE_CATEGORY_LABELS: Record<UseCategory, string> = {
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

export function HabuInputsForm({ initialInputs, onSave, isPending }: HabuInputsFormProps) {
  const form = useForm<HabuInputsFormValues>({
    resolver: zodResolver(habuInputsSchema),
    mode: 'onChange',
    defaultValues: getDefaultValues(initialInputs)
  });

  // Update form when initialInputs change
  useEffect(() => {
    if (initialInputs) {
      form.reset(getDefaultValues(initialInputs));
    }
  }, [initialInputs, form]);

  const handleSubmit = (values: HabuInputsFormValues) => {
    onSave(values);
  };

  const toggleCandidateUse = (use: UseCategory) => {
    const currentUses = form.getValues('candidateUses');
    const newUses = currentUses.includes(use)
      ? currentUses.filter(u => u !== use)
      : [...currentUses, use];
    form.setValue('candidateUses', newUses, { shouldValidate: true });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6" data-testid="form-habu-inputs">
        {/* Analysis Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Analysis Setup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="asOfDateISO"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>As Of Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-as-of-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="asIfVacant"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>As If Vacant Analysis</FormLabel>
                    <FormControl>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-as-if-vacant"
                        />
                        <span className="text-sm text-muted-foreground">
                          {field.value ? 'As if vacant' : 'As improved'}
                        </span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Subject Property */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              Subject Property Characteristics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="subject.siteAreaSqft"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site Area (sq ft)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 8000"
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                        data-testid="input-site-area"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="subject.topography"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Topography</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-topography">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="level">Level</SelectItem>
                        <SelectItem value="sloped">Sloped</SelectItem>
                        <SelectItem value="irregular">Irregular</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="subject.access"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Access</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-access">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="arterial">Arterial Road</SelectItem>
                        <SelectItem value="collector">Collector</SelectItem>
                        <SelectItem value="local">Local Street</SelectItem>
                        <SelectItem value="easement">Easement</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <div>
              <Label className="text-base font-medium mb-3 block">Utilities</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {['water', 'sewer', 'electric', 'gas'].map((utility) => (
                  <FormField
                    key={utility}
                    control={form.control}
                    name={`subject.utilities.${utility}` as any}
                    render={({ field }) => (
                      <FormItem className="flex items-center space-x-2">
                        <FormControl>
                          <Switch
                            checked={field.value || false}
                            onCheckedChange={field.onChange}
                            data-testid={`switch-${utility}`}
                          />
                        </FormControl>
                        <FormLabel className="capitalize">{utility}</FormLabel>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>

            {!form.watch('asIfVacant') && (
              <>
                <Separator />
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="subject.gla"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>GLA (sq ft)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="e.g., 2400"
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                            data-testid="input-gla"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="subject.yearBuilt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Year Built</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="e.g., 1998"
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                            data-testid="input-year-built"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="subject.parking"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Parking Spaces</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="e.g., 2"
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                            data-testid="input-parking"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="subject.condition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Condition (1-5)</FormLabel>
                        <Select value={field.value?.toString()} onValueChange={(value) => field.onChange(Number(value) as 1 | 2 | 3 | 4 | 5)}>
                          <FormControl>
                            <SelectTrigger data-testid="select-condition">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">1 - Poor</SelectItem>
                            <SelectItem value="2">2 - Fair</SelectItem>
                            <SelectItem value="3">3 - Average</SelectItem>
                            <SelectItem value="4">4 - Good</SelectItem>
                            <SelectItem value="5">5 - Excellent</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="subject.quality"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quality (1-5)</FormLabel>
                        <Select value={field.value?.toString()} onValueChange={(value) => field.onChange(Number(value) as 1 | 2 | 3 | 4 | 5)}>
                          <FormControl>
                            <SelectTrigger data-testid="select-quality">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">1 - Low</SelectItem>
                            <SelectItem value="2">2 - Fair</SelectItem>
                            <SelectItem value="3">3 - Average</SelectItem>
                            <SelectItem value="4">4 - Good</SelectItem>
                            <SelectItem value="5">5 - High</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Market Signals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Market Signals
            </CardTitle>
            <CardDescription>
              Market conditions that influence financial feasibility
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="marketSignals.trendPctPerMonth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price Trend (% per month)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="e.g., 0.5"
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                        data-testid="input-trend-pct"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="marketSignals.monthsOfInventory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Months of Inventory</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="e.g., 4.2"
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                        data-testid="input-months-inventory"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="marketSignals.spToLpMedian"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sale to List Ratio</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.001"
                        placeholder="e.g., 0.985"
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                        data-testid="input-sp-to-lp"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="marketSignals.domMedian"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Days on Market (median)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 28"
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                        data-testid="input-dom-median"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Cost Signals (only for as-improved) */}
        {!form.watch('asIfVacant') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Cost Signals
              </CardTitle>
              <CardDescription>
                Cost approach indicators for as-improved analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="costSignals.replacementCostUsdPerSf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Replacement Cost ($/sq ft)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="e.g., 125"
                          {...field}
                          value={field.value || ''}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                          data-testid="input-replacement-cost"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="costSignals.physicalDepreciationPct"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Physical Depreciation (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="e.g., 15.5"
                          {...field}
                          value={field.value || ''}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                          data-testid="input-physical-depreciation"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="costSignals.externalObsolPct"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>External Obsolescence (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          placeholder="e.g., 5.0"
                          {...field}
                          value={field.value || ''}
                          onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                          data-testid="input-external-obsolescence"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Candidate Uses */}
        <Card>
          <CardHeader>
            <CardTitle>Candidate Uses for Analysis</CardTitle>
            <CardDescription>
              Select the uses to evaluate in the highest and best use analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {USE_CATEGORIES.map((use) => {
                const isSelected = form.watch('candidateUses').includes(use);
                return (
                  <Button
                    key={use}
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    className="h-auto p-3 text-left justify-start"
                    onClick={() => toggleCandidateUse(use)}
                    data-testid={`button-candidate-use-${use}`}
                  >
                    <div className="text-sm">
                      {USE_CATEGORY_LABELS[use]}
                    </div>
                  </Button>
                );
              })}
            </div>
            {form.watch('candidateUses').length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                Please select at least one use category for analysis.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isPending || !form.formState.isValid}
            className="min-w-32"
            data-testid="button-save-habu-inputs"
          >
            {isPending ? 'Saving...' : 'Save Inputs'}
          </Button>
        </div>
      </form>
    </Form>
  );
}