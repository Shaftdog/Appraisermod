import { PolicyRule, RuleSeverity, Risk } from './review';

export interface PolicyPackMeta {
  id: string;             // 'default-shop-policy'
  name: string;
  version: string;        // '2025.09.0'
  updatedAt: string;
  enabled: boolean;
}

export interface PolicyPack {
  meta: PolicyPackMeta;
  rules: PolicyRule[];
  riskMap?: Record<RuleSeverity, Risk>; // severity→risk mapping
}