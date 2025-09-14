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
  
  // Use beacon API for reliability, fallback to fetch
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify({ 
      at: new Date().toISOString(), 
      ...telemetryPoint 
    })], { type: 'application/json' });
    
    navigator.sendBeacon('/api/ops/telemetry', blob);
  } else if (typeof fetch !== 'undefined') {
    // Fallback for environments without beacon API
    fetch('/api/ops/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        at: new Date().toISOString(), 
        ...telemetryPoint 
      }),
      credentials: 'include'
    }).catch(() => {
      // Silent fail to not disrupt user experience
    });
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