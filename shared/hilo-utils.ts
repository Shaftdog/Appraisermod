import { HiLoSettings, RankedCompScore, HiLoRange } from '../types/hilo';
import { CompProperty } from './schema';
import { calculateTimeAdjustment } from './timeAdjust';
import { calculateSimilarityScores, normalizeWeights } from './scoring';
import { createScorePart } from './scoring-types';

export interface HiLoCandidate {
  id: string;
  type: 'sale' | 'listing';
  salePrice: number;
  saleDate: string;
  gla?: number;
  insidePolygon: boolean;
  // Properties needed for scoring
  distanceMiles: number;
  monthsSinceSale: number;
  quality: number;
  condition: number;
}

export interface HiLoComputeContext {
  center: number;
  boxPct: number;
  effectiveDateISO: string;
  basis: 'salePrice' | 'ppsf';
  pctPerMonth: number;
  settings: HiLoSettings;
  // Subject properties for scoring
  subjectGla: number;
  subjectQuality: number;
  subjectCondition: number;
}

export function computeHiLoRange(
  center: number,
  boxPct: number,
  effectiveDateISO: string,
  basis: 'salePrice' | 'ppsf'
): HiLoRange {
  const multiplier = boxPct / 100;
  return {
    center,
    lo: center * (1 - multiplier),
    hi: center * (1 + multiplier),
    effectiveDateISO,
    basis
  };
}

export function calculateTimeAdjustedValue(
  candidate: HiLoCandidate,
  effectiveDateISO: string,
  pctPerMonth: number,
  basis: 'salePrice' | 'ppsf'
): number | null {
  const adjustment = calculateTimeAdjustment(
    candidate.salePrice,
    candidate.saleDate,
    candidate.gla,
    effectiveDateISO,
    pctPerMonth,
    basis
  );

  if (adjustment.adjustedPrice === null) {
    return null; // GLA missing for $/SF basis
  }

  if (basis === 'ppsf' && candidate.gla && candidate.gla > 0) {
    return adjustment.adjustedPrice / candidate.gla;
  }

  return adjustment.adjustedPrice;
}

export function rankCandidatesForHiLo(
  candidates: HiLoCandidate[],
  context: HiLoComputeContext
): {
  ranked: RankedCompScore[];
  selectedSales: string[];
  selectedListings: string[];
  primaries: string[];
  listingPrimaries: string[];
} {
  const { settings, center, boxPct, effectiveDateISO, basis, pctPerMonth } = context;
  const range = computeHiLoRange(center, boxPct, effectiveDateISO, basis);

  // Filter candidates based on settings
  let filteredCandidates = candidates;
  if (settings.filters.insidePolygonOnly) {
    filteredCandidates = filteredCandidates.filter(c => c.insidePolygon);
  }

  // Calculate time-adjusted values and score each candidate
  // Create a normalized weight set that matches the standard WeightSet interface
  const standardWeights = {
    distance: settings.weights.distance,
    recency: settings.weights.recency,
    gla: settings.weights.gla,
    quality: settings.weights.quality,
    condition: settings.weights.condition
  };
  const normalizedWeights = normalizeWeights(standardWeights);
  
  const rankedResults = filteredCandidates
    .map(candidate => {
      const timeAdjustedValue = calculateTimeAdjustedValue(
        candidate,
        effectiveDateISO,
        pctPerMonth,
        basis
      );

      if (timeAdjustedValue === null) {
        return null; // Skip candidates without valid adjusted values
      }

      const insideBox = timeAdjustedValue >= range.lo && timeAdjustedValue <= range.hi;

      // Calculate similarity scores using existing scoring logic
      const mockComp: CompProperty = {
        id: candidate.id,
        address: '',
        salePrice: candidate.salePrice,
        saleDate: candidate.saleDate,
        distanceMiles: candidate.distanceMiles,
        monthsSinceSale: candidate.monthsSinceSale,
        latlng: { lat: 0, lng: 0 },
        gla: candidate.gla || 0,
        quality: candidate.quality,
        condition: candidate.condition
      };

      const constraints = {
        glaTolerancePct: 20, // 20% tolerance
        distanceCapMiles: 5.0 // 5 mile cap
      };

      const similarities = calculateSimilarityScores(mockComp, constraints);
      
      // Calculate weighted score (without location factor for now)
      const score = 
        normalizedWeights.distance * similarities.distance +
        normalizedWeights.recency * similarities.recency +
        normalizedWeights.gla * similarities.gla +
        normalizedWeights.quality * similarities.quality +
        normalizedWeights.condition * similarities.condition;

      // Build reasons array (without location factor for now)
      const reasons = [
        { key: 'distance' as const, similarity: similarities.distance, weight: normalizedWeights.distance, contribution: normalizedWeights.distance * similarities.distance },
        { key: 'recency' as const, similarity: similarities.recency, weight: normalizedWeights.recency, contribution: normalizedWeights.recency * similarities.recency },
        { key: 'gla' as const, similarity: similarities.gla, weight: normalizedWeights.gla, contribution: normalizedWeights.gla * similarities.gla },
        { key: 'quality' as const, similarity: similarities.quality, weight: normalizedWeights.quality, contribution: normalizedWeights.quality * similarities.quality },
        { key: 'condition' as const, similarity: similarities.condition, weight: normalizedWeights.condition, contribution: normalizedWeights.condition * similarities.condition },
        { key: 'loc' as const, similarity: candidate.insidePolygon ? 1 : 0.5, weight: settings.weights.loc, contribution: settings.weights.loc * (candidate.insidePolygon ? 1 : 0.5) }
      ];

      return {
        compId: candidate.id,
        type: candidate.type,
        insideBox,
        insidePolygon: candidate.insidePolygon,
        timeAdjustedValue,
        score: Math.round(score * 100) / 100,
        reasons
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.score - a.score);

  const ranked: RankedCompScore[] = rankedResults;

  // Select candidates inside the box
  const insideBoxRanked = ranked.filter(r => r.insideBox);
  const sales = insideBoxRanked.filter(r => r.type === 'sale');
  const listings = insideBoxRanked.filter(r => r.type === 'listing');

  const selectedSales = sales.slice(0, settings.maxSales).map(r => r.compId);
  const selectedListings = listings.slice(0, settings.maxListings).map(r => r.compId);
  const primaries = selectedSales.slice(0, 3);
  const listingPrimaries = selectedListings.slice(0, 2);

  return {
    ranked,
    selectedSales,
    selectedListings,
    primaries,
    listingPrimaries
  };
}

export function calculateCenterValue(
  candidates: HiLoCandidate[],
  basis: 'medianTimeAdj' | 'weightedPrimaries' | 'model',
  context: Omit<HiLoComputeContext, 'center' | 'boxPct'>,
  existingPrimaries?: string[]
): number {
  const { effectiveDateISO, pctPerMonth, settings, basis: adjustmentBasis } = context;

  if (basis === 'weightedPrimaries' && existingPrimaries && existingPrimaries.length > 0) {
    // Use existing primaries if available
    const primaryCandidates = candidates.filter(c => existingPrimaries.includes(c.id));
    if (primaryCandidates.length > 0) {
      const values = primaryCandidates
        .map(c => calculateTimeAdjustedValue(c, effectiveDateISO, pctPerMonth, adjustmentBasis))
        .filter((v): v is number => v !== null);
      
      if (values.length > 0) {
        return values.reduce((sum, v) => sum + v, 0) / values.length;
      }
    }
    // Fall back to median if no primaries
  }

  // Default to median time-adjusted value
  let candidatePool = candidates;
  if (settings.filters.insidePolygonOnly) {
    const insideCandidates = candidates.filter(c => c.insidePolygon);
    if (insideCandidates.length > 0) {
      candidatePool = insideCandidates;
    }
    // Fall back to all candidates if no inside polygon candidates
  }

  const values = candidatePool
    .map(c => calculateTimeAdjustedValue(c, effectiveDateISO, pctPerMonth, adjustmentBasis))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  if (values.length === 0) {
    throw new Error('No valid candidates for center calculation');
  }

  const midIndex = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[midIndex - 1] + values[midIndex]) / 2
    : values[midIndex];
}
