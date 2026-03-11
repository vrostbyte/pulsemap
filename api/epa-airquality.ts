/**
 * PulseMap — EPA AirNow API proxy (Vercel Edge Function).
 *
 * Adds the AirNow API key (from environment variable) and sets CORS headers.
 * Accepts ?zip= for a specific location or ?lat=&lng= for coordinate-based
 * queries.  Defaults to a 25-mile radius when querying by ZIP.
 *
 * Upstream: https://www.airnowapi.org/aq/observation/zipCode/current/
 * API key:  Free from https://docs.airnowapi.org/account/request/
 * Cache:    1 hour (AirNow updates hourly)
 */

export const config = { runtime: 'nodejs' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const AIRNOW_BASE = 'https://www.airnowapi.org/aq/observation';

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const apiKey = process.env['AIRNOW_API_KEY'];
  if (!apiKey) {
    // Return empty array instead of an error — the client falls back to mock data
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const url = new URL(request.url);
  const zip = url.searchParams.get('zip');
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');

  let upstreamUrl: string;

  if (zip) {
    upstreamUrl =
      `${AIRNOW_BASE}/zipCode/current/` +
      `?format=application/json` +
      `&zipCode=${encodeURIComponent(zip)}` +
      `&distance=25` +
      `&API_KEY=${apiKey}`;
  } else if (lat && lng) {
    upstreamUrl =
      `${AIRNOW_BASE}/latLong/current/` +
      `?format=application/json` +
      `&latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lng)}` +
      `&distance=25` +
      `&API_KEY=${apiKey}`;
  } else {
    // No location provided — return empty array
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `AirNow API returned ${upstream.status}` }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        },
      );
    }

    const data = await upstream.text();

    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
}
