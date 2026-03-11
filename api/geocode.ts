/**
 * PulseMap — US Census Bureau Geocoding API CORS proxy (Vercel Edge Function).
 *
 * The Census geocoder doesn't send CORS headers, so browsers can't call it
 * directly.  This proxy adds CORS headers and forwards the request.
 *
 * Usage: GET /api/geocode?address=<address>&benchmark=Public_AR_Current
 * Returns: Census geocoder JSON response
 *
 * Upstream: https://geocoding.geo.census.gov/geocoder/locations/onelineaddress
 * Docs:     https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html
 */

export const config = { runtime: 'nodejs' };

const CENSUS_GEOCODER_BASE =
  'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';

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
  const address = url.searchParams.get('address');

  if (!address) {
    return new Response(
      JSON.stringify({ error: 'Missing required parameter: address' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      },
    );
  }

  const benchmark = url.searchParams.get('benchmark') ?? 'Public_AR_Current';

  const upstreamUrl =
    `${CENSUS_GEOCODER_BASE}` +
    `?address=${encodeURIComponent(address)}` +
    `&benchmark=${encodeURIComponent(benchmark)}` +
    `&format=json`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `Census geocoder returned ${upstream.status}` }),
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
