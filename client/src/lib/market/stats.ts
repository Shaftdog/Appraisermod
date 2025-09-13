// Market stats utilities moved to shared/marketStats.ts
// Re-export for backward compatibility
export {
  iqrFilter,
  monthsBetween,
  computeMonthlyMedians,
  theilSenLog,
  olsLog,
  computeMarketMetrics
} from '@shared/marketStats';