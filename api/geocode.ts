/**
 * PulseMap — ZIP code geocoding proxy (Vercel Edge Function).
 * Uses Nominatim (OpenStreetMap) — no API key, accepts ZIP directly.
 */
export const config = { runtime: 'edge' };

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
      JSON.stringify({ error: 'Missing or invalid zip (5 digits required)' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }

  const nominatimUrl =
    `https://nominatim.openstreetmap.org/search` +
    `?postalcode=${encodeURIComponent(zip)}` +
    `&country=us&format=json&limit=1&addressdetails=1`;

  try {
    const upstream = await fetch(nominatimUrl, {
      headers: { 'User-Agent': 'PulseMap/1.0 (pulsemap.org)' },
      signal: AbortSignal.timeout(8_000),
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `Nominatim returned ${upstream.status}` }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const results = await upstream.json() as Array<{
      lat: string; lon: string;
      display_name: string;
      address?: { county?: string; state?: string; postcode?: string };
    }>;

    if (!results.length) {
      return new Response(
        JSON.stringify({ error: `ZIP ${zip} not found` }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const r = results[0]!;
    // Return in the same shape zipToFips.ts expects
    const payload = {
      result: {
        addressMatches: [{
          coordinates: { x: parseFloat(r.lon), y: parseFloat(r.lat) },
          geographies: {
            Counties: [{
              NAME: r.address?.county ?? r.display_name.split(',')[1]?.trim() ?? '',
              'State Code': r.address?.state_code ?? r.address?.state ?? '',
              GEOID: '',
            }],
          },
        }],
      },
    };

    return new Response(JSON.stringify(payload), {
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
