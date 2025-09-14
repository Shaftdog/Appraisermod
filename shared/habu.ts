export type UseCategory =
  | 'singleFamily' | 'multiFamily' | 'townhome' | 'condo'
  | 'office' | 'retail' | 'industrial' | 'mixedUse'
  | 'ag' | 'specialPurpose' | 'vacantResidential' | 'vacantCommercial';

export interface ZoningData {
  source: 'manual' | 'provider' | 'countyGIS';
  code?: string;                 // e.g., R-1
  description?: string;
  allowedUses: UseCategory[];    // normalized uses
  minLotSizeSqft?: number;
  maxDensityDUA?: number;        // dwelling units per acre
  maxHeightFt?: number;
  setbacks?: { front?: number; side?: number; rear?: number };
  notes?: string;
  fetchedAt?: string;
  providerRef?: string;          // e.g., 'attom:<id>' in future
}

export interface HabuInputs {
  asOfDateISO: string;
  asIfVacant: boolean;           // toggle view
  subject: {
    siteAreaSqft?: number;
    topography?: 'level'|'sloped'|'irregular';
    utilities?: { water: boolean; sewer: boolean; electric: boolean; gas?: boolean };
    access?: 'arterial'|'collector'|'local'|'easement';
    exposure?: 'corner'|'interior'|'flag';
    gla?: number;                // for as-improved
    yearBuilt?: number;
    condition?: 1|2|3|4|5;      // ordinal similar to your comps
    quality?: 1|2|3|4|5;
    parking?: number;            // spaces/garage bays
  };
  zoning: ZoningData;
  marketSignals: {
    trendPctPerMonth?: number;     // from MCR
    monthsOfInventory?: number;    // from MCR
    spToLpMedian?: number;         // from MCR
    domMedian?: number;            // from MCR
  };
  costSignals?: {
    replacementCostUsdPerSf?: number;  // from Cost approach or manual
    externalObsolPct?: number;         // optional
    physicalDepreciationPct?: number;  // from Cost approach
  };
  candidateUses: UseCategory[];        // prefilled from zoning.allowedUses; editable
}

export interface HabuTestScore {
  label: 'Physically Possible' | 'Legally Permissible' | 'Financially Feasible' | 'Maximally Productive';
  score: number;                 // 0..1
  rationale: string;             // human text
  evidence: string[];            // bullet points; data keys used
}

export interface UseEvaluation {
  use: UseCategory;
  tests: HabuTestScore[];
  composite: number;             // weighted avg of tests
  flags: Array<'zoningConflict'|'utilityConstraint'|'siteConstraint'|'marketWeak'|'costUnfavorable'>;
}

export interface HabuResult {
  asIfVacantConclusion: { use: UseCategory; composite: number; confidence: number; narrative: string };
  asImprovedConclusion?: { use: UseCategory; composite: number; confidence: number; narrative: string };
  rankedUses: UseEvaluation[];
  weights: { physical: number; legal: number; financial: number; productive: number }; // normalized
  version: string;               // '2025.09.1'
  generatedAt: string;
  author?: string;               // user display
}

export interface HabuState {
  orderId: string;
  inputs: HabuInputs;
  result?: HabuResult;
  reviewerNotes?: string;
  appraiserNotes?: string;
  updatedAt: string;
}

// Use category display names
export const USE_CATEGORY_LABELS: Record<UseCategory, string> = {
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

// Minimum lot size requirements by use category (square feet)
const MIN_LOT_SIZES: Record<UseCategory, number> = {
  singleFamily: 5000,
  multiFamily: 10000,
  townhome: 3000,
  condo: 2000,
  office: 8000,
  retail: 6000,
  industrial: 20000,
  mixedUse: 10000,
  ag: 43560, // 1 acre
  specialPurpose: 5000,
  vacantResidential: 5000,
  vacantCommercial: 6000
};

// Demand factors by use category for market analysis
const DEMAND_FACTORS: Record<UseCategory, number> = {
  singleFamily: 0.9,
  multiFamily: 0.85,
  townhome: 0.8,
  condo: 0.75,
  office: 0.7,
  retail: 0.6,
  industrial: 0.65,
  mixedUse: 0.75,
  ag: 0.5,
  specialPurpose: 0.4,
  vacantResidential: 0.8,
  vacantCommercial: 0.6
};

export function scorePhysicallyPossible(inputs: HabuInputs, use: UseCategory): HabuTestScore {
  let score = 1.0;
  const evidence: string[] = [];
  let rationale = '';

  // Site area constraint
  const minLotSize = MIN_LOT_SIZES[use];
  const siteArea = inputs.subject.siteAreaSqft || 0;
  if (siteArea < minLotSize) {
    const penalty = Math.min(0.5, (minLotSize - siteArea) / minLotSize);
    score -= penalty;
    evidence.push(`Site area ${siteArea.toLocaleString()} sqft below minimum ${minLotSize.toLocaleString()} sqft for ${use}`);
  } else {
    evidence.push(`Site area ${siteArea.toLocaleString()} sqft meets minimum requirement`);
  }

  // Topography penalty
  if (inputs.subject.topography === 'sloped') {
    if (['multiFamily', 'office', 'retail', 'industrial'].includes(use)) {
      score -= 0.2;
      evidence.push('Sloped topography constrains dense commercial/multi-family development');
    } else {
      score -= 0.1;
      evidence.push('Sloped topography has minor impact on single-family development');
    }
  } else if (inputs.subject.topography === 'irregular') {
    score -= 0.15;
    evidence.push('Irregular topography creates development constraints');
  }

  // Utilities bonus
  const utilities = inputs.subject.utilities;
  if (utilities) {
    if (utilities.water && utilities.sewer && utilities.electric) {
      score = Math.min(1.0, score + 0.1);
      evidence.push('All essential utilities available');
    } else {
      const missing = [];
      if (!utilities.water) missing.push('water');
      if (!utilities.sewer) missing.push('sewer');
      if (!utilities.electric) missing.push('electric');
      score -= 0.2;
      evidence.push(`Missing utilities: ${missing.join(', ')}`);
    }
  }

  // Access considerations
  if (inputs.subject.access) {
    if (['office', 'retail', 'industrial'].includes(use)) {
      if (inputs.subject.access === 'arterial') {
        score = Math.min(1.0, score + 0.1);
        evidence.push('Arterial access benefits commercial use');
      } else if (inputs.subject.access === 'easement') {
        score -= 0.3;
        evidence.push('Easement access severely limits commercial viability');
      }
    } else if (use === 'singleFamily') {
      if (inputs.subject.access === 'local') {
        score = Math.min(1.0, score + 0.05);
        evidence.push('Local street access preferred for residential');
      }
    }
  }

  score = Math.max(0, Math.min(1, score));

  if (score >= 0.8) {
    rationale = `Site is well-suited for ${USE_CATEGORY_LABELS[use]} development`;
  } else if (score >= 0.6) {
    rationale = `Site has moderate suitability for ${USE_CATEGORY_LABELS[use]} with some constraints`;
  } else if (score >= 0.4) {
    rationale = `Site has significant physical constraints for ${USE_CATEGORY_LABELS[use]}`;
  } else {
    rationale = `Site is physically challenging for ${USE_CATEGORY_LABELS[use]} development`;
  }

  return {
    label: 'Physically Possible',
    score,
    rationale,
    evidence
  };
}

export function scoreLegallyPermissible(inputs: HabuInputs, use: UseCategory): HabuTestScore {
  let score = 0.0;
  const evidence: string[] = [];
  let rationale = '';

  // Primary zoning check
  if (inputs.zoning.allowedUses.includes(use)) {
    score = 1.0;
    evidence.push(`${USE_CATEGORY_LABELS[use]} is permitted in ${inputs.zoning.code || 'current zoning'}`);
    rationale = `${USE_CATEGORY_LABELS[use]} is legally permissible under current zoning`;
  } else {
    score = 0.0;
    evidence.push(`${USE_CATEGORY_LABELS[use]} is NOT permitted in ${inputs.zoning.code || 'current zoning'}`);
    rationale = `${USE_CATEGORY_LABELS[use]} requires zoning variance or rezoning`;
  }

  // Density constraints
  if (score > 0 && inputs.zoning.maxDensityDUA && ['multiFamily', 'townhome', 'condo'].includes(use)) {
    const siteAcres = (inputs.subject.siteAreaSqft || 0) / 43560;
    const maxUnits = inputs.zoning.maxDensityDUA * siteAcres;
    if (maxUnits < 2) {
      score -= 0.2;
      evidence.push(`Density limit ${inputs.zoning.maxDensityDUA} DUA severely constrains multi-family development`);
    } else {
      evidence.push(`Density allows up to ${Math.floor(maxUnits)} units on site`);
    }
  }

  // Height constraints
  if (score > 0 && inputs.zoning.maxHeightFt) {
    if (['office', 'multiFamily'].includes(use) && inputs.zoning.maxHeightFt < 35) {
      score -= 0.15;
      evidence.push(`Height limit ${inputs.zoning.maxHeightFt} ft constrains multi-story development`);
    } else {
      evidence.push(`Height limit ${inputs.zoning.maxHeightFt} ft is adequate for use`);
    }
  }

  // Setback constraints
  if (score > 0 && inputs.zoning.setbacks) {
    const totalSetback = (inputs.zoning.setbacks.front || 0) + 
                        (inputs.zoning.setbacks.rear || 0) + 
                        ((inputs.zoning.setbacks.side || 0) * 2);
    const siteArea = inputs.subject.siteAreaSqft || 0;
    const setbackImpact = totalSetback * 100 / Math.sqrt(siteArea); // rough percentage
    
    if (setbackImpact > 30) {
      score -= 0.1;
      evidence.push('Setback requirements significantly reduce buildable area');
    } else {
      evidence.push('Setback requirements are manageable');
    }
  }

  score = Math.max(0, Math.min(1, score));

  return {
    label: 'Legally Permissible',
    score,
    rationale,
    evidence
  };
}

export function scoreFinanciallyFeasible(inputs: HabuInputs, use: UseCategory): HabuTestScore {
  let score = 0.5; // neutral baseline
  const evidence: string[] = [];
  let rationale = '';

  // Market composite from MCR signals
  let marketComposite = 0.5;
  const signals = inputs.marketSignals;

  if (signals.monthsOfInventory !== undefined) {
    if (signals.monthsOfInventory < 4) {
      marketComposite += 0.2;
      evidence.push(`Low inventory (${signals.monthsOfInventory} months) indicates strong demand`);
    } else if (signals.monthsOfInventory > 8) {
      marketComposite -= 0.2;
      evidence.push(`High inventory (${signals.monthsOfInventory} months) indicates weak demand`);
    } else {
      evidence.push(`Moderate inventory (${signals.monthsOfInventory} months)`);
    }
  }

  if (signals.trendPctPerMonth !== undefined) {
    const annualTrend = signals.trendPctPerMonth * 12;
    if (annualTrend > 5) {
      marketComposite += 0.15;
      evidence.push(`Strong price appreciation (${annualTrend.toFixed(1)}% annually)`);
    } else if (annualTrend < -2) {
      marketComposite -= 0.15;
      evidence.push(`Price decline (${annualTrend.toFixed(1)}% annually)`);
    } else {
      evidence.push(`Stable price trend (${annualTrend.toFixed(1)}% annually)`);
    }
  }

  if (signals.spToLpMedian !== undefined) {
    if (signals.spToLpMedian > 0.98) {
      marketComposite += 0.1;
      evidence.push(`Strong sale-to-list ratio (${(signals.spToLpMedian * 100).toFixed(1)}%)`);
    } else if (signals.spToLpMedian < 0.92) {
      marketComposite -= 0.1;
      evidence.push(`Weak sale-to-list ratio (${(signals.spToLpMedian * 100).toFixed(1)}%)`);
    }
  }

  marketComposite = Math.max(0, Math.min(1, marketComposite));

  // Use-specific demand factor
  const demandFactor = DEMAND_FACTORS[use];
  const adjustedMarket = marketComposite * demandFactor;
  evidence.push(`Use-specific demand factor: ${(demandFactor * 100).toFixed(0)}%`);

  score = adjustedMarket;

  // Cost burden adjustment for as-improved analysis
  if (!inputs.asIfVacant && inputs.costSignals) {
    let costBurden = 0;

    if (inputs.costSignals.physicalDepreciationPct) {
      costBurden += inputs.costSignals.physicalDepreciationPct / 100;
      evidence.push(`Physical depreciation: ${inputs.costSignals.physicalDepreciationPct}%`);
    }

    if (inputs.costSignals.externalObsolPct) {
      costBurden += inputs.costSignals.externalObsolPct / 100;
      evidence.push(`External obsolescence: ${inputs.costSignals.externalObsolPct}%`);
    }

    score = Math.max(0, score - costBurden);
  }

  score = Math.max(0, Math.min(1, score));

  if (score >= 0.7) {
    rationale = `${USE_CATEGORY_LABELS[use]} appears financially feasible with strong market support`;
  } else if (score >= 0.5) {
    rationale = `${USE_CATEGORY_LABELS[use]} has moderate financial feasibility`;
  } else if (score >= 0.3) {
    rationale = `${USE_CATEGORY_LABELS[use]} faces financial challenges in current market`;
  } else {
    rationale = `${USE_CATEGORY_LABELS[use]} appears financially unfeasible`;
  }

  return {
    label: 'Financially Feasible',
    score,
    rationale,
    evidence
  };
}

export function scoreMaxProductive(evaluations: UseEvaluation[]): UseEvaluation[] {
  // Sort by composite score descending
  const sorted = [...evaluations].sort((a, b) => b.composite - a.composite);
  
  // Assign max productive scores based on rank
  return sorted.map((evaluation, index) => {
    const maxProductiveTest = evaluation.tests.find(t => t.label === 'Maximally Productive');
    if (maxProductiveTest) {
      // Top use gets 1.0, others get decreasing scores
      const rankScore = Math.max(0, 1 - (index * 0.2));
      maxProductiveTest.score = rankScore;
      maxProductiveTest.rationale = index === 0 
        ? `Highest composite score among evaluated uses`
        : `Ranked #${index + 1} among evaluated uses`;
      maxProductiveTest.evidence = [`Composite rank: ${index + 1} of ${sorted.length}`];
    }
    return evaluation;
  });
}

export function computeUseEvaluation(
  inputs: HabuInputs, 
  use: UseCategory, 
  weights: { physical: number; legal: number; financial: number; productive: number }
): UseEvaluation {
  const tests: HabuTestScore[] = [
    scorePhysicallyPossible(inputs, use),
    scoreLegallyPermissible(inputs, use),
    scoreFinanciallyFeasible(inputs, use),
    { label: 'Maximally Productive', score: 0, rationale: 'To be computed after ranking', evidence: [] }
  ];

  // Calculate weighted composite
  const composite = 
    weights.physical * tests[0].score +
    weights.legal * tests[1].score +
    weights.financial * tests[2].score +
    weights.productive * tests[3].score;

  // Generate flags
  const flags: UseEvaluation['flags'] = [];
  
  if (!inputs.zoning.allowedUses.includes(use)) {
    flags.push('zoningConflict');
  }
  
  if (inputs.subject.utilities && 
      (!inputs.subject.utilities.water || !inputs.subject.utilities.sewer || !inputs.subject.utilities.electric)) {
    flags.push('utilityConstraint');
  }
  
  if ((inputs.subject.siteAreaSqft || 0) < MIN_LOT_SIZES[use]) {
    flags.push('siteConstraint');
  }
  
  if (tests[2].score < 0.4) {
    flags.push('marketWeak');
  }
  
  if (!inputs.asIfVacant && inputs.costSignals && 
      ((inputs.costSignals.physicalDepreciationPct || 0) + (inputs.costSignals.externalObsolPct || 0)) > 30) {
    flags.push('costUnfavorable');
  }

  return {
    use,
    tests,
    composite,
    flags
  };
}

export function generateNarrative(state: HabuState): string {
  if (!state.result) return '';

  const { asIfVacantConclusion, asImprovedConclusion, rankedUses } = state.result;
  const inputs = state.inputs;

  let narrative = '';

  // As-if-vacant analysis
  narrative += `Based on the highest and best use analysis as of ${new Date(inputs.asOfDateISO).toLocaleDateString()}, `;
  narrative += `the subject property's highest and best use as if vacant is **${USE_CATEGORY_LABELS[asIfVacantConclusion.use]}** `;
  narrative += `with a confidence level of ${(asIfVacantConclusion.confidence * 100).toFixed(0)}%.\\n\\n`;

  // Key factors
  const topUse = rankedUses[0];
  if (topUse) {
    narrative += `This conclusion is supported by the following analysis:\\n`;
    
    const legalTest = topUse.tests.find(t => t.label === 'Legally Permissible');
    if (legalTest && legalTest.score > 0.8) {
      narrative += `• **Legal Permissibility**: ${legalTest.rationale}\\n`;
    }
    
    const physicalTest = topUse.tests.find(t => t.label === 'Physically Possible');
    if (physicalTest && physicalTest.score > 0.6) {
      narrative += `• **Physical Feasibility**: ${physicalTest.rationale}\\n`;
    }
    
    const financialTest = topUse.tests.find(t => t.label === 'Financially Feasible');
    if (financialTest) {
      narrative += `• **Financial Feasibility**: ${financialTest.rationale}\\n`;
    }
  }

  // Market context
  if (inputs.marketSignals.monthsOfInventory !== undefined) {
    narrative += `\\nCurrent market conditions show ${inputs.marketSignals.monthsOfInventory} months of inventory, `;
    if (inputs.marketSignals.monthsOfInventory < 4) {
      narrative += `indicating a seller's market with strong demand.`;
    } else if (inputs.marketSignals.monthsOfInventory > 8) {
      narrative += `indicating a buyer's market with weaker demand.`;
    } else {
      narrative += `indicating balanced market conditions.`;
    }
  }

  // As-improved analysis (if different)
  if (asImprovedConclusion && asImprovedConclusion.use !== asIfVacantConclusion.use) {
    narrative += `\\n\\nThe highest and best use as improved is **${USE_CATEGORY_LABELS[asImprovedConclusion.use]}**, `;
    narrative += `reflecting the current improvements on the property. `;
    
    if (asImprovedConclusion.composite < asIfVacantConclusion.composite) {
      narrative += `However, the as-if-vacant analysis suggests potential for redevelopment to `;
      narrative += `${USE_CATEGORY_LABELS[asIfVacantConclusion.use]} would yield higher value.`;
    }
  }

  return narrative;
}

export function createDefaultWeights() {
  return {
    physical: 0.25,
    legal: 0.35,
    financial: 0.30,
    productive: 0.10
  };
}

export function normalizeWeights(weights: { physical: number; legal: number; financial: number; productive: number }) {
  const sum = weights.physical + weights.legal + weights.financial + weights.productive;
  if (sum === 0) return createDefaultWeights();
  
  return {
    physical: weights.physical / sum,
    legal: weights.legal / sum,
    financial: weights.financial / sum,
    productive: weights.productive / sum
  };
}