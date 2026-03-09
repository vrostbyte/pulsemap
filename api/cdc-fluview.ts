/**
 * PulseMap — CDC FluView API proxy (Vercel Edge Function).
 *
 * Fetches current-season influenza-like illness (ILI) surveillance data
 * from the CDC FluView interactive API by HHS region.
 *
 * Upstream: https://gis.cdc.gov/grasp/flu2/GetFlu2Data
 * Docs:     https://gis.cdc.gov/grasp/flu2/flu2help.html
 *
 * The API accepts a POST body with season and region parameters.
 * Cache: 24 hours (data is published weekly).
 */

export const config = { runtime: 'edge' };

const FLUVIEW_URL = 'https://gis.cdc.gov/grasp/flu2/GetFlu2Data';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Request payload for the current season, all HHS regions, ILI data type
const FLUVIEW_REQUEST_BODY = JSON.stringify({
  AppVersion: 'Public',
  DatasourceDT: [{ ID: 1, Name: 'ILINet' }],
  RegionTypeId: 3, // HHS Regions
  SubRegionsDT: [
    { ID: 1 }, { ID: 2 }, { ID: 3 }, { ID: 4 },
    { ID: 5 }, { ID: 6 }, { ID: 7 }, { ID: 8 },
    { ID: 9 }, { ID: 10 },
  ],
  SeasonsDT: [{ ID: 66 }], // Current (2024-25) season — update annually
  DataItemsDT: [{ ID: 'ILI' }, { ID: 'ILITOTAL' }, { ID: 'NUM_OF_PROVIDERS' }],
  HHSRegionsDT: [],
  CensusDivsDT: [],
});

interface FluViewDataItem {
  REGION?: string;
  WEEKEND?: string;
  ILI?: number | string;
  ILITOTAL?: number | string;
  NUM_OF_PROVIDERS?: number | string;
  [key: string]: unknown;
}

interface FluViewResponse {
  DataItems?: FluViewDataItem[];
  [key: string]: unknown;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const upstream = await fetch(FLUVIEW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: FLUVIEW_REQUEST_BODY,
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `CDC FluView returned ${upstream.status}` }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        },
      );
    }

    const raw = (await upstream.json()) as FluViewResponse;

    // Normalise to a flat array of HHS region rows
    const items = raw.DataItems ?? [];
    const normalised = items.map((item) => ({
      region: `Region ${item.REGION ?? ''}`.trim(),
      ili_pct: Number(item.ILI) || 0,
      ili_total: Number(item.ILITOTAL) || 0,
      num_providers: Number(item.NUM_OF_PROVIDERS) || 0,
      week_ending: item.WEEKEND ?? '',
      national_baseline: 2.5, // CDC publishes this; hardcoded for MVP
    }));

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
