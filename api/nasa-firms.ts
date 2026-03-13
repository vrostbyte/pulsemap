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
  { lat: 38.5, lng: -120.5, brightness: 420, confidence: 'h', frp: 45.2 },
  { lat: 39.2, lng: -121.1, brightness: 385, confidence: 'n', frp: 22.7 },
  { lat: 37.8, lng: -119.8, brightness: 465, confidence: 'h', frp: 78.4 },
];

// ─── CSV parser ───────────────────────────────────────────────────────────────

interface FireRow {
  lat:        number;
  lng:        number;
  brightness: number;
  confidence: string;
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
  const idx = {
    latitude:   header.indexOf('latitude'),
    longitude:  header.indexOf('longitude'),
    bright_ti4: header.indexOf('bright_ti4'),
    confidence: header.indexOf('confidence'),
    frp:        header.indexOf('frp'),
    daynight:   header.indexOf('daynight'),
  };

  // Require all columns to be present
  if (Object.values(idx).some((i) => i === -1)) return [];

  const rows: FireRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') continue;
    const cols = line.split(',');

    const confidence = (cols[idx.confidence] ?? '').trim().toLowerCase();
    const daynight   = (cols[idx.daynight]   ?? '').trim().toUpperCase();

    // Skip low-confidence or nighttime detections
    if (confidence === 'l') continue;
    if (daynight !== 'D')   continue;

    const lat        = parseFloat(cols[idx.latitude]   ?? '');
    const lng        = parseFloat(cols[idx.longitude]  ?? '');
    const brightness = parseFloat(cols[idx.bright_ti4] ?? '');
    const frp        = parseFloat(cols[idx.frp]        ?? '');

    if (isNaN(lat) || isNaN(lng) || isNaN(brightness) || isNaN(frp)) continue;

    rows.push({ lat, lng, brightness, confidence, frp });
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
    const rows = parseCsv(csv);

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
