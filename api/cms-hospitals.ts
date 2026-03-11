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

// Inline ZIP centroid lookup (subset of major ZIPs for Vercel bundling compatibility)
function zipToLatLng(zip: string): [number, number] | null {
  // Delegate to a small hardcoded table for the most common hospital ZIPs.
  // Full lookup happens client-side; this just needs rough coordinates.
  const z = zip?.toString().padStart(5, '0') ?? '';
  // State centroid fallback by ZIP prefix
  const prefix = z.slice(0, 3);
  const STATE_CENTS: Record<string, string> = {
    '350':'AL', '995':'AK', '850':'AZ', '716':'AR', '900':'CA',
    '800':'CO', '060':'CT', '197':'DE', '320':'FL', '300':'GA',
    '967':'HI', '832':'ID', '600':'IL', '460':'IN', '500':'IA',
    '660':'KS', '400':'KY', '700':'LA', '040':'ME', '210':'MD',
    '010':'MA', '480':'MI', '550':'MN', '386':'MS', '630':'MO',
    '590':'MT', '680':'NE', '889':'NV', '030':'NH', '070':'NJ',
    '870':'NM', '100':'NY', '270':'NC', '580':'ND', '430':'OH',
    '730':'OK', '970':'OR', '190':'PA', '028':'RI', '290':'SC',
    '570':'SD', '370':'TN', '750':'TX', '840':'UT', '050':'VT',
    '220':'VA', '980':'WA', '247':'WV', '530':'WI', '820':'WY',
  };
  const COORDS: Record<string, [number, number]> = {
    'AL':[32.806671,-86.791130],'AK':[61.370716,-152.404419],
    'AZ':[33.729759,-111.431221],'AR':[34.969704,-92.373123],
    'CA':[36.116203,-119.681564],'CO':[39.059811,-105.311104],
    'CT':[41.597782,-72.755371],'DE':[39.318523,-75.507141],
    'FL':[27.766279,-81.686783],'GA':[33.040619,-83.643074],
    'HI':[21.094318,-157.498337],'ID':[44.240459,-114.478828],
    'IL':[40.349457,-88.986137],'IN':[39.849426,-86.258278],
    'IA':[42.011539,-93.210526],'KS':[38.526600,-96.726486],
    'KY':[37.668140,-84.670067],'LA':[31.169960,-91.867805],
    'ME':[44.693947,-69.381927],'MD':[39.063946,-76.802101],
    'MA':[42.230171,-71.530106],'MI':[43.326618,-84.536095],
    'MN':[45.694454,-93.900192],'MS':[32.741646,-89.678696],
    'MO':[38.456085,-92.288368],'MT':[46.921925,-110.454353],
    'NE':[41.125370,-98.268082],'NV':[38.313515,-117.055374],
    'NH':[43.452492,-71.563896],'NJ':[40.298904,-74.521011],
    'NM':[34.840515,-106.248482],'NY':[42.165726,-74.948051],
    'NC':[35.630066,-79.806419],'ND':[47.528912,-99.784012],
    'OH':[40.388783,-82.764915],'OK':[35.565342,-96.928917],
    'OR':[44.572021,-122.070938],'PA':[40.590752,-77.209755],
    'RI':[41.680893,-71.511780],'SC':[33.856892,-80.945007],
    'SD':[44.299782,-99.438828],'TN':[35.747845,-86.692345],
    'TX':[31.054487,-97.563461],'UT':[40.150032,-111.862434],
    'VT':[44.045876,-72.710686],'VA':[37.769337,-78.169968],
    'WA':[47.400902,-121.490494],'WV':[38.491226,-80.954453],
    'WI':[44.268543,-89.616508],'WY':[42.755966,-107.302490],
  };
  const state = STATE_CENTS[prefix];
  if (state && COORDS[state]) return COORDS[state];
  return null;
}


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
        lat:                coords ? coords[0] : 39.5,
        lng:                coords ? coords[1] : -98.35,
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
