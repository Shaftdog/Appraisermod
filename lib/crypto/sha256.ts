import { createHash } from 'crypto';
import { readFileSync } from 'fs';

/**
 * Compute SHA256 hash of a string
 */
export function sha256String(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Compute SHA256 hash of a file
 */
export function sha256File(filePath: string): string {
  const data = readFileSync(filePath);
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Compute SHA256 hash of a buffer
 */
export function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}