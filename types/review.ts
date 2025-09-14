export type Risk = 'green' | 'yellow' | 'red';

export type RuleSeverity = 'info' | 'minor' | 'major' | 'critical';
export type RuleScope = 'order' | 'tab' | 'comp' | 'photo' | 'market' | 'adjustments' | 'habu';

export interface PolicyRule {
  id: string;                    // 'TIME_BASIS_MISMATCH'
  name: string;                  // Human title
  scope: RuleScope;
  severity: RuleSeverity;
  // JSONPath-like selector into order data (evaluate server-side mock)
  selector: string;              // e.g. "$.market.timeAdjust.basis"
  operator: 'eq'|'neq'|'gt'|'gte'|'lt'|'lte'|'exists'|'notExists'|'regex'|'in'|'notIn';
  value?: any;                   // comparison value when applicable
  messageTemplate: string;       // "Time basis {actual} differs from analysis basis {expected}"
  autofix?: {                    // optional suggestion payload
    action: 'set'|'unset'|'recompute',
    path?: string,
    value?: any
  };
  links?: string[];              // help links or policy docs
  enabled: boolean;
}

export interface RuleHit {
  ruleId: string;
  severity: RuleSeverity;
  risk: Risk;                    // map severity → risk
  scope: RuleScope;
  path: string;                  // data path hit
  message: string;
  entities?: string[];           // e.g. ['comp_04']
  suggestion?: { action: string; path?: string; value?: any };
}

export interface ReviewItem {
  orderId: string;
  status: 'open'|'in_review'|'changes_requested'|'revisions_submitted'|'approved';
  overallRisk: Risk;
  createdAt: string;
  updatedAt: string;
  assignedTo?: string;           // reviewer userId
  hits: RuleHit[];
  overrides: Array<{ ruleId: string; reason: string; userId: string; at: string }>;
  comments: Thread[];            // inline discussions
  appraiserSignedOff?: string;   // ISO
  reviewerSignedOff?: string;    // ISO
  currentVersionId?: string;     // for diffs
  previousVersionId?: string;    // for diffs
  reviewerDetails?: any;         // legacy field
  appraiserDetails?: any;        // legacy field
}

export interface Thread {
  id: string;
  orderId: string;
  entityRef: string;             // e.g. 'tab:photos', 'comp:comp_04', 'field:market.timeAdjust'
  createdBy: string;
  createdAt: string;
  status: 'open'|'resolved';
  items: Comment[];
}

export interface Comment {
  id: string;
  authorId: string;
  at: string;
  kind: 'note'|'request_change'|'response';
  text: string;
  attachments?: Array<{name:string; url:string}>;
}

export interface ReviewQueueItem {
  orderId: string;
  client: string;
  address: string;
  dueDate: string;
  appraiser: string;
  status: ReviewItem['status'];
  overallRisk: Risk;
  hitsCount: { red: number; yellow: number; info: number };
  updatedAt: string;
}

export interface DiffSummary {
  orderId: string;
  fromVersionId: string;
  toVersionId: string;
  changes: Array<{ path: string; before: any; after: any }>;
}