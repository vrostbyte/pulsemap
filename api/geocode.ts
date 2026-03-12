/**
 * PulseMap — Census Geocoding CORS proxy (Vercel Edge Function).
 * Accepts ?zip=XXXXX and returns FIPS + coordinates.
 * Uses the geographies endpoint so we get county FIPS back.
 */
export const config = { runtime: 'edge' };

const CENSUS_BASE =
  'https://geocoding.geo.census.gov/geocoder/geographies/address';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const zip = url.searchParams.get('zip');

  if (!zip || !/^\d{5}$/.test(zip)) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid zip parameter (5 digits required)' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }

  const upstreamUrl =
    `${CENSUS_BASE}` +
    `?benchmark=Public_AR_Current` +
    `&vintage=Current_Current` +
    `&format=json` +
    `&zip=${encodeURIComponent(zip)}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `Census geocoder returned ${upstream.status}` }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const data = await upstream.text();
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
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
