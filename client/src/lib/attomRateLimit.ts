import { apiRequest } from '@/lib/queryClient';

export interface AttomManifest {
  lastRunISO?: string;
  counts?: Record<string, number>;
}

export async function checkAttomRateLimit(): Promise<{
  canImport: boolean;
  minutesRemaining: number;
  lastRunISO?: string;
}> {
  try {
    const response = await apiRequest('GET', '/api/attom/manifest');
    const manifest: AttomManifest = await response.json();
    
    if (!manifest.lastRunISO) {
      return { canImport: true, minutesRemaining: 0 };
    }
    
    // Development mode: No rate limiting (set to 0 to allow immediate re-imports)
    // Production: Consider setting to 10+ minutes to respect ATTOM API quotas
    const rateLimitMinutes = 0;
    
    const lastRun = new Date(manifest.lastRunISO);
    const now = new Date();
    const minutesSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60);
    
    if (minutesSinceLastRun >= rateLimitMinutes) {
      return { canImport: true, minutesRemaining: 0, lastRunISO: manifest.lastRunISO };
    } else {
      return { 
        canImport: false, 
        minutesRemaining: Math.ceil(rateLimitMinutes - minutesSinceLastRun),
        lastRunISO: manifest.lastRunISO 
      };
    }
  } catch (error) {
    // If we can't fetch manifest, allow import (fail open)
    console.error('Failed to check ATTOM rate limit:', error);
    return { canImport: true, minutesRemaining: 0 };
  }
}

export function formatRateLimitMessage(minutesRemaining: number): string {
  if (minutesRemaining <= 0) return '';
  
  if (minutesRemaining >= 60) {
    const hours = Math.floor(minutesRemaining / 60);
    const minutes = minutesRemaining % 60;
    return `${hours}h ${minutes}m remaining`;
  } else {
    return `${minutesRemaining}m remaining`;
  }
}