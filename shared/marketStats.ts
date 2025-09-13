import { format, subMonths, startOfMonth, endOfMonth, differenceInMonths, parseISO } from 'date-fns';
import { MarketRecord, McrMetrics } from './schema';

/**
 * Compute percentile of a sorted array
 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const index = (p / 100) * (values.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  
  if (lower === upper) {
    return values[lower];
  }
  
  return values[lower] * (upper - index) + values[upper] * (index - lower);
}

/**
 * Filter outliers using IQR method
 */
export function iqrFilter(values: number[]): number[] {
  if (values.length < 4) return values;
  
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  
  return values.filter(v => v >= lowerBound && v <= upperBound);
}

/**
 * Compute median of array
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate months between two dates
 */
export function monthsBetween(d1: string, d2: string): number {
  return differenceInMonths(parseISO(d1), parseISO(d2));
}

/**
 * Compute monthly medians from market records
 */
export function computeMonthlyMedians(
  records: MarketRecord[], 
  metric: 'salePrice' | 'ppsf',
  monthsBack: number
): Array<{ month: string; medianSalePrice?: number; medianPPSF?: number; n: number }> {
  const now = new Date();
  const startDate = subMonths(now, monthsBack);
  
  // Filter sold records within date range
  const soldRecords = records.filter(r => 
    r.status === 'sold' && 
    r.closeDate && 
    parseISO(r.closeDate) >= startDate &&
    r.salePrice && 
    r.salePrice > 0 &&
    r.livingArea && 
    r.livingArea > 0
  );
  
  // Group by month
  const monthGroups = new Map<string, MarketRecord[]>();
  
  for (let i = 0; i < monthsBack; i++) {
    const monthDate = subMonths(now, i);
    const monthKey = format(startOfMonth(monthDate), 'yyyy-MM');
    monthGroups.set(monthKey, []);
  }
  
  soldRecords.forEach(record => {
    if (record.closeDate) {
      const monthKey = format(startOfMonth(parseISO(record.closeDate)), 'yyyy-MM');
      if (monthGroups.has(monthKey)) {
        monthGroups.get(monthKey)!.push(record);
      }
    }
  });
  
  // Compute medians for each month
  const result: Array<{ month: string; medianSalePrice?: number; medianPPSF?: number; n: number }> = [];
  
  monthGroups.forEach((monthRecords, monthKey) => {
    if (monthRecords.length === 0) {
      result.push({ month: monthKey, n: 0 });
      return;
    }
    
    // Filter outliers
    const salePrices = iqrFilter(monthRecords.map(r => r.salePrice!));
    const ppsf = iqrFilter(monthRecords.map(r => r.salePrice! / r.livingArea!));
    
    result.push({
      month: monthKey,
      medianSalePrice: salePrices.length > 0 ? median(salePrices) : undefined,
      medianPPSF: ppsf.length > 0 ? median(ppsf) : undefined,
      n: Math.min(salePrices.length, ppsf.length)
    });
  });
  
  return result.sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Theil-Sen estimator on log-transformed data
 */
export function theilSenLog(medians: Array<{ month: string; medianSalePrice?: number; medianPPSF?: number; n: number }>, metric: 'salePrice' | 'ppsf'): { slope: number; intercept: number; pctPerMonth: number } {
  // Filter months with data
  const validPoints = medians
    .map((m, index) => ({
      x: index,
      y: metric === 'salePrice' ? m.medianSalePrice : m.medianPPSF,
      month: m.month
    }))
    .filter(p => p.y && p.y > 0)
    .map(p => ({ x: p.x, y: Math.log(p.y!), month: p.month }));
    
  if (validPoints.length < 2) {
    return { slope: 0, intercept: 0, pctPerMonth: 0 };
  }
  
  // Calculate all pairwise slopes
  const slopes: number[] = [];
  for (let i = 0; i < validPoints.length; i++) {
    for (let j = i + 1; j < validPoints.length; j++) {
      const dx = validPoints[j].x - validPoints[i].x;
      const dy = validPoints[j].y - validPoints[i].y;
      if (dx !== 0) {
        slopes.push(dy / dx);
      }
    }
  }
  
  if (slopes.length === 0) {
    return { slope: 0, intercept: 0, pctPerMonth: 0 };
  }
  
  // Median slope
  const slope = median(slopes);
  
  // Median intercept: median of (y_i - slope * x_i)
  const intercepts = validPoints.map(p => p.y - slope * p.x);
  const intercept = median(intercepts);
  
  // Convert to percentage per month
  const pctPerMonth = Math.exp(slope) - 1;
  
  return { slope, intercept, pctPerMonth };
}

/**
 * Ordinary Least Squares on log-transformed data (fallback)
 */
export function olsLog(medians: Array<{ month: string; medianSalePrice?: number; medianPPSF?: number; n: number }>, metric: 'salePrice' | 'ppsf'): { slope: number; intercept: number; pctPerMonth: number } {
  const validPoints = medians
    .map((m, index) => ({
      x: index,
      y: metric === 'salePrice' ? m.medianSalePrice : m.medianPPSF
    }))
    .filter(p => p.y && p.y > 0)
    .map(p => ({ x: p.x, y: Math.log(p.y!) }));
    
  if (validPoints.length < 2) {
    return { slope: 0, intercept: 0, pctPerMonth: 0 };
  }
  
  const n = validPoints.length;
  const sumX = validPoints.reduce((sum, p) => sum + p.x, 0);
  const sumY = validPoints.reduce((sum, p) => sum + p.y, 0);
  const sumXY = validPoints.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = validPoints.reduce((sum, p) => sum + p.x * p.x, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  const pctPerMonth = Math.exp(slope) - 1;
  
  return { slope, intercept, pctPerMonth };
}

/**
 * Compute comprehensive market metrics
 */
export function computeMarketMetrics(
  records: MarketRecord[],
  settings: { monthsBack: number; statuses: string[]; metric: 'salePrice' | 'ppsf'; minSalesPerMonth: number }
): McrMetrics {
  const now = new Date();
  const startDate = subMonths(now, settings.monthsBack);
  
  // Filter records by date and status
  const filteredRecords = records.filter(r => {
    if (!settings.statuses.includes(r.status)) return false;
    
    const relevantDate = r.status === 'sold' ? r.closeDate : r.listDate;
    if (!relevantDate) return false;
    
    return parseISO(relevantDate) >= startDate;
  });
  
  // Count by status
  const sampleCounts = {
    sold: filteredRecords.filter(r => r.status === 'sold').length,
    active: filteredRecords.filter(r => r.status === 'active').length,
    pending: filteredRecords.filter(r => r.status === 'pending').length,
    expired: filteredRecords.filter(r => r.status === 'expired').length
  };
  
  // Compute monthly medians
  const mediansByMonth = computeMonthlyMedians(filteredRecords, settings.metric, settings.monthsBack);
  
  // Calculate trend using Theil-Sen (fallback to OLS if insufficient data)
  const monthsWithData = mediansByMonth.filter(m => m.n >= settings.minSalesPerMonth);
  let trendResult;
  let trendMethod: 'theil-sen-log' | 'ols-log';
  
  if (monthsWithData.length >= 6) {
    trendResult = theilSenLog(mediansByMonth, settings.metric);
    trendMethod = 'theil-sen-log';
  } else {
    trendResult = olsLog(mediansByMonth, settings.metric);
    trendMethod = 'ols-log';
  }
  
  // Calculate absorption and inventory metrics
  const soldRecords = filteredRecords.filter(r => r.status === 'sold');
  const activeRecords = filteredRecords.filter(r => r.status === 'active');
  
  const absorptionPerMonth = soldRecords.length / settings.monthsBack;
  const monthsOfInventory = absorptionPerMonth > 0 ? activeRecords.length / absorptionPerMonth : 0;
  
  // DOM and SP/LP medians
  const domValues = soldRecords.map(r => r.dom).filter(d => d && d > 0) as number[];
  const spToLpValues = soldRecords.map(r => r.spToLp).filter(s => s && s > 0) as number[];
  
  return {
    sampleCounts,
    mediansByMonth,
    absorptionPerMonth,
    monthsOfInventory,
    domMedian: domValues.length > 0 ? median(domValues) : undefined,
    spToLpMedian: spToLpValues.length > 0 ? median(spToLpValues) : undefined,
    trendPctPerMonth: trendResult.pctPerMonth,
    trendMethod
  };
}