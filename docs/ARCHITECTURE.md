# PulseMap — Architecture

## Overview

PulseMap is a **serverless, fat-client, thin-server** community health intelligence dashboard.

```
Browser (fat client)          Vercel Edge (thin server)     Public APIs
─────────────────────         ─────────────────────────     ────────────
MapLibre GL (tiles)     ←── /api/cdc-wastewater ───────→  CDC NWSS
deck.gl WebGL layers          /api/cdc-fluview  ───────→  CDC FluView
Scoring engine                /api/epa-airquality ──────→  EPA AirNow
Anomaly detection             /api/who-outbreaks ──────→  WHO RSS
TypeScript strict             /api/cms-hospitals ──────→  CMS Data
                              /api/nws-alerts    ──────→  NOAA NWS
```

### Design principles

1. **No database.** All data is fetched from public government APIs on demand.
2. **No user accounts.** Zero PII collected or stored.
3. **No personal data ever stored.** In-memory only; cleared on page reload.
4. **All analysis runs in the browser.** The server proxies only.
5. **Graceful degradation.** Mock data fallbacks ensure the app is always
   usable, even when APIs are down.

---

## Client architecture

```
src/
├── main.ts              # Entry point — mounts components, wires events
├── types/index.ts       # Single source of truth for all TypeScript types
│
├── components/          # Vanilla TS components (no framework)
│   ├── Map/             # MapLibre GL + deck.gl integration
│   ├── Sidebar/         # Health score + anomalies + data status
│   ├── ZipSearch/       # ZIP → FIPS lookup + map navigation
│   ├── LayerControls/   # Layer visibility toggles
│   └── AlertBanner/     # Critical alert strip
│
├── data/                # API fetchers (one per source)
│   ├── fetchWastewater.ts
│   ├── fetchFluView.ts
│   ├── fetchAirQuality.ts
│   ├── fetchOutbreaks.ts
│   ├── fetchHospitals.ts
│   └── aggregator.ts    # Runs all fetchers in parallel
│
├── scoring/
│   ├── communityRiskScore.ts  # Weighted composite 0-100 score
│   └── anomalyDetection.ts    # Welford z-score streaming algorithm
│
├── geo/
│   ├── zipToFips.ts            # Census Geocoding API lookup
│   └── layers/                 # deck.gl layer factories
│       ├── wastewaterLayer.ts
│       ├── airQualityLayer.ts
│       └── outbreakLayer.ts
│
└── utils/
    ├── formatters.ts   # Pure formatting functions
    └── logger.ts       # Silenceable structured logger
```

### State management

No framework reactivity. A single `AppState` object is mutated directly
in `main.ts` and passed to components via explicit method calls (`update()`,
`updateLayers()`, etc.).

Event communication uses native DOM `CustomEvent` dispatched on `document`:

| Event | Payload | Description |
|-------|---------|-------------|
| `map:ready` | — | MapLibre finished loading tiles |
| `search:zip` | `{ zip, fips, lat, lng, countyName, state }` | User submitted a ZIP search |
| `layer:toggle` | `{ type, active }` | User toggled a data layer |

### Data flow

```
fetchAllHealthData()         calculateHealthScore()
        │                            │
        ▼                            ▼
HealthSignal[] ──────────→  CommunityHealthScore
        │                            │
        ▼                            ▼
MapView.updateLayers()       Sidebar.update()
```

---

## Server architecture (Vercel Edge Functions)

Each `api/*.ts` file is a Vercel Edge Function that:

1. Adds CORS headers (`Access-Control-Allow-Origin: *`)
2. Handles `OPTIONS` preflight requests
3. Fetches from the upstream public API
4. Sets appropriate `Cache-Control` headers
5. Returns the data as JSON

Edge Functions run in Cloudflare's network, so upstream API calls are fast
and the cold start time is ~0ms (no Node.js boot).

### Cache TTLs

| Source | TTL | Reason |
|--------|-----|--------|
| CDC Wastewater | 1 hour | Published weekly, checking hourly is fine |
| CDC FluView | 24 hours | Weekly data |
| EPA AirNow | 1 hour | Hourly updates |
| WHO Outbreaks | 30 min | Important to catch new outbreaks quickly |
| CMS Hospitals | 24 hours | Structural data, rarely changes |
| NWS Alerts | 5 min | Can change rapidly |

---

## Scoring model

```
CommunityHealthScore = weighted average of 5 components (0–100 each)

  Wastewater signal   × 0.30
  Flu activity (ILI)  × 0.25
  Air quality (AQI)   × 0.20
  Hospital capacity   × 0.15
  Outbreak alerts     × 0.10

Score → Label:
  0–20   Good
  21–40  Moderate
  41–60  Elevated
  61–80  High
  81–100 Critical
```

Anomaly detection uses **Welford's online algorithm** to compute a streaming
mean and variance for each (signalType, countyFips) pair.  No history is
stored beyond count, mean, and M2.  Minimum 10 observations required before
alerts are emitted.

---

## Future work

- Choropleth county fill layer (requires `public/geo/counties.geojson`)
- Time-series sparklines per county in the sidebar
- Upstash Redis rate-limit cache for edge functions
- Better base map style (Stadia, MapTiler)
- WebWorker for scoring to keep the main thread free
- PWA / service worker for offline mock-data view
