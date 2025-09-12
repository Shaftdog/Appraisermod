export type RiskStatus = 'green' | 'yellow' | 'red';

export type TabKey =
  | 'orderSummary'
  | 'subject'
  | 'market'
  | 'comps'
  | 'sketch'
  | 'photos'
  | 'cost'
  | 'reconciliation'
  | 'qcSignoff'
  | 'exports';

export interface TabQC {
  status: RiskStatus;
  openIssues: number;
  overriddenIssues: number;
  lastReviewedBy?: string;
  lastReviewedAt?: string;
}

export interface Signoff {
  state: 'unsigned' | 'signed-appraiser' | 'signed-reviewer';
  signedBy?: string;
  signedAt?: string;
  overrideReason?: string;
}

export interface VersionSnapshot {
  id: string;
  label: string;
  author: string;
  createdAt: string;
  data: Record<string, any>;
}

export interface TabState {
  key: TabKey;
  qc: TabQC;
  signoff: Signoff;
  versions: VersionSnapshot[];
  currentData: Record<string, any>;
}

export interface Order {
  id: string;
  orderNumber: string;
  clientName: string;
  dueDate?: string;
  overallStatus: RiskStatus;
  tabs: Record<TabKey, TabState>;
}

export const TAB_LABELS: Record<TabKey, string> = {
  orderSummary: 'Order Summary',
  subject: 'Subject',
  market: 'Market',
  comps: 'Comps',
  sketch: 'Sketch',
  photos: 'Photos',
  cost: 'Cost',
  reconciliation: 'Reconciliation',
  qcSignoff: 'QC & Sign-off',
  exports: 'Exports'
};
