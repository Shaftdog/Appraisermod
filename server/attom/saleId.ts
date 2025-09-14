import crypto from 'crypto';

export function stableSaleId(input: {
  county: string;
  closeDate: string;      // ISO yyyy-mm-dd
  closePrice: number;     // whole dollars ok
  apn?: string;
  address?: string;       // one-line address, optional fallback
}) {
  const key = [
    input.county.trim().toUpperCase(),
    (input.apn || '').replace(/\W+/g, '').toUpperCase(),
    (input.address || '').replace(/\s+/g, ' ').trim().toUpperCase(),
    input.closeDate.slice(0, 10),
    Math.round(input.closePrice),
  ].join('|');
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}