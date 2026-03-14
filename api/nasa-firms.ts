/**
 * PulseMap — NASA FIRMS Wildfire API proxy (Vercel Edge Function).
 * Fetches VIIRS NOAA-20 Near Real-Time fire detections for the continental US.
 * Cache TTL: 30 minutes (data updated every 3 hours by NASA).
 */
export const config = { runtime: 'edge' };

const BBOX = '-125,24,-66,50'; // continental US: west,south,east,north
const DAYS  = '1';
const PRODUCT = 'VIIRS_NOAA20_NRT';

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
 * Expected header (index positions used, not names, for resilience):
 *   latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,
 *   satellite,instrument,confidence,version,bright_ti5,frp,daynight
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

  const idx = {
    latitude:   header.indexOf('latitude'),
    longitude:  header.indexOf('longitude'),
    bright_ti4: header.indexOf('bright_ti4'),
    frp:        header.indexOf('frp'),
  };

  // Require all columns to be present
  const missingCols = Object.entries(idx)
    .filter(([, v]) => v === -1)
    .map(([k]) => k);
  if (missingCols.length > 0) {
    console.log('[FIRMS] guard failed: missing columns:', missingCols.join(', '));
    return [];
  }
  console.log('[FIRMS] guard passed');

  const rows: FireRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;
    const cols = line.split(',');




    const lat        = parseFloat(cols[idx.latitude]   ?? '');
    const lng        = parseFloat(cols[idx.longitude]  ?? '');
    const brightness = parseFloat(cols[idx.bright_ti4] ?? '');
    const frp        = parseFloat(cols[idx.frp]        ?? '');

    if (isNaN(lat) || isNaN(lng) || isNaN(brightness) || isNaN(frp)) continue;

    rows.push({ lat, lng, brightness, frp });
  }

  return rows;
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

  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/${PRODUCT}/${BBOX}/${DAYS}`;

  try {
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `NASA FIRMS returned ${upstream.status}` }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const csv  = await upstream.text();
    console.log('[FIRMS] raw response (first 500 chars):', csv.slice(0, 500));
    console.log('[FIRMS] total response length:', csv.length);
    const rows = parseCsv(csv);
    console.log('[FIRMS] parsed row count:', rows.length);

    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800, s-maxage=1800',
        'X-Cache': 'MISS',
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
