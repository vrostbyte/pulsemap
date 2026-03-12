/**
 * PulseMap — Disease outbreak proxy via ReliefWeb API (Vercel Edge Function).
 * ReliefWeb returns JSON with native lat/lon — no XML parsing needed.
 * Docs: https://apidoc.reliefweb.int/
 */
export const config = { runtime: 'edge' };

const RELIEFWEB_URL = 'https://api.reliefweb.int/v2/reports?appname=pulsemap';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const upstream = await fetch(RELIEFWEB_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        filter: { field: 'primary_type.name', value: 'Epidemic' },
        fields: { include: ['title', 'date.created', 'country.name', 'country.location'] },
        limit: 50,
        sort: ['date.created:desc'],
      }),
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `ReliefWeb returned ${upstream.status}` }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    const json = await upstream.json() as {
      data?: Array<{
        fields: {
          title: string;
          date: { created: string };
          country?: Array<{ name: string; location?: { lat: number; lon: number } }>;
        };
      }>;
    };

    // Normalise to flat array the client expects
    const outbreaks = (json.data ?? []).map((item) => {
      const country = item.fields.country?.[0];
      return {
        title:     item.fields.title,
        date:      item.fields.date.created,
        country:   country?.name ?? 'Unknown',
        lat:       country?.location?.lat ?? 0,
        lng:       country?.location?.lon ?? 0,
      };
    }).filter(o => o.lat !== 0 && o.lng !== 0);

    return new Response(JSON.stringify(outbreaks), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800, s-maxage=1800',
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
