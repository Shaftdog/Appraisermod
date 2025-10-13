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

  // ATTOM API: Use /property/snapshot with geographic and date filters
  // This endpoint returns properties with sales transactions in the specified area/time range
  const since = new Date(); since.setMonth(since.getMonth() - monthsBack);
  const sinceIso = since.toISOString().slice(0,10).replace(/-/g, '/'); // ATTOM expects YYYY/MM/DD format
  const nowIso = new Date().toISOString().slice(0,10).replace(/-/g, '/');

  // Call #1: property sales list (paged). Keep it simple: loop pages up to a safe max.
  let page = 1, maxPages = 20;
  const sales: any[] = [];
  while (page <= maxPages) {
    let tries = 0;
    let data: any;
    while (tries < 3) {
      try {
        const clientFn = testClient || attomGet;
        // Use property/snapshot with geographic and sale date filters
        data = await clientFn('/propertyapi/v1.0.0/property/snapshot', key, {
          // Geographic filter - use county if available, otherwise default approach
          // Note: ATTOM expects FIPS codes for counties, or use radius/zipcode
          postalcode: '', // Leave empty to search by other criteria
          radius: 50, // Search within 50 miles if using lat/lng
          // Sale date filters (transaction date range)
          startsaletransdate: sinceIso,
          endsaletransdate: nowIso,
          // Pagination
          page,
          pagesize: 100
        });
        break;
      } catch (e: any) {
        tries++;
        if (tries >= 3) {
          console.error('ATTOM sales error after retries', e.message);
          data = { property: [] };
          break;
        }
        await backoff(tries === 1 ? 500 : 1500);
      }
    }

    const items = (data?.property || []);
    if (!items.length) break;
    sales.push(...items);
    page += 1;
  }

  // Normalize minimal fields into ClosedSale[]
  // Filter out any undefined/null sales before processing
  const normalized = sales.filter((s: any) => s && typeof s === 'object').map((s: any) => {
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
  // Combine city, state, and zip into address2 parameter as required by ATTOM API
  const address2Parts = [city, state];
  if (zip) address2Parts.push(zip);
  const address2 = address2Parts.join(', ');
  
  const data = await attomGet('/propertyapi/v1.0.0/property/detail', key, {
    address1: addressLine1, 
    address2: address2
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

export async function importClosedSalesByLocation(
  lat: number,
  lng: number,
  radiusMiles: number = 1.0,
  monthsBack: number = 12,
  minSalePrice: number = 1,
  maxSalePrice: number = 10000000,
  testClient?: (endpoint: string, key: string, params: any) => Promise<any>
) {
  const key = process.env.ATTOM_API_KEY!;
  if (!key) throw new Error('Missing ATTOM_API_KEY');

  const clientFn = testClient || attomGet;

  // Calculate date range for filtering
  const since = new Date(); 
  since.setMonth(since.getMonth() - monthsBack);
  const sinceDate = since;
  const nowDate = new Date();

  console.log(`[ATTOM] Two-step import: location (${lat}, ${lng}) radius ${radiusMiles}mi, ${monthsBack}mo back, $${minSalePrice}-$${maxSalePrice}`);

  // STEP 1: Get properties by location only (no sale filters - ATTOM doesn't support them)
  let page = 1, maxPages = 20;
  const properties: any[] = [];
  let apiCalls = 0;
  
  while (page <= maxPages) {
    let tries = 0;
    let data: any;
    
    while (tries < 3) {
      try {
        apiCalls++;
        data = await clientFn('/propertyapi/v1.0.0/property/snapshot', key, {
          latitude: lat,
          longitude: lng,
          radius: radiusMiles,
          page,
          pagesize: 100
        });
        break;
      } catch (e: any) {
        tries++;
        if (tries >= 3) {
          console.error(`[ATTOM] Step 1 error after retries:`, e.message);
          data = { property: [] };
          break;
        }
        await backoff(tries === 1 ? 500 : 1500);
      }
    }

    const items = (data?.property || []);
    if (!items.length) break;
    properties.push(...items);
    console.log(`[ATTOM] Step 1 page ${page}: ${items.length} properties`);
    page += 1;
  }

  console.log(`[ATTOM] Step 1 complete: ${properties.length} properties found, ${apiCalls} API calls used`);

  // STEP 2: For each property, get sale history via /property/expandedprofile
  // Rate limit optimization: Limit Step 2 to prevent API quota exhaustion
  const MAX_EXPANDEDPROFILE_CALLS = 50; // Conservative limit to preserve API quota (500/month)
  const propertiesToLookup = properties.slice(0, MAX_EXPANDEDPROFILE_CALLS);
  
  if (properties.length > MAX_EXPANDEDPROFILE_CALLS) {
    console.log(`[ATTOM] Rate limit optimization: checking first ${MAX_EXPANDEDPROFILE_CALLS} of ${properties.length} properties`);
  }

  const propertiesWithSales: any[] = [];
  let step2Calls = 0;
  let step2Successes = 0;
  
  for (const prop of propertiesToLookup) {
    // Use attomId if available, otherwise try APN
    const attomId = prop?.identifier?.attomId;
    const apn = prop?.identifier?.apn || prop?.identifier?.apnOriginal;
    
    if (!attomId && !apn) continue;

    let tries = 0;
    let saleData: any;
    
    while (tries < 3) {
      try {
        step2Calls++;
        apiCalls++;
        
        // Call expandedprofile with attomId or APN
        const params: any = {};
        if (attomId) {
          params.attomid = attomId;
        } else if (apn) {
          params.apn = apn;
        }
        
        saleData = await clientFn('/propertyapi/v1.0.0/property/expandedprofile', key, params);
        step2Successes++;
        break;
      } catch (e: any) {
        tries++;
        if (tries >= 3) {
          console.error(`[ATTOM] Step 2 error for ${attomId || apn}:`, e.message);
          saleData = null;
          break;
        }
        await backoff(tries === 1 ? 300 : 1000);
      }
    }

    // Extract sale history from expandedprofile response
    const propData = Array.isArray(saleData?.property) ? saleData.property[0] : saleData?.property;
    if (propData?.sale) {
      // Merge property data with sale data
      propertiesWithSales.push({
        ...prop,
        sale: propData.sale
      });
    }

    // Early termination: If we have enough valid sales, stop to conserve API calls
    if (propertiesWithSales.length >= 25) {
      console.log(`[ATTOM] Early termination: found ${propertiesWithSales.length} properties with sales, stopping to conserve API quota`);
      break;
    }
  }

  console.log(`[ATTOM] Step 2 complete: ${propertiesWithSales.length} properties with sale data, ${step2Calls} API calls used (${step2Successes} successful)`);
  console.log(`[ATTOM] Total API calls: ${apiCalls}`);

  // STEP 3: Normalize and filter by date/price criteria
  const normalized = propertiesWithSales.filter((s: any) => s && typeof s === 'object').map((s: any) => {
    const address = `${s?.address?.oneLine || [s?.address?.line1, s?.address?.city, s?.address?.state, s?.address?.zip].filter(Boolean).join(', ')}`;
    
    // Extract sale date from various possible fields
    const closeDate = s?.sale?.saleTransDate || s?.sale?.saleSearchDate || s?.sale?.saleRecDate || s?.sale?.saleDate;
    
    // Extract sale price - handle nested structure (sale.amount.saleAmt) or direct (sale.saleAmt)
    let closePrice = 0;
    if (s?.sale?.amount?.saleAmt) {
      closePrice = Number(s.sale.amount.saleAmt);
    } else if (s?.sale?.saleAmt) {
      closePrice = Number(s.sale.saleAmt);
    } else if (typeof s?.sale?.amount === 'number') {
      closePrice = Number(s.sale.amount);
    }
    
    const apn = s?.identifier?.apn || s?.identifier?.apnOriginal;
    
    const saleId = stableSaleId({
      county: s?.area?.countrySecSubd || 'Unknown',
      closeDate,
      closePrice,
      apn,
      address
    });
    
    return {
      id: saleId,
      saleId,
      apn,
      address,
      city: s?.address?.city,
      state: s?.address?.state,
      zip: s?.address?.zip,
      closeDate,
      closePrice,
      gla: Number(s?.building?.size?.grossSize || s?.building?.size?.universalsize || s?.building?.size?.livingsize || 0),
      lotSizeSqft: Number(s?.lot?.lotSize1 || s?.lot?.lotSize || 0),
      lat: s?.location?.latitude, 
      lon: s?.location?.longitude
    };
  });
  
  const filtered = normalized.filter((x: any) => {
    // Filter by sale date and price range
    if (!x.closeDate || !x.closePrice) return false;
    
    const saleDate = new Date(x.closeDate);
    if (isNaN(saleDate.getTime())) return false;
    if (saleDate < sinceDate || saleDate > nowDate) return false;
    if (x.closePrice < minSalePrice || x.closePrice > maxSalePrice) return false;
    
    return true;
  });

  console.log(`[ATTOM] Final result: ${filtered.length} sales match criteria (after filtering)`);

  return {
    sales: filtered,
    count: filtered.length,
    apiCalls // Track API usage for monitoring
  };
}