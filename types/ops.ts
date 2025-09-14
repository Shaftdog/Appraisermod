export interface AuditEvent {
  id: string;
  at: string;          // ISO
  userId: string;
  role: 'appraiser'|'reviewer'|'chief'|'admin';
  action: string;      // 'signoff.reviewer', 'delivery.request', 'adjustments.apply'
  orderId?: string;
  path?: string;       // e.g. "market.timeAdjust.basis"
  before?: any; 
  after?: any;
  ip?: string;
}

export interface TelemetryPoint {
  at: string;             // ISO
  k: 'export_time_ms'|'pdf_pages'|'review_red_hits'|'qc_status'|'time_adj_pct'|'delivery_size_bytes';
  v: number;
  dims?: Record<string,string|number>; // {orderId:'123', tab:'photos'}
}

export interface BackupRecord {
  id: string;
  at: string;
  kind: 'order-snapshot'|'workfile';
  orderId: string;
  path: string;
  bytes: number;
  sha256: string;
  rotationSlot: string; // hourly/daily/weekly
}

export interface HealthStatus {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; detail?: string }>;
  at: string;
}

export interface TelemetrySummary {
  period: string;
  since: string;
  metrics: Record<string, {
    count: number;
    avg: number;
    p95: number;
    min: number;
    max: number;
  }>;
}

export interface RateLimitInfo {
  ip: string;
  tokens: number;
  lastRefill: number;
  maxTokens: number;
}