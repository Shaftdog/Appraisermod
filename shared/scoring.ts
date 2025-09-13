import type { WeightSet, ConstraintSet, CompProperty } from '@shared/schema';

// Utility function to clamp values between min and max
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Normalize weights to sum to 1
export function normalizeWeights(weights: WeightSet): WeightSet {
  const sum = Object.values(weights).reduce((acc, val) => acc + val, 0);
  
  if (sum === 0) {
    // If all weights are 0, return equal weights
    return {
      distance: 0.2,
      recency: 0.2,
      gla: 0.2,
      quality: 0.2,
      condition: 0.2
    };
  }
  
  return {
    distance: weights.distance / sum,
    recency: weights.recency / sum,
    gla: weights.gla / sum,
    quality: weights.quality / sum,
    condition: weights.condition / sum
  };
}

// Calculate percentage breakdown of weights
export function calculateWeightPercentages(weights: WeightSet): WeightSet {
  const sum = Object.values(weights).reduce((acc, val) => acc + val, 0);
  
  if (sum === 0) {
    return { distance: 0, recency: 0, gla: 0, quality: 0, condition: 0 };
  }
  
  return {
    distance: Math.round((weights.distance / sum) * 100),
    recency: Math.round((weights.recency / sum) * 100),
    gla: Math.round((weights.gla / sum) * 100),
    quality: Math.round((weights.quality / sum) * 100),
    condition: Math.round((weights.condition / sum) * 100)
  };
}

// Subject property characteristics (mock for now)
const SUBJECT_PROPERTY = {
  gla: 1875, // Gross Living Area sq ft
  quality: 4, // 1-5 rating
  condition: 4 // 1-5 rating
};

// Calculate similarity scores for a comparable property
export function calculateSimilarityScores(
  comp: CompProperty,
  constraints: ConstraintSet
): {
  distance: number;
  recency: number;
  gla: number;
  quality: number;
  condition: number;
} {
  // Distance similarity: 1 - normalized distance within cap
  const distanceSimilarity = 1 - clamp(
    comp.distanceMiles / constraints.distanceCapMiles,
    0,
    1
  );
  
  // Recency similarity: 1 - normalized months since sale (cap at 12 months)
  const recencySimilarity = 1 - clamp(comp.monthsSinceSale / 12, 0, 1);
  
  // GLA similarity: 1 - normalized absolute difference within tolerance
  const glaDifference = Math.abs(comp.gla - SUBJECT_PROPERTY.gla);
  const glaToleranceAmount = SUBJECT_PROPERTY.gla * (constraints.glaTolerancePct / 100);
  const glaSimilarity = 1 - clamp(glaDifference / glaToleranceAmount, 0, 1);
  
  // Quality similarity: 1 - normalized absolute difference (max diff is 4)
  const qualitySimilarity = 1 - clamp(
    Math.abs(comp.quality - SUBJECT_PROPERTY.quality) / 4,
    0,
    1
  );
  
  // Condition similarity: 1 - normalized absolute difference (max diff is 4)
  const conditionSimilarity = 1 - clamp(
    Math.abs(comp.condition - SUBJECT_PROPERTY.condition) / 4,
    0,
    1
  );
  
  return {
    distance: distanceSimilarity,
    recency: recencySimilarity,
    gla: glaSimilarity,
    quality: qualitySimilarity,
    condition: conditionSimilarity
  };
}

// Calculate final weighted score for a comparable property
export function calculateCompScore(
  comp: CompProperty,
  weights: WeightSet,
  constraints: ConstraintSet
): number {
  const normalizedWeights = normalizeWeights(weights);
  const similarities = calculateSimilarityScores(comp, constraints);
  
  const score = 
    normalizedWeights.distance * similarities.distance +
    normalizedWeights.recency * similarities.recency +
    normalizedWeights.gla * similarities.gla +
    normalizedWeights.quality * similarities.quality +
    normalizedWeights.condition * similarities.condition;
  
  return Math.round(score * 100) / 100; // Round to 2 decimal places
}

// Score and rank all comparable properties
export function scoreAndRankComps(
  comps: CompProperty[],
  weights: WeightSet,
  constraints: ConstraintSet
): CompProperty[] {
  return comps
    .map(comp => {
      const similarities = calculateSimilarityScores(comp, constraints);
      const score = calculateCompScore(comp, weights, constraints);
      
      return {
        ...comp,
        score,
        scoreBreakdown: similarities
      };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0)); // Sort by score descending
}

// Validate weight and constraint values are within acceptable ranges
export function validateWeights(weights: WeightSet): string[] {
  const errors: string[] = [];
  
  Object.entries(weights).forEach(([key, value]) => {
    if (value < 0 || value > 10) {
      errors.push(`${key} weight must be between 0 and 10`);
    }
  });
  
  return errors;
}

export function validateConstraints(constraints: ConstraintSet): string[] {
  const errors: string[] = [];
  
  if (constraints.glaTolerancePct < 5 || constraints.glaTolerancePct > 20) {
    errors.push('GLA tolerance must be between 5% and 20%');
  }
  
  if (constraints.distanceCapMiles < 0.25 || constraints.distanceCapMiles > 5.0) {
    errors.push('Distance cap must be between 0.25 and 5.0 miles');
  }
  
  return errors;
}