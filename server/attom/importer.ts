import fs from 'fs/promises';
import path from 'path';
import { ATTOM } from '../../config/attom';
import { attomGet } from './client';
import { stableSaleId } from './saleId';
import { kpi } from '../../lib/telemetry';

const DATA_ROOT = process.env.ATTOM_DATA_ROOT || 'data/attom';

function ensureDir(p: string) { return fs.mkdir(p, { recursive: true }); }

async function backoff(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function atomicWrite(file: string, json: any) {
  const tmp = file + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(json, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

async function updateManifest(county: string, added: number, total: number) {
  const manifestPath = path.join(DATA_ROOT, 'manifest.json');
  let manifest: any = {};
  
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {}
  
  manifest.lastRunISO = new Date().toISOString();
  manifest.counts = manifest.counts || {};
  manifest.counts[county] = total;
  
  await atomicWrite(manifestPath, manifest);
  
  // Record telemetry counters (fire-and-forget, non-blocking)
  kpi('attom_closed_sales_count', total, { county });
  kpi('attom_import_added', added, { county });
}

export async function importClosedSales(
  county: string, 
  monthsBack = ATTOM.monthsBackClosedSales,
  testClient?: (endpoint: string, key: string, params: any) => Promise<any>
) {
  const key = process.env.ATTOM_API_KEY!;
  if (!key) throw new Error('Missing ATTOM_API_KEY');

  // Example endpoint patterns (do not hardcode assumptions; these are shaped for our use):
  // 1) Closed sales by geography/time (ATTOM has sales/transfer endpoints; here we filter by county + date range)
  const since = new Date(); since.setMonth(since.getMonth() - monthsBack);
  const sinceIso = since.toISOString().slice(0,10);

  // Call #1: sales list (paged). Keep it simple: loop pages up to a safe max.
  let page = 1, maxPages = 20;
  const sales: any[] = [];
  while (page <= maxPages) {
    let tries = 0;
    let data: any;
    while (tries < 3) {
      try {
        const clientFn = testClient || attomGet;
        data = await clientFn('/propertyapi/v1.0.0/saleshistory/snapshot', key, {
          countyname: county, state: 'FL', page, pagesize: 100, startdate: sinceIso
        });
        break;
      } catch (e: any) {
        tries++;
        if (tries >= 3) {
          console.error('ATTOM sales error after retries', e.message);
          data = { sales: [] };
          break;
        }
        await backoff(tries === 1 ? 500 : 1500);
      }
    }

    const items = (data?.sales || data?.property || []);
    if (!items.length) break;
    sales.push(...items);
    page += 1;
  }

  // Normalize minimal fields into ClosedSale[]
  const normalized = sales.map((s: any) => {
    const address = `${s?.address?.oneLine || [s?.address?.line1, s?.address?.city, s?.address?.state, s?.address?.zip].filter(Boolean).join(', ')}`;
    const closeDate = s?.saleTransDate || s?.sale?.saleDate;
    const closePrice = Number(s?.saleAmount || s?.sale?.amount || 0);
    const apn = s?.identifier?.apn || s?.identifier?.apnOriginal;
    
    const saleId = stableSaleId({
      county,
      closeDate,
      closePrice,
      apn,
      address
    });
    
    return {
      id: saleId, // Use stable deterministic identifier
      saleId, // Also store as saleId field for clarity
      apn,
      address,
      city: s?.address?.city,
      state: s?.address?.state,
      zip: s?.address?.zip,
      closeDate,
      closePrice,
      gla: Number(s?.building?.size?.grossSize || s?.building?.size?.universalsize || s?.building?.size?.livingsize || 0),
      lotSizeSqft: Number(s?.lot?.lotSize1 || s?.lot?.lotSize || 0),
      lat: s?.location?.latitude, lon: s?.location?.longitude
    };
  }).filter((x: any) => x.closeDate && x.closePrice);

  const dir = path.join(DATA_ROOT, 'closed_sales');
  await ensureDir(dir);
  const file = path.join(dir, `FL_${county.replace(/\s+/g,'')}.json`);

  // Load existing data and deduplicate by saleId
  let existing: any[] = [];
  try {
    existing = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {}

  const map = new Map<string, any>();
  for (const r of existing) map.set(r.saleId || '', r);
  for (const r of normalized) map.set(r.saleId, r);

  const merged = Array.from(map.values())
    .filter(x => x.saleId)
    .sort((a, b) => (b.closeDate || '').localeCompare(a.closeDate || '') || (b.saleId.localeCompare(a.saleId)));

  await atomicWrite(file, merged);
  
  // Calculate correctly: added = newly merged records, not all fetched records
  const actuallyAdded = merged.length - existing.length;
  
  // Update manifest
  await updateManifest(county, actuallyAdded, merged.length);
  
  return { county, added: actuallyAdded, total: merged.length, file };
}

export async function importParcels(county: string) {
  const key = process.env.ATTOM_API_KEY!;
  if (!key) throw new Error('Missing ATTOM_API_KEY');

  // Minimal parcel shape pull (exact path may differ per plan; placeholder flow):
  const data = await attomGet('/propertyapi/v1.0.0/parcelsummary/snapshot', key, {
    countyname: county, state: 'FL', pagesize: 100, page: 1
  }).catch(() => ({ parcels: [] }));
  const items = (data?.parcels || data?.property || []);
  const normalized = items.map((p: any) => ({
    apn: p?.identifier?.apn,
    wkt: p?.area?.geometryWkt || undefined,
    bbox: p?.area?.bbox || undefined
  })).filter((x: any) => x.wkt);

  const outDir = path.join(DATA_ROOT, 'parcels');
  await ensureDir(outDir);
  const out = path.join(outDir, `FL_${county.replace(/\s+/g,'')}.json`);
  await fs.writeFile(out, JSON.stringify(normalized, null, 2), 'utf8');
  return { file: out, count: normalized.length };
}

export async function importSubjectByAddress(addressLine1: string, city: string, state='FL', zip?: string) {
  const key = process.env.ATTOM_API_KEY!;
  const data = await attomGet('/propertyapi/v1.0.0/property/detail', key, {
    address1: addressLine1, city, state, postalcode: zip
  });
  const p = Array.isArray(data?.property) ? data.property[0] : data?.property;
  if (!p) return null;

  const subject = {
    attomId: p?.identifier?.attomId,
    apn: p?.identifier?.apn,
    address: { line1: p?.address?.line1, city: p?.address?.city, state: p?.address?.state, zip: p?.address?.postal1 },
    location: { lat: p?.location?.latitude, lon: p?.location?.longitude },
    char: {
      yearBuilt: p?.building?.summary?.yearbuilt,
      sqft: p?.building?.size?.livingsize,
      lotSizeSqft: p?.lot?.lotsize1,
      beds: p?.building?.rooms?.beds,
      baths: p?.building?.rooms?.bathsfull
    },
    assessment: {
      landValue: p?.assessment?.land?.assessed,
      improvementValue: p?.assessment?.improvements?.assessed,
      totalValue: p?.assessment?.assessed?.assessed,
      taxYear: p?.assessment?.year
    },
    lastSale: {
      price: p?.sale?.amount,
      date: p?.sale?.saledate,
      docNum: p?.sale?.documentnum
    }
  };
  await ensureDir('data/attom/subjects');
  await fs.writeFile(`data/attom/subjects/${subject.attomId || subject.apn || 'subject'}.json`, JSON.stringify(subject, null, 2));
  return subject;
}