# 🗺️ PulseMap

**Real-time community health monitoring dashboard.**  
Live at [pulsemap.org](https://pulsemap.org)

PulseMap aggregates public health data from multiple authoritative sources onto
an interactive world map, giving anyone a clear picture of health conditions in
their area — no medical background required.

---

## ✨ Features (v1.0)

- 🗺️ Interactive zoomable map with 5 live health data layers
- 🔍 ZIP code search — fly to any US location instantly
- 💧 CDC Wastewater surveillance (8,900+ monitoring sites, Redis cached)
- 🤧 CDC FluView — ILI activity by HHS region
- 💨 EPA AirNow — real-time AQI across 700+ reporting areas
- 🌍 WHO Disease Outbreak News — global alerts with geolocation
- 🏥 CMS Hospital capacity data with geocoded locations
- ⚡ Serverless architecture — Vercel Edge Functions, no backend server
- 🔒 Privacy-first — no user tracking, no accounts required

---

## 🏗️ Architecture

**Fat-client, thin-server.** All rendering and data processing happens in the
browser. The server only proxies external APIs and handles caching.
```
Browser (TypeScript + Vite)
  ├── MapLibre GL — base map rendering
  ├── deck.gl — health data overlay layers
  └── Client fetch layer — talks to Vercel Edge Functions

Vercel Edge Functions (TypeScript)
  ├── /api/cdc-wastewater   — CDC NWSS via Socrata + Upstash Redis cache
  ├── /api/cdc-fluview      — CDC FluView ILI data
  ├── /api/epa-airquality   — AirNow file feed parser
  ├── /api/who-outbreaks    — WHO DON JSON API
  ├── /api/cms-hospitals    — CMS hospital data
  └── /api/geocode          — Nominatim ZIP proxy (CORS safe)
```

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | TypeScript, Vite |
| Map | MapLibre GL, deck.gl |
| Hosting | Vercel (Edge Functions) |
| Cache | Upstash Redis (REST API) |
| Map tiles | CARTO Dark Matter |
| Geocoding | Nominatim (OpenStreetMap) |

---

## 📡 Data Sources

| Layer | Source | Update Frequency |
|---|---|---|
| Wastewater | CDC NWSS via Socrata | Weekly (cached 1hr) |
| Flu Activity | CDC FluView | Weekly (cached 1hr) |
| Air Quality | EPA AirNow file feed | Hourly (cached 30min) |
| Outbreaks | WHO Disease Outbreak News | As published (cached 30min) |
| Hospitals | CMS Provider Data | Monthly (cached 30min) |

---

## 🚀 Local Development
```bash
git clone https://github.com/vrostbyte/pulsemap.git
cd pulsemap
npm install
cp .env.local.example .env.local   # add your API keys
npm run dev
```

### Required Environment Variables
```
AIRNOW_API_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CDC_SOCRATA_APP_TOKEN=
```

---

## 🗺️ Roadmap

### Sprint 1 — Foundation Polish (in progress)
- [ ] Unified circle radius normalization across all layers
- [ ] Community Risk Score hero card
- [ ] "3 Things To Know" anomaly digest
- [ ] War room top bar with world clocks
- [ ] Last-updated timestamps per data source
- [ ] Layer legend / color key

### Sprint 2 — Personalization
- [ ] Persistent "My Area" mode
- [ ] Shareable URLs with ZIP + layer encoded
- [ ] Onboarding tooltip tour
- [ ] Mobile responsive layout

### Sprint 3 — Content Richness
- [ ] News feed integration
- [ ] Social pulse (Reddit / Bluesky)
- [ ] Choropleth county/state fills

### Sprint 4 — Flagship
- [ ] Modular drag-and-drop dashboard
- [ ] Custom alert subscriptions
- [ ] AI-synthesized regional health brief

---

## 🙏 Inspiration

Architecture and design patterns inspired by
[worldmonitor](https://github.com/koala73/worldmonitor).

---

## 📄 License

MIT
