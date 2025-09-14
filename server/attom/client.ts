import { ATTOM } from '../../config/attom';

export async function attomGet(path: string, key: string, params: Record<string, any> = {}) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) usp.set(k, String(v));
  const url = `${ATTOM.baseUrl}${path}?${usp.toString()}`;
  const res = await fetch(url, { headers: ATTOM.headers(key) });
  if (!res.ok) throw new Error(`ATTOM ${res.status}: ${await res.text()}`);
  return res.json();
}