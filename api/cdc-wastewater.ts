/**
 * PulseMap — CDC NWSS Wastewater API proxy (Vercel Edge Function).
 *
 * Proxies the CDC National Wastewater Surveillance System Socrata endpoint.
 * This is a fully public API — no API key required.
 *
 * Upstream: https://data.cdc.gov/resource/2ew6-ywp6.json
 * Docs:     https://dev.socrata.com/foundry/data.cdc.gov/2ew6-ywp6
 *
 * Cache: 1 hour (data is published weekly but there's no cost to re-checking)
 */

export const config = { runtime: 'nodejs' };

const CDC_NWSS_URL =
  'https://data.cdc.gov/resource/2ew6-ywp6.json' +
  '?$limit=10000' +
  '&$select=county_fips,state_abbr,ptc_15d,percentile,level,date_start,county_lat,county_long' +
  '&$order=date_start%20DESC';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const upstream = await fetch(CDC_NWSS_URL, {
      headers: {
        Accept: 'application/json',
        // Socrata allows anonymous access but recommends an app token for
        // higher rate limits.  Add X-App-Token header here if throttled.
      },
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream CDC API returned ${upstream.status}` }),
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
