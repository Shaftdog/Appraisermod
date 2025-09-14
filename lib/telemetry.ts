import type { TelemetryPoint } from '../types/ops';

// Global flag check function
function checkTelemetryEnabled(): boolean {
  // Check for feature flag from window global or assume enabled for server-side
  if (typeof window !== 'undefined') {
    return (window as any).__FLAGS?.telemetry !== false;
  }
  return true;
}

export function kpi(k: TelemetryPoint['k'], v: number, dims: TelemetryPoint['dims'] = {}) {
  if (!checkTelemetryEnabled()) return;
  
  const telemetryPoint: Omit<TelemetryPoint, 'at'> = {
    k,
    v,
    dims
  };
  
  // Use beacon API for reliability in browser, absolute URL for server
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    // Browser environment - use beacon with relative URL
    const blob = new Blob([JSON.stringify({ 
      at: new Date().toISOString(), 
      ...telemetryPoint 
    })], { type: 'application/json' });
    
    navigator.sendBeacon('/api/ops/telemetry', blob);
  } else if (typeof fetch !== 'undefined') {
    // Server environment or browser fallback
    const baseUrl = typeof window === 'undefined' 
      ? process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 5000}`
      : '';
    const url = baseUrl + '/api/ops/telemetry';
    
    // Use queueMicrotask for server environments to ensure non-blocking
    const sendTelemetry = () => {
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            at: new Date().toISOString(), 
            ...telemetryPoint 
          }),
          credentials: typeof window !== 'undefined' ? 'include' : 'omit'
        }).catch(() => {
          // Silent fail to not disrupt operation
        });
      } catch {
        // Silent fail for any synchronous errors
      }
    };
    
    if (typeof window === 'undefined') {
      // Server environment - use queueMicrotask for fire-and-forget
      queueMicrotask(sendTelemetry);
    } else {
      // Browser environment - send immediately
      sendTelemetry();
    }
  }
}

// Convenience functions for common KPIs
export const telemetry = {
  // Export performance
  exportTime: (timeMs: number, orderId?: string) => 
    kpi('export_time_ms', timeMs, orderId ? { orderId } : {}),
    
  pdfPages: (pages: number, orderId?: string) => 
    kpi('pdf_pages', pages, orderId ? { orderId } : {}),
    
  deliverySize: (bytes: number, orderId?: string) => 
    kpi('delivery_size_bytes', bytes, orderId ? { orderId } : {}),
    
  // Review metrics
  reviewRedHits: (count: number, orderId?: string) => 
    kpi('review_red_hits', count, orderId ? { orderId } : {}),
    
  qcStatus: (status: 'green' | 'yellow' | 'red', orderId?: string) => {
    const statusMap = { green: 0, yellow: 1, red: 2 };
    kpi('qc_status', statusMap[status], orderId ? { orderId } : {});
  },
  
  // Time adjustment tracking
  timeAdjustment: (percentage: number, basis: string, orderId?: string) => 
    kpi('time_adj_pct', percentage, { basis, ...(orderId ? { orderId } : {}) }),
};