/**
 * PulseMap — CDC FluView API proxy (Vercel Edge Function).
 *
 * Fetches current-season influenza-like illness (ILI) surveillance data
 * from the CMU Delphi Epidata API (mirrors CDC ILINet / FluView data).
 *
 * Upstream: https://api.delphi.cmu.edu/epidata/fluview/
 * Docs:     https://cmu-delphi.github.io/delphi-epidata/api/fluview.html
 *
 * Cache: 24 hours (data is published weekly).
 */

export const config = { runtime: 'nodejs' };

// CDC ILINet data via CMU Delphi Epidata API (mirrors CDC FluView, publicly accessible)
const FLUVIEW_DELPHI_URL =
  'https://api.delphi.cmu.edu/epidata/fluview/' +
  '?regions=hhs1,hhs2,hhs3,hhs4,hhs5,hhs6,hhs7,hhs8,hhs9,hhs10' +
  '&epiweeks=202401-202552';

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
    const upstream = await fetch(FLUVIEW_DELPHI_URL, {
      headers: { Accept: 'application/json' },
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `Delphi Epidata returned ${upstream.status}` }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        },
      );
    }

    const raw = (await upstream.json()) as {
      result?: number;
      epidata?: Array<Record<string, unknown>>;
    };

    // Normalise Delphi response to flat region rows
    const normalised = (raw.epidata ?? []).map((item) => {
      const regionRaw = String(item['region'] ?? '');
      const region = regionRaw === 'nat'
        ? 'National'
        : regionRaw.startsWith('hhs')
          ? `Region ${regionRaw.slice(3)}`
          : regionRaw;
      return {
        region,
        ili_pct:           Number(item['ili']) || 0,
        ili_total:         Number(item['num_ili']) || 0,
        num_providers:     Number(item['num_providers']) || 0,
        week_ending:       String(item['epiweek'] ?? ''),
        national_baseline: 3.1, // CDC 2025-26 season baseline
      };
    });

    return new Response(JSON.stringify(normalised), {
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
