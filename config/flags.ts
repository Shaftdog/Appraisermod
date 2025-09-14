export const FLAGS = {
  telemetry: true,
  auditLog: true,
  backups: true,
  featureGatesUI: true,
  healthChecks: true,
} as const;

export type FlagKey = keyof typeof FLAGS;
export type Flags = typeof FLAGS;