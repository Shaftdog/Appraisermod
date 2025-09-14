import type { AuditEvent } from '../types/ops';

export async function audit(ev: Omit<AuditEvent, 'id' | 'at' | 'ip'>) {
  try {
    await fetch('/api/ops/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ev),
      credentials: 'include'
    });
  } catch (error) {
    // Silent fail to not disrupt user experience
    console.warn('Failed to record audit event:', error);
  }
}