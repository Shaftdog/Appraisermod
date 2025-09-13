import { differenceInMonths } from 'date-fns';

export function monthsBetween(saleISO: string, effectiveISO: string): number {
  // Use whole months difference from sale date to effective date
  // Positive result means sale was before effective date (comp is older)
  return Math.max(0, differenceInMonths(new Date(effectiveISO), new Date(saleISO)));
}

export function adjFactor(pctPerMonth: number, months: number): number {
  return Math.pow(1 + pctPerMonth, months);
}

export function calculateTimeAdjustment(
  salePrice: number,
  saleDate: string,
  gla: number | undefined,
  effectiveDate: string,
  pctPerMonth: number,
  basis: 'salePrice' | 'ppsf'
) {
  const months = monthsBetween(saleDate, effectiveDate);
  const factor = adjFactor(pctPerMonth, months);

  if (basis === 'salePrice') {
    return {
      months,
      adjustmentPercent: (factor - 1) * 100,
      adjustedPrice: salePrice * factor,
      basis: 'salePrice' as const
    };
  } else {
    // $/SF basis
    if (!gla || gla <= 0) {
      return {
        months,
        adjustmentPercent: (factor - 1) * 100,
        adjustedPrice: null,
        basis: 'ppsf' as const,
        error: 'GLA required for $/SF basis adjustments'
      };
    }

    const ppsf = salePrice / gla;
    const adjustedPpsf = ppsf * factor;
    const adjustedPrice = adjustedPpsf * gla;

    return {
      months,
      adjustmentPercent: (factor - 1) * 100,
      adjustedPrice,
      basis: 'ppsf' as const,
      originalPpsf: ppsf,
      adjustedPpsf,
      gla
    };
  }
}