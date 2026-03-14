/**
 * PulseMap — NASA FIRMS Wildfire API proxy (Vercel Edge Function).
 * Fetches VIIRS NOAA-20 Near Real-Time fire detections for the continental US.
 * Falls back to VIIRS_NOAA21_NRT if NOAA-20 returns zero rows.
 * Cache TTL: 30 minutes (data updated every 3 hours by NASA).
 */
export const config = { runtime: 'edge' };

const BBOX = '-125,24,-66,50'; // continental US: west,south,east,north
const DAYS  = '1';
const PRODUCTS = ['VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'] as const;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ─── Mock fallback (no API key in environment) ────────────────────────────────

const MOCK_FIRES = [
  { lat: 38.5, lng: -120.5, brightness: 420, frp: 45.2 },
  { lat: 39.2, lng: -121.1, brightness: 385, frp: 22.7 },
  { lat: 37.8, lng: -119.8, brightness: 465, frp: 78.4 },
];

// ─── CSV parser ───────────────────────────────────────────────────────────────

interface FireRow {
  lat:        number;
  lng:        number;
  brightness: number;
  frp:        number;
}

/**
 * Parses the NASA FIRMS CSV response into fire row objects.
 * Dynamically finds column indices so it works across VIIRS products
 * that may use different brightness column names (bright_ti4 vs bright_ti5).
 */
function parseCsv(csv: string): FireRow[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  // Parse header to find column indices dynamically
  const header = (lines[0] ?? '').split(',').map((h) => h.trim());

  // Debug: log raw header and first 3 data lines
  console.log('[FIRMS] raw header:', lines[0]);
  for (let d = 1; d <= 3 && d < lines.length; d++) {
    console.log(`[FIRMS] raw data line ${d}:`, lines[d]);
  }

  const latIdx  = header.indexOf('latitude');
  const lngIdx  = header.indexOf('longitude');
  const frpIdx  = header.indexOf('frp');
  // Try bright_ti4 first, fall back to bright_ti5, then brightness
  let brightIdx = header.indexOf('bright_ti4');
  if (brightIdx === -1) brightIdx = header.indexOf('bright_ti5');
  if (brightIdx === -1) brightIdx = header.indexOf('brightness');

  // Require lat, lng, brightness, frp
  const missing: string[] = [];
  if (latIdx === -1)    missing.push('latitude');
  if (lngIdx === -1)    missing.push('longitude');
  if (brightIdx === -1) missing.push('bright_ti4/bright_ti5/brightness');
  if (frpIdx === -1)    missing.push('frp');

  if (missing.length > 0) {
    console.log('[FIRMS] guard failed: missing columns:', missing.join(', '));
    console.log('[FIRMS] all columns present:', header.join(', '));
    return [];
  }
  console.log('[FIRMS] guard passed');

  const rows: FireRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;
    const cols = line.split(',');

    const lat        = parseFloat(cols[latIdx]    ?? '');
    const lng        = parseFloat(cols[lngIdx]    ?? '');
    const brightness = parseFloat(cols[brightIdx] ?? '');
    const frp        = parseFloat(cols[frpIdx]    ?? '');

    if (isNaN(lat) || isNaN(lng) || isNaN(brightness) || isNaN(frp)) continue;

    rows.push({ lat, lng, brightness, frp });
  }

  return rows;
}

// ─── Fetch helper ──────────────────────────────────────────────────────────────

function firmUrl(apiKey: string, product: string): string {
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/${product}/${BBOX}/${DAYS}`;
}

async function fetchFirmsProduct(apiKey: string, product: string): Promise<{ csv: string; status: number }> {
  const url = firmUrl(apiKey, product);
  const upstream = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const csv = await upstream.text();
  return { csv, status: upstream.status };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const apiKey = process.env['NASA_FIRMS_API_KEY'];

  // Return mock data when no API key is configured
  if (!apiKey) {
    return new Response(JSON.stringify(MOCK_FIRES), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'MOCK', ...CORS_HEADERS },
    });
  }

  // Debug endpoint: ?debug=1 returns raw FIRMS response as plain text
  const reqUrl = new URL(request.url);
  if (reqUrl.searchParams.get('debug') === '1') {
    try {
      const results: string[] = [];
      for (const product of PRODUCTS) {
        const { csv, status } = await fetchFirmsProduct(apiKey, product);
        results.push(`=== ${product} (HTTP ${status}) ===\n${csv.slice(0, 800)}\n`);
      }
      return new Response(results.join('\n'), {
        status: 200,
        headers: { 'Content-Type': 'text/plain', ...CORS_HEADERS },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return new Response(`Debug fetch failed: ${message}`, {
        status: 502,
        headers: { 'Content-Type': 'text/plain', ...CORS_HEADERS },
      });
    }
  }

  try {
    // Try each FIRMS product until we get rows
    for (const product of PRODUCTS) {
      const url = firmUrl(apiKey, product);
      console.log(`[FIRMS] trying product: ${product}`);

      const upstream = await fetch(url, { signal: AbortSignal.timeout(20_000) });

      if (!upstream.ok) {
        console.log(`[FIRMS] ${product} returned HTTP ${upstream.status}`);
        continue;
      }

      const csv = await upstream.text();
      console.log(`[FIRMS] ${product} raw response (first 500 chars):`, csv.slice(0, 500));
      console.log(`[FIRMS] ${product} total response length:`, csv.length);

      const rows = parseCsv(csv);
      console.log(`[FIRMS] ${product} parsed row count:`, rows.length);

      if (rows.length > 0) {
        return new Response(JSON.stringify(rows), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=1800, s-maxage=1800',
            'X-Cache': 'MISS',
            'X-FIRMS-Product': product,
            ...CORS_HEADERS,
          },
        });
      }
    }

    // All products returned empty
    console.log('[FIRMS] all products returned 0 rows');
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800, s-maxage=1800',
        'X-Cache': 'EMPTY',
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
}
