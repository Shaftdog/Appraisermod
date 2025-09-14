/**
 * Compatibility layer for legacy field migrations
 * Ensures single source of truth while maintaining backward compatibility
 */

import { z } from "zod";

export type TimeAdjustmentBasis = 'salePrice' | 'ppsf';

export interface TimeAdjustmentsV2 {
  orderId: string;
  basis: TimeAdjustmentBasis;       // single source of truth
  pctPerMonth: number;              // +0.007 = +0.7%/mo
  effectiveDateISO: string;
  computedAt: string;
}

export interface TimeAdjustmentsLegacy {
  /** @deprecated */ monthlyRate?: number;          // decimal
  /** @deprecated */ monthlyAdjustment?: number;    // deprecated alias
  /** @deprecated */ method?: string;
  /** @deprecated */ confidence?: number;
  /** @deprecated */ dataPoints?: number;
}

export type TimeAdjustments = TimeAdjustmentsV2 & { legacy?: TimeAdjustmentsLegacy };

// Zod schema for API boundary validation
export const TimeAdjSchema = z.object({
  orderId: z.string(),
  basis: z.enum(['salePrice','ppsf']),
  pctPerMonth: z.number(),
  effectiveDateISO: z.string().refine(v => !Number.isNaN(Date.parse(v)), {
    message: "Invalid ISO date string"
  }),
  computedAt: z.string(),
  legacy: z.object({
    monthlyRate: z.number().optional(),
    monthlyAdjustment: z.number().optional(),
    method: z.string().optional(),
    confidence: z.number().optional(),
    dataPoints: z.number().optional(),
  }).optional(),
});

export type ValidatedTimeAdjustments = z.infer<typeof TimeAdjSchema>;

/**
 * Transform legacy time adjustments to V2 format
 */
export function migrateLegacyTimeAdjustments(legacy: any): TimeAdjustments {
  // If already V2 format, return as-is
  if (legacy.basis && legacy.pctPerMonth !== undefined) {
    return legacy as TimeAdjustments;
  }

  // Migrate from legacy fields
  const pctPerMonth = legacy.pctPerMonth ?? legacy.monthlyRate ?? legacy.monthlyAdjustment ?? 0;
  const basis: TimeAdjustmentBasis = legacy.basis ?? 'salePrice';

  return {
    orderId: legacy.orderId,
    basis,
    pctPerMonth,
    effectiveDateISO: legacy.effectiveDateISO || new Date().toISOString(),
    computedAt: legacy.computedAt || new Date().toISOString(),
    legacy: {
      monthlyRate: legacy.monthlyRate,
      monthlyAdjustment: legacy.monthlyAdjustment,
      method: legacy.method,
      confidence: legacy.confidence,
      dataPoints: legacy.dataPoints,
    }
  };
}

/**
 * Normalize market settings basis field
 */
export function normalizeMarketBasis(basis: string): TimeAdjustmentBasis {
  switch (basis) {
    case 'salePrice':
    case 'sale_price':
      return 'salePrice';
    case 'ppsf':
    case '$/SF':
    case 'psf':
      return 'ppsf';
    default:
      return 'salePrice'; // safe default
  }
}
