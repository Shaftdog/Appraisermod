import * as crypto from 'crypto';
import * as fs from 'fs/promises';

export async function sha256File(filePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

export function sha256String(input: string): string {
  const hashSum = crypto.createHash('sha256');
  hashSum.update(input);
  return hashSum.digest('hex');
}