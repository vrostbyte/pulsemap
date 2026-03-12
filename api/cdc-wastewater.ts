/**
 * PulseMap — CDC NWSS Wastewater API proxy (Vercel Edge Function).
 * Uses Upstash Redis cache-aside to avoid CDC timeout issues.
 * Cache TTL: 1 hour (data published weekly).
 */
export const config = { runtime: 'edge' };

const CDC_NWSS_URL =
  'https://data.cdc.gov/resource/2ew6-ywp6.json' +
  '?$limit=10000' +
  '&$select=county_fips,county_names,wwtp_jurisdiction,ptc_15d,percentile,date_start,date_end' +
  '&$order=date_start%20DESC';

const CACHE_KEY = 'pulsemap:wastewater:v1';
const CACHE_TTL = 3600;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function redisGet(url: string, token: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json() as { result: string | null };
    return json.result ?? null;
  } catch { return null; }
}

async function redisSet(url: string, token: string, key: string, value: string, ttl: number): Promise<void> {
  try {
    await fetch(`${url}/set/${key}?EX=${ttl}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  } catch { /* best effort */ }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const redisUrl = process.env['UPSTASH_REDIS_REST_URL'];
  const redisToken = process.env['UPSTASH_REDIS_REST_TOKEN'];
  const appToken = process.env['CDC_SOCRATA_APP_TOKEN'];

  // ── Step 1: Try Redis cache ────────────────────────────────────────────────
  if (redisUrl && redisToken) {
    const cached = await redisGet(redisUrl, redisToken, CACHE_KEY);
    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          'X-Cache': 'HIT',
          ...CORS_HEADERS,
        },
      });
    }
  }

  // ── Step 2: Fetch from CDC ─────────────────────────────────────────────────
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (appToken) headers['X-App-Token'] = appToken;

    const upstream = await fetch(CDC_NWSS_URL, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `CDC returned ${upstream.status}` }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const data = await upstream.text();

    // ── Step 3: Store in Redis ───────────────────────────────────────────────
    if (redisUrl && redisToken) {
      await redisSet(redisUrl, redisToken, CACHE_KEY, data, CACHE_TTL);
    }

    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'X-Cache': 'MISS',
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    // ── Step 4: Stale cache fallback on error ────────────────────────────────
    if (redisUrl && redisToken) {
      const stale = await redisGet(redisUrl, redisToken, CACHE_KEY);
      if (stale) {
        return new Response(stale, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Cache': 'STALE',
            ...CORS_HEADERS,
          },
        });
      }
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
}
