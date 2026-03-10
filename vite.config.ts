/**
 * Vite configuration for PulseMap.
 *
 * Key setup:
 * - Path alias @/ → src/ so imports stay clean across deep directories
 * - CSS Modules enabled by default in Vite (*.module.css)
 * - Dev middleware: all /api/* routes are handled by configureServer plugins
 *   that replicate the Vercel Edge Function logic, bypassing Vite's file
 *   serving (which would otherwise return raw .ts source for api/*.ts files).
 *
 * In production, api/*.ts Vercel Edge Functions handle the same routes.
 */

import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import type { Connect } from 'vite';
import type { ServerResponse } from 'http';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function jsonResponse(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function extractXmlTag(xml: string, tag: string): string {
  const pattern = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`,
    'si',
  );
  return pattern.exec(xml)?.[1]?.trim() ?? '';
}

function parseRss(xml: string): Array<Record<string, string>> {
  const items: Array<Record<string, string>> = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemPattern.exec(xml)) !== null && items.length < 50) {
    const block = match[1] ?? '';
    items.push({
      title:       extractXmlTag(block, 'title'),
      link:        extractXmlTag(block, 'link'),
      pubDate:     extractXmlTag(block, 'pubDate'),
      description: extractXmlTag(block, 'description'),
    });
  }
  return items;
}

const HEALTH_ALERT_TYPES = new Set([
  'Excessive Heat Warning', 'Excessive Heat Watch', 'Heat Advisory',
  'Air Quality Alert', 'Air Quality Watch', 'Dense Fog Advisory',
  'Extreme Cold Warning', 'Extreme Cold Watch',
  'Wind Chill Warning', 'Wind Chill Watch', 'Wind Chill Advisory',
  'Freeze Warning', 'Freeze Watch',
]);

const FLUVIEW_REQUEST_BODY = JSON.stringify({
  AppVersion: 'Public',
  DatasourceDT: [{ ID: 1, Name: 'ILINet' }],
  RegionTypeId: 3,
  SubRegionsDT: [
    { ID: 1 }, { ID: 2 }, { ID: 3 }, { ID: 4 },
    { ID: 5 }, { ID: 6 }, { ID: 7 }, { ID: 8 },
    { ID: 9 }, { ID: 10 },
  ],
  SeasonsDT: [{ ID: 66 }],
  DataItemsDT: [{ ID: 'ILI' }, { ID: 'ILITOTAL' }, { ID: 'NUM_OF_PROVIDERS' }],
  HHSRegionsDT: [],
  CensusDivsDT: [],
});

// ─── Config ───────────────────────────────────────────────────────────────────


// ─── ZIP → [lat, lng] centroid lookup ────────────────────────────────────────
const ZIP_COORDS: Record<string,[number,number]> = {
  '10001':[40.75,-73.99],'10002':[40.71,-73.98],'10003':[40.73,-73.99],
  '90001':[33.97,-118.24],'90210':[34.09,-118.41],'90401':[34.02,-118.49],
  '60601':[41.88,-87.62],'60602':[41.88,-87.63],'60614':[41.92,-87.65],
  '77001':[29.75,-95.36],'77002':[29.75,-95.37],'77401':[29.71,-95.46],
  '85001':[33.45,-112.07],'85201':[33.42,-111.83],'85301':[33.54,-112.17],
  '19101':[39.95,-75.16],'19102':[39.95,-75.16],'19103':[39.95,-75.17],
  '78201':[29.43,-98.52],'78202':[29.43,-98.46],'78205':[29.42,-98.49],
  '98101':[47.61,-122.33],'98102':[47.63,-122.32],'98103':[47.66,-122.34],
  '30301':[33.75,-84.39],'30302':[33.75,-84.39],'30303':[33.75,-84.39],
  '02101':[42.36,-71.06],'02102':[42.36,-71.06],'02201':[42.36,-71.06],
  '80201':[39.74,-104.98],'80202':[39.74,-104.99],'80203':[39.73,-104.98],
  '98001':[47.31,-122.29],'33101':[25.77,-80.19],'33125':[25.77,-80.22],
  '63101':[38.63,-90.19],'64101':[39.10,-94.58],'66101':[39.11,-94.63],
  '55101':[44.95,-93.09],'55401':[44.98,-93.27],'53201':[43.03,-87.92],
  '46201':[39.78,-86.14],'43201':[39.96,-82.99],'44101':[41.50,-81.69],
  '15201':[40.45,-79.98],'17101':[40.26,-76.88],'21201':[39.30,-76.61],
  '23219':[37.54,-77.43],'28201':[35.22,-80.84],'29401':[32.78,-79.93],
  '32801':[28.54,-81.38],'35203':[33.52,-86.80],'37201':[36.16,-86.78],
  '38101':[35.15,-90.05],'39201':[32.30,-90.18],'40201':[38.25,-85.76],
  '45201':[39.10,-84.51],'48201':[42.33,-83.05],'49201':[42.25,-84.40],
  '50301':[41.60,-93.61],'51501':[41.26,-95.86],'52801':[41.52,-90.58],
  '53101':[42.49,-87.83],'54001':[45.31,-92.57],'56001':[44.16,-94.00],
  '57101':[43.54,-96.73],'58101':[46.87,-96.79],'59101':[45.78,-108.51],
  '68101':[41.26,-96.01],'69101':[41.12,-100.77],'70112':[29.96,-90.07],
  '71101':[32.52,-93.75],'72201':[34.74,-92.33],'73101':[35.47,-97.52],
  '74101':[36.15,-95.99],'75201':[32.78,-96.80],'76101':[32.75,-97.33],
  '79901':[31.76,-106.49],'82001':[41.14,-104.82],'83701':[43.61,-116.20],
  '84101':[40.76,-111.89],'86001':[35.20,-111.65],'87101':[35.08,-106.65],
  '88001':[32.31,-106.77],'89101':[36.17,-115.14],'93101':[34.42,-119.70],
  '94101':[37.78,-122.41],'94201':[38.58,-121.49],'95101':[37.34,-121.89],
  '96801':[21.31,-157.86],'97201':[45.52,-122.68],'99501':[61.22,-149.90],
};
// ZIP prefix (3 digits) → state centroid fallback
const STATE3_COORDS: Record<string,[number,number]> = {
  '100':[40.71,-74.01],'900':[34.05,-118.24],'606':[41.88,-87.63],
  '770':[29.76,-95.37],'850':[33.45,-112.07],'191':[39.95,-75.16],
  '782':[29.42,-98.50],'981':[47.61,-122.33],'303':[33.75,-84.39],
  '021':[42.36,-71.06],'802':[39.74,-104.98],'331':[25.77,-80.19],
  '631':[38.63,-90.19],'551':[44.95,-93.09],'462':[39.78,-86.14],
  '432':[39.96,-82.99],'441':[41.50,-81.69],'152':[40.45,-79.98],
  '372':[36.16,-86.78],'381':[35.15,-90.05],'352':[33.52,-86.80],
  '402':[38.25,-85.76],'482':[42.33,-83.05],'503':[41.60,-93.61],
  '700':[29.95,-90.07],'711':[32.52,-93.75],'722':[34.74,-92.33],
  '731':[35.47,-97.52],'741':[36.15,-95.99],'752':[32.78,-96.80],
  '761':[32.75,-97.33],'799':[31.76,-106.49],'820':[41.14,-104.82],
  '837':[43.61,-116.20],'841':[40.76,-111.89],'860':[34.05,-111.09],
  '871':[35.08,-106.65],'891':[36.17,-115.14],'931':[34.42,-119.70],
  '941':[37.78,-122.41],'968':[21.31,-157.86],'972':[45.52,-122.68],
  '995':[61.22,-149.90],'172':[40.26,-76.88],'212':[39.30,-76.61],
  '232':[37.54,-77.43],'282':[35.22,-80.84],'294':[32.78,-79.93],
  '328':[28.54,-81.38],'581':[46.87,-96.79],'591':[45.78,-108.51],
  '681':[41.26,-96.01],'532':[43.03,-87.92],'540':[44.16,-94.00],
  '571':[43.54,-96.73],'648':[39.10,-94.58],'661':[39.11,-94.63],
};
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // ── Middleware factories ──────────────────────────────────────────────────

  /** CDC NWSS Wastewater — public Socrata endpoint, no key needed */
  function cdcWastewaterMiddleware(): Connect.HandleFunction {
    const CDC_URL =
      'https://data.cdc.gov/resource/2ew6-ywp6.json' +
      '?$limit=10000' +
      '&$select=county_fips,county_names,wwtp_jurisdiction,ptc_15d,percentile,date_start' +
      '&$order=date_start%20DESC';

    return async (req, res, next) => {
      if (!req.url?.startsWith('/api/cdc-wastewater')) return next();
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      try {
        const upstream = await fetch(CDC_URL, { headers: { Accept: 'application/json' } });
        const body = await upstream.text();
        if (!upstream.ok) {
          console.error(`[PulseMap] cdc-wastewater upstream error: HTTP ${upstream.status}\n${body.slice(0, 500)}`);
          jsonResponse(res, 502, JSON.stringify({ error: `CDC upstream ${upstream.status}`, detail: body.slice(0, 200) }));
          return;
        }
        jsonResponse(res, 200, body);
      } catch (e) {
        console.error('[PulseMap] cdc-wastewater fetch threw:', e);
        jsonResponse(res, 500, JSON.stringify({ error: String(e) }));
      }
    };
  }

  /** EPA AirNow — injects API key from .env.local */
  function airNowMiddleware(): Connect.HandleFunction {
    return async (req, res, next) => {
      if (!req.url?.startsWith('/api/epa-airquality')) return next();
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

      const apiKey = env['AIRNOW_API_KEY'];
      if (!apiKey) { jsonResponse(res, 200, '[]'); return; }

      const parsed = new URL(req.url, 'http://localhost');
      const zip = parsed.searchParams.get('zip');
      const lat = parsed.searchParams.get('lat');
      const lng = parsed.searchParams.get('lng');

      let upstreamUrl: string;
      if (zip) {
        upstreamUrl =
          `https://www.airnowapi.org/aq/observation/zipCode/current/` +
          `?format=application/json&zipCode=${encodeURIComponent(zip)}&distance=25&API_KEY=${apiKey}`;
      } else if (lat && lng) {
        upstreamUrl =
          `https://www.airnowapi.org/aq/observation/latLong/current/` +
          `?format=application/json&latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&distance=25&API_KEY=${apiKey}`;
      } else {
        // No zip/lat/lng — fan out to 8 major US cities for national coverage
        const CITY_ZIPS = ['10001','90001','60601','77001','85001','19101','78201','98101'];
        try {
          const results = await Promise.allSettled(
            CITY_ZIPS.map(z =>
              fetch(`https://www.airnowapi.org/aq/observation/zipCode/current/?format=application/json&zipCode=${z}&distance=25&API_KEY=${apiKey}`)
                .then(r => r.json())
            )
          );
          const merged = results
            .filter((r): r is PromiseFulfilledResult<unknown[]> => r.status === 'fulfilled' && Array.isArray(r.value))
            .flatMap(r => r.value);
          jsonResponse(res, 200, JSON.stringify(merged)); return;
        } catch (e) {
          jsonResponse(res, 200, '[]'); return;
        }
      }

      try {
        const upstream = await fetch(upstreamUrl, { headers: { Accept: 'application/json' } });
        const body = await upstream.text();
        if (!upstream.ok) {
          console.error(`[PulseMap] epa-airquality upstream error: HTTP ${upstream.status}\n${body.slice(0, 500)}`);
        }
        jsonResponse(res, upstream.ok ? 200 : 200, upstream.ok ? body : '[]');
      } catch (e) {
        console.error('[PulseMap] epa-airquality fetch threw:', e);
        jsonResponse(res, 200, '[]');
      }
    };
  }

  /** WHO Disease Outbreak News — RSS → JSON */
  function whoOutbreaksMiddleware(): Connect.HandleFunction {
    return async (req, res, next) => {
      if (!req.url?.startsWith('/api/who-outbreaks')) return next();
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      try {
        const upstream = await fetch('https://www.who.int/feeds/entity/csr/don/en/rss.xml', {
          headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
        });
        const body = await upstream.text();
        if (!upstream.ok) {
          console.error(`[PulseMap] who-outbreaks upstream error: HTTP ${upstream.status}\n${body.slice(0, 500)}`);
          jsonResponse(res, 502, JSON.stringify({ error: `WHO upstream ${upstream.status}`, detail: body.slice(0, 200) })); return;
        }
        jsonResponse(res, 200, JSON.stringify(parseRss(body)));
      } catch (e) {
        console.error('[PulseMap] who-outbreaks fetch threw:', e);
        jsonResponse(res, 500, JSON.stringify({ error: String(e) }));
      }
    };
  }

  /** CMS Hospital Compare — public, projects to minimal fields */
  function cmsHospitalsMiddleware(): Connect.HandleFunction {
    const CMS_URL =
      'https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0' +
      '?limit=1500&offset=0&keys=true';

    return async (req, res, next) => {
      if (!req.url?.startsWith('/api/cms-hospitals')) return next();
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      try {
        const upstream = await fetch(CMS_URL, { headers: { Accept: 'application/json' } });
        const body = await upstream.text();
        if (!upstream.ok) {
          console.error(`[PulseMap] cms-hospitals upstream error: HTTP ${upstream.status}\n${body.slice(0, 500)}`);
          jsonResponse(res, 502, JSON.stringify({ error: `CMS upstream ${upstream.status}`, detail: body.slice(0, 200) })); return;
        }
        const raw = JSON.parse(body) as { results?: Array<Record<string, unknown>> };
        const results = (raw.results ?? []).map((row) => ({
          hospital_name:      row['hospital_name'] ?? '',
          address:            row['address'] ?? '',
          city:               row['city'] ?? '',
          state:              row['state'] ?? '',
          hospital_type:      row['hospital_type'] ?? '',
          emergency_services: row['emergency_services'] ?? '',
          lat: ZIP_COORDS[String(row['zip_code'] ?? '').slice(0,5)]?.[0] ?? STATE3_COORDS[String(row['zip_code'] ?? '').slice(0,3)] ?.[0] ?? 39.5,
          lng: ZIP_COORDS[String(row['zip_code'] ?? '').slice(0,5)]?.[1] ?? STATE3_COORDS[String(row['zip_code'] ?? '').slice(0,3)]?.[1] ?? -98.35,
        }));
        console.log('[PulseMap] CMS sample location:', JSON.stringify((raw.results ?? [])[0]));
        jsonResponse(res, 200, JSON.stringify(results));
      } catch (e) {
        console.error('[PulseMap] cms-hospitals fetch threw:', e);
        jsonResponse(res, 500, JSON.stringify({ error: String(e) }));
      }
    };
  }

  /** NWS Active Alerts — filters to health-relevant types */
  function nwsAlertsMiddleware(): Connect.HandleFunction {
    const NWS_URL =
      'https://api.weather.gov/alerts/active' +
      '?status=actual&message_type=alert&urgency=Immediate,Expected&severity=Extreme,Severe';

    return async (req, res, next) => {
      if (!req.url?.startsWith('/api/nws-alerts')) return next();
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      try {
        const upstream = await fetch(NWS_URL, {
          headers: {
            Accept: 'application/geo+json',
            'User-Agent': 'PulseMap/0.1 (community health dashboard; contact@example.com)',
          },
        });
        const body = await upstream.text();
        if (!upstream.ok) {
          console.error(`[PulseMap] nws-alerts upstream error: HTTP ${upstream.status}\n${body.slice(0, 500)}`);
          jsonResponse(res, 502, JSON.stringify({ error: `NWS upstream ${upstream.status}`, detail: body.slice(0, 200) })); return;
        }
        const geojson = JSON.parse(body) as { features?: Array<{ type: string; geometry: unknown; properties: Record<string, unknown> }> };
        const features = (geojson.features ?? [])
          .filter((f) => HEALTH_ALERT_TYPES.has(String(f.properties['event'] ?? '')))
          .map((f) => ({
            type: 'Feature',
            geometry: f.geometry,
            properties: {
              event:       f.properties['event'],
              headline:    f.properties['headline'],
              description: f.properties['description'],
              severity:    f.properties['severity'],
              urgency:     f.properties['urgency'],
              effective:   f.properties['effective'],
              expires:     f.properties['expires'],
              areaDesc:    f.properties['areaDesc'],
            },
          }));
        jsonResponse(res, 200, JSON.stringify(features));
      } catch (e) {
        console.error('[PulseMap] nws-alerts fetch threw:', e);
        jsonResponse(res, 500, JSON.stringify({ error: String(e) }));
      }
    };
  }

  /** CDC FluView — POST to upstream, normalise HHS region rows */
  function cdcFluviewMiddleware(): Connect.HandleFunction {
    return async (req, res, next) => {
      if (!req.url?.startsWith('/api/cdc-fluview')) return next();
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      try {
        const upstream = await fetch(
          'https://api.delphi.cmu.edu/epidata/fluview/?regions=hhs1,hhs2,hhs3,hhs4,hhs5,hhs6,hhs7,hhs8,hhs9,hhs10&epiweeks=202401-202552',
          { headers: { Accept: 'application/json' } }
        );
        const body = await upstream.text();
        if (!upstream.ok) {
          console.error(`[PulseMap] cdc-fluview upstream error: HTTP ${upstream.status}\n${body.slice(0, 500)}`);
          jsonResponse(res, 502, JSON.stringify({ error: `FluView upstream ${upstream.status}`, detail: body.slice(0, 200) })); return;
        }
        const raw = JSON.parse(body) as { epidata?: Array<Record<string, unknown>> };
        // CMU Delphi: region field is "hhs1".."hhs10" or "nat"
        const HHS_MAP: Record<string, string> = {
          hhs1:'Region 1', hhs2:'Region 2', hhs3:'Region 3',
          hhs4:'Region 4', hhs5:'Region 5', hhs6:'Region 6',
          hhs7:'Region 7', hhs8:'Region 8', hhs9:'Region 9',
          hhs10:'Region 10',
        };
        const normalised = (raw.epidata ?? [])
          .filter((item) => String(item['region'] ?? '').startsWith('hhs'))
          .map((item) => ({
            region:            HHS_MAP[String(item['region'])] ?? '',
            ili_pct:           Number(item['ili']) || 0,
            ili_total:         Number(item['num_ili']) || 0,
            num_providers:     Number(item['num_providers']) || 0,
            week_ending:       String(item['epiweek'] ?? ''),
            national_baseline: 3.1,
          }));
        jsonResponse(res, 200, JSON.stringify(normalised));
      } catch (e) {
        console.error('[PulseMap] cdc-fluview fetch threw:', e);
        jsonResponse(res, 500, JSON.stringify({ error: String(e) }));
      }
    };
  }

  // ── Vite config ──────────────────────────────────────────────────────────

  return {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },

    build: {
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks: {
            maplibre: ['maplibre-gl'],
            deckgl: ['@deck.gl/core', '@deck.gl/layers', '@deck.gl/mapbox'],
          },
        },
      },
    },

    server: {
      port: 5173,
    },

    plugins: [
      {
        name: 'api-dev-proxy',
        configureServer(server) {
          // All handlers are registered before Vite's own file-serving middleware,
          // so they intercept /api/* before Vite can serve the raw .ts source.
          server.middlewares.use(cdcWastewaterMiddleware());
          server.middlewares.use(airNowMiddleware());
          server.middlewares.use(whoOutbreaksMiddleware());
          server.middlewares.use(cmsHospitalsMiddleware());
          server.middlewares.use(nwsAlertsMiddleware());
          server.middlewares.use(cdcFluviewMiddleware());
        },
      },
    ],
  };
});
