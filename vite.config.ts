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

// CDC ILINet data via CMU Delphi Epidata API (mirrors CDC FluView, publicly accessible)
// Covers 2025-26 flu season (epiweeks 202540–202620)
const FLUVIEW_DELPHI_URL =
  'https://api.delphi.cmu.edu/epidata/fluview/' +
  '?regions=nat,hhs1,hhs2,hhs3,hhs4,hhs5,hhs6,hhs7,hhs8,hhs9,hhs10' +
  '&epiweeks=202540-202620';

// ─── Config ───────────────────────────────────────────────────────────────────

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // ── Middleware factories ──────────────────────────────────────────────────

  /** CDC NWSS Wastewater — public Socrata endpoint, no key needed */
  function cdcWastewaterMiddleware(): Connect.HandleFunction {
    const CDC_URL =
      'https://data.cdc.gov/resource/2ew6-ywp6.json' +
      '?$limit=10000' +
      '&$select=county_fips,state_abbr,ptc_15d,percentile,level,date_start,county_lat,county_long' +
      '&$order=date_start%20DESC';

    return async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
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
    return async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
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
    return async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
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

    return async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
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
          geocoded_column:    row['location'] ?? null,
        }));
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

    return async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
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

  /** CDC ILINet FluView — via CMU Delphi Epidata API, normalise HHS region rows */
  function cdcFluviewMiddleware(): Connect.HandleFunction {
    return async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
      if (!req.url?.startsWith('/api/cdc-fluview')) return next();
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      try {
        const upstream = await fetch(FLUVIEW_DELPHI_URL, { headers: { Accept: 'application/json' } });
        const body = await upstream.text();
        if (!upstream.ok) {
          console.error(`[PulseMap] cdc-fluview upstream error: HTTP ${upstream.status}\n${body.slice(0, 500)}`);
          jsonResponse(res, 502, JSON.stringify({ error: `FluView upstream ${upstream.status}`, detail: body.slice(0, 200) })); return;
        }
        const raw = JSON.parse(body) as { result?: number; epidata?: Array<Record<string, unknown>> };
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
            national_baseline: 3.1,
          };
        });
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
