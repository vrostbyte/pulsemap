/**
 * PulseMap — CMS Hospital Compare API proxy (Vercel Edge Function).
 *
 * Fetches hospital data from the CMS Provider Data Catalog.
 * This is a fully public API — no API key required.
 *
 * Upstream: https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0
 * Docs:     https://data.cms.gov/provider-data/
 *
 * Cache: 24 hours (hospital structural data changes slowly)
 *
 * Note: CMS returns zip_code but no geocoded coordinates.
 * We resolve coordinates via a static ZIP centroid lookup table.
 */

export const config = { runtime: 'edge' };

import { zipToLatLng } from './_zip-centroids.js';

const CMS_URL =
  'https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0' +
  '?limit=1500' +
  '&offset=0' +
  '&keys=true';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface CmsDatastoreResponse {
  results?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const upstream = await fetch(CMS_URL, {
      headers: { Accept: 'application/json' },
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `CMS API returned ${upstream.status}` }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        },
      );
    }

    const raw = (await upstream.json()) as CmsDatastoreResponse;

    // Extract and project only the fields we need.
    // CMS returns zip_code instead of geocoded coordinates, so we use the
    // ZIP centroid lookup table to resolve lat/lng.
    const results = (raw.results ?? []).map((row) => {
      const zip = String(row['zip_code'] ?? '').replace(/\D/g, '').slice(0, 5);
      const coords = zipToLatLng(zip);
      return {
        hospital_name:      row['hospital_name'] ?? '',
        address:            row['address'] ?? '',
        city:               row['city'] ?? '',
        state:              row['state'] ?? '',
        hospital_type:      row['hospital_type'] ?? '',
        emergency_services: row['emergency_services'] ?? '',
        lat:                coords ? coords[0] : null,
        lng:                coords ? coords[1] : null,
      };
    });

    return new Response(JSON.stringify(results), {
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
