/**
 * Locked scoring breakdown schema
 * Ensures consistent structure and validates weights
 */

export interface ScorePart { 
  similarity: number; 
  weight: number; 
  contribution: number; 
}

export interface ScoreBreakdown {
  distance: ScorePart;
  recency: ScorePart;
  gla: ScorePart;
  quality: ScorePart;
  condition: ScorePart;
  // Allow optional additional criteria but ensure they're typed
  [extra: string]: ScorePart | undefined;
}

/**
 * Validate that weights sum to approximately 1.0
 */
export function validateWeightsSum(breakdown: ScoreBreakdown, epsilon: number = 0.001): boolean {
  const totalWeight = Object.values(breakdown)
    .filter((part): part is ScorePart => part !== undefined)
    .reduce((sum, part) => sum + part.weight, 0);
  
  return Math.abs(totalWeight - 1.0) <= epsilon;
}

/**
 * Validate that total score equals sum of contributions
 */
export function validateScoreConsistency(score: number, breakdown: ScoreBreakdown, epsilon: number = 0.001): boolean {
  const totalContribution = Object.values(breakdown)
    .filter((part): part is ScorePart => part !== undefined)
    .reduce((sum, part) => sum + part.contribution, 0);
  
  return Math.abs(score - totalContribution) <= epsilon;
}

/**
 * Create a normalized score part
 */
export function createScorePart(similarity: number, weight: number): ScorePart {
  return {
    similarity: Math.max(0, Math.min(1, similarity)), // Clamp to [0,1]
    weight: Math.max(0, weight), // Ensure non-negative
    contribution: similarity * weight
  };
}

/**
 * Normalize weights to sum to 1.0
 */
export function normalizeWeights<T extends Record<string, number>>(weights: T): T {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  
  if (total === 0) {
    // If all weights are 0, distribute equally
    const equalWeight = 1.0 / Object.keys(weights).length;
    return Object.fromEntries(
      Object.keys(weights).map(key => [key, equalWeight])
    ) as T;
  }
  
  return Object.fromEntries(
    Object.entries(weights).map(([key, weight]) => [key, weight / total])
  ) as T;
}
