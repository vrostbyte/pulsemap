/**
 * Vite configuration for PulseMap.
 *
 * Key setup:
 * - Path alias @/ → src/ so imports stay clean across deep directories
 * - CSS Modules enabled by default in Vite (*.module.css)
 * - Dev proxy: /api/cdc-wastewater → CDC Socrata (public, no key)
 * - Dev proxy: /api/epa-airquality → AirNow (key injected from .env.local)
 *
 * In production, api/*.ts Vercel Edge Functions handle the same routes.
 */

import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // Load .env.local so we can inject AIRNOW_API_KEY into the dev middleware
  const env = loadEnv(mode, process.cwd(), '');

  return {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },

    // Ensure large WebGL bundles (deck.gl) don't trigger size warnings
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

      proxy: {
        // ── CDC NWSS Wastewater ─────────────────────────────────────────────
        // Fully public Socrata endpoint — no API key required.
        // Vite rewrites the path so the browser never sees the upstream URL.
        '/api/cdc-wastewater': {
          target: 'https://data.cdc.gov',
          changeOrigin: true,
          rewrite: () =>
            '/resource/2ew6-ywp6.json' +
            '?$limit=10000' +
            '&$select=county_fips,county,state_abbr,ptc_15d,percentile,level,date_start,county_lat,county_long' +
            '&$order=date_start%20DESC',
        },
      },
    },

    plugins: [
      {
        // ── EPA AirNow ────────────────────────────────────────────────────────
        // Needs AIRNOW_API_KEY injected server-side, so we use a custom
        // middleware rather than the Vite proxy option (which can't read env).
        name: 'airnow-dev-proxy',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith('/api/epa-airquality')) {
              next();
              return;
            }

            const apiKey = env['AIRNOW_API_KEY'];
            if (!apiKey) {
              // No key in .env.local — return empty array so client uses mocks
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end('[]');
              return;
            }

            const parsed = new URL(req.url, 'http://localhost');
            const zip = parsed.searchParams.get('zip');
            const lat = parsed.searchParams.get('lat');
            const lng = parsed.searchParams.get('lng');

            let upstreamUrl: string;
            if (zip) {
              upstreamUrl =
                'https://www.airnowapi.org/aq/observation/zipCode/current/' +
                `?format=application/json&zipCode=${encodeURIComponent(zip)}` +
                `&distance=25&API_KEY=${apiKey}`;
            } else if (lat && lng) {
              upstreamUrl =
                'https://www.airnowapi.org/aq/observation/latLong/current/' +
                `?format=application/json&latitude=${encodeURIComponent(lat)}` +
                `&longitude=${encodeURIComponent(lng)}&distance=25&API_KEY=${apiKey}`;
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end('[]');
              return;
            }

            try {
              const upstream = await fetch(upstreamUrl, {
                headers: { Accept: 'application/json' },
              });
              const data = await upstream.text();
              res.writeHead(upstream.ok ? 200 : upstream.status, {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=3600',
              });
              res.end(data);
            } catch {
              // Network error — client will fall back to mock data
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end('[]');
            }
          });
        },
      },
    ],
  };
});
