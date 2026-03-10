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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // ── Middleware factories ──────────────────────────────────────────────────

  /** CDC NWSS Wastewater — public Socrata endpoint, no key needed */
  function cdcWastewaterMiddleware(): Connect.HandleFunction {
    const CDC_URL =
      'https://data.cdc.gov/resource/2ew6-ywp6.json' +
      '?$limit=10000' +
      '&$select=county_fips,county,state_abbr,ptc_15d,percentile,level,date_start,county_lat,county_long' +
      '&$order=date_start%20DESC';

    return async (req, res, next) => {
      if (!req.url?.startsWith('/api/cdc-wastewater')) return next();
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      try {
        const upstream = await fetch(CDC_URL, { headers: { Accept: 'application/json' } });
        const body = await upstream.text();
        jsonResponse(res, upstream.ok ? 200 : 502, upstream.ok ? body : JSON.stringify({ error: `CDC ${upstream.status}` }));
      } catch (e) {
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
        jsonResponse(res, 200, '[]'); return;
      }

      try {
        const upstream = await fetch(upstreamUrl, { headers: { Accept: 'application/json' } });
        const body = await upstream.text();
        jsonResponse(res, upstream.ok ? 200 : 502, body);
      } catch {
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
        const upstream = await fetch('https://www.who.int/rss-feeds/news-releases.xml', {
          headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
        });
        if (!upstream.ok) {
          jsonResponse(res, 502, JSON.stringify({ error: `WHO RSS ${upstream.status}` })); return;
        }
        const xml = await upstream.text();
        jsonResponse(res, 200, JSON.stringify(parseRss(xml)));
      } catch (e) {
        jsonResponse(res, 500, JSON.stringify({ error: String(e) }));
      }
    };
  }

  /** CMS Hospital Compare — public, projects to minimal fields */
  function cmsHospitalsMiddleware(): Connect.HandleFunction {
    const CMS_URL =
      'https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0' +
      '?limit=5000&offset=0&keys=true';

    return async (req, res, next) => {
      if (!req.url?.startsWith('/api/cms-hospitals')) return next();
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      try {
        const upstream = await fetch(CMS_URL, { headers: { Accept: 'application/json' } });
        if (!upstream.ok) {
          jsonResponse(res, 502, JSON.stringify({ error: `CMS ${upstream.status}` })); return;
        }
        const raw = await upstream.json() as { results?: Array<Record<string, unknown>> };
        const results = (raw.results ?? []).map((row) => ({
          hospital_name:      row['hospital_name'] ?? '',
          address:            row['address'] ?? '',
          city:               row['city'] ?? '',
          state:              row['state'] ?? '',
          hospital_type:      row['hospital_type'] ?? '',
          emergency_services: row['emergency_services'] ?? '',
          geocoded_column:    row['location'] ?? null,
        }));
        jsonResponse(res, 200, JSON.stringify(results));
      } catch (e) {
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
        if (!upstream.ok) {
          jsonResponse(res, 502, JSON.stringify({ error: `NWS ${upstream.status}` })); return;
        }
        const geojson = await upstream.json() as { features?: Array<{ type: string; geometry: unknown; properties: Record<string, unknown> }> };
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
        const upstream = await fetch('https://gis.cdc.gov/grasp/flu2/GetFlu2Data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: FLUVIEW_REQUEST_BODY,
        });
        if (!upstream.ok) {
          jsonResponse(res, 502, JSON.stringify({ error: `FluView ${upstream.status}` })); return;
        }
        const raw = await upstream.json() as { DataItems?: Array<Record<string, unknown>> };
        const normalised = (raw.DataItems ?? []).map((item) => ({
          region:            `Region ${item['REGION'] ?? ''}`.trim(),
          ili_pct:           Number(item['ILI']) || 0,
          ili_total:         Number(item['ILITOTAL']) || 0,
          num_providers:     Number(item['NUM_OF_PROVIDERS']) || 0,
          week_ending:       item['WEEKEND'] ?? '',
          national_baseline: 2.5,
        }));
        jsonResponse(res, 200, JSON.stringify(normalised));
      } catch (e) {
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
