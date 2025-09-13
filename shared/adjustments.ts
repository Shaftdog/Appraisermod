export type AttrKey =
  | 'gla' | 'bed' | 'bath' | 'garage' | 'lotSize' | 'age' | 'quality' | 'condition' | 'view' | 'pool';

export interface EngineWeight { 
  engine: 'regression' | 'cost' | 'paired'; 
  weight: number; // 0..1 normalized
}

export interface AttrAdjustment {
  key: AttrKey;
  // per-engine suggestion (currency per unit, e.g., $/SF for GLA, $ per bath, or % for condition)
  regression?: { 
    value: number; 
    lo: number; 
    hi: number; 
    n: number; 
    r2?: number; 
  };
  cost?: { 
    value: number; 
    lo: number; 
    hi: number; 
    basisNote?: string; 
  };
  paired?: { 
    value: number; 
    lo: number; 
    hi: number; 
    nPairs: number; 
  };
  // chosen value after blending + user nudges
  chosen: { 
    value: number; 
    source: 'blend' | 'manual'; 
    note?: string; 
  };
  unit: '$/sf' | '$/unit' | '$' | '%';
  direction: 'additive' | 'multiplicative'; // $ or % model
  provenance: Array<{engine: 'regression' | 'cost' | 'paired'; ref: string}>; // IDs for audit
  locked?: boolean; // user can lock to prevent overwrite on recompute
}

export interface EngineSettings {
  weights: EngineWeight[]; // normalized; default regression 0.5, cost 0.25, paired 0.25
  decimalPlaces?: number;  // display precision
  capPctPerAttr?: number;  // optional guardrail for % attrs
}

export interface SubjectProperty {
  gla: number;
  bed: number;
  bath: number;
  garage?: number;
  lotSize?: number;
  age?: number;
  quality?: number;
  condition?: number;
  pool?: boolean;
  view?: number;
}

export interface AdjustmentRunInput {
  orderId: string;
  compIds: string[];           // which comps to evaluate (candidate + primary)
  subject: SubjectProperty;
  marketBasis: 'salePrice' | 'ppsf';
}

export interface AdjustmentRunResult {
  runId: string;
  computedAt: string;
  attrs: AttrAdjustment[];
  settings: EngineSettings;
  input: AdjustmentRunInput;
}

export interface CompAdjustmentLine {
  compId: string;
  lines: Array<{ 
    key: AttrKey; 
    delta: number; 
    rationale: string; 
    unit: string;
  }>; // per-attribute $ delta applied
  subtotal: number;            // sum of lines (time adj NOT included here)
  indicatedValue: number;      // salePrice + timeAdj + subtotal (or ppsf basis → convert)
}

export interface ReconciliationState {
  orderId: string;
  primaryCompIds: string[]; // #1..#3
  compLocks: string[];
  engineSettings: EngineSettings;
  overrideNotes?: string;
  selectedModel: 'salePrice' | 'ppsf';
  primaryWeights?: number[]; // weights for #1, #2, #3 (normalized to 1.0)
}

export interface AdjustmentsBundle {
  run: AdjustmentRunResult;
  compLines: CompAdjustmentLine[];
  reconciliation: ReconciliationState;
}

// Cost baseline types for seed data
export interface CostBaseline {
  gla: { base: number; quality: Record<string, number> }; // $/SF base + quality multipliers
  bed: { base: number; range: [number, number] }; // $ per bedroom
  bath: { base: number; range: [number, number] }; // $ per bathroom
  garage: { base: number; range: [number, number] }; // $ per garage bay
  lotSize: { base: number; threshold: number }; // $/SF above threshold
  pool: { base: number; range: [number, number] }; // $ fixed
  view: Record<string, number>; // view score -> $ premium
  condition: Record<string, number>; // condition score -> % adjustment
}

export interface DepreciationCurve {
  effectiveAge: number;
  totalLife: number;
  method: 'straight-line' | 'age-life';
  adjustmentFactor: number; // 0..1 multiplier for cost approach
}

// Default settings
export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  weights: [
    { engine: 'regression', weight: 0.5 },
    { engine: 'cost', weight: 0.25 },
    { engine: 'paired', weight: 0.25 }
  ],
  decimalPlaces: 0,
  capPctPerAttr: 15
};

// Weight normalization utility
export function normalizeEngineWeights(weights: EngineWeight[]): EngineWeight[] {
  const requiredEngines: Array<'regression' | 'cost' | 'paired'> = ['regression', 'cost', 'paired'];
  
  // Ensure all required engines are present
  const normalizedWeights: EngineWeight[] = [];
  
  for (const engine of requiredEngines) {
    const existing = weights.find(w => w.engine === engine);
    normalizedWeights.push({
      engine,
      weight: existing ? Math.max(0, Math.min(1, existing.weight)) : 0
    });
  }
  
  // Calculate sum and normalize to 1
  const sum = normalizedWeights.reduce((acc, w) => acc + w.weight, 0);
  
  if (sum === 0) {
    // If all weights are 0, use defaults
    return DEFAULT_ENGINE_SETTINGS.weights;
  }
  
  // Normalize to sum to 1
  return normalizedWeights.map(w => ({
    engine: w.engine,
    weight: w.weight / sum
  }));
}

// Attribute metadata
export const ATTR_METADATA: Record<AttrKey, {
  label: string;
  unit: '$/sf' | '$/unit' | '$' | '%';
  direction: 'additive' | 'multiplicative';
  description: string;
}> = {
  gla: {
    label: 'Gross Living Area',
    unit: '$/sf',
    direction: 'additive',
    description: 'Adjustment for differences in square footage'
  },
  bed: {
    label: 'Bedrooms',
    unit: '$/unit',
    direction: 'additive',
    description: 'Adjustment for bedroom count difference'
  },
  bath: {
    label: 'Bathrooms',
    unit: '$/unit',
    direction: 'additive',
    description: 'Adjustment for bathroom count difference'
  },
  garage: {
    label: 'Garage Bays',
    unit: '$/unit',
    direction: 'additive',
    description: 'Adjustment for garage capacity difference'
  },
  lotSize: {
    label: 'Lot Size',
    unit: '$/sf',
    direction: 'additive',
    description: 'Adjustment for lot size difference'
  },
  age: {
    label: 'Age',
    unit: '%',
    direction: 'multiplicative',
    description: 'Adjustment for effective age difference'
  },
  quality: {
    label: 'Quality',
    unit: '%',
    direction: 'multiplicative',
    description: 'Adjustment for construction quality difference'
  },
  condition: {
    label: 'Condition',
    unit: '%',
    direction: 'multiplicative',
    description: 'Adjustment for property condition difference'
  },
  view: {
    label: 'View',
    unit: '$',
    direction: 'additive',
    description: 'Adjustment for view quality difference'
  },
  pool: {
    label: 'Pool',
    unit: '$',
    direction: 'additive',
    description: 'Adjustment for pool presence'
  }
};