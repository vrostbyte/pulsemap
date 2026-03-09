# 🫀 PulseMap

**Real-time community health intelligence — aggregated from public data, rendered in your browser.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black)](https://vercel.com)

> No accounts. No tracking. No personal data ever leaves your browser.  
> Just public health data — beautifully surfaced, geographically grounded, and always free.

---

## What Is PulseMap?

PulseMap is an open-source, serverless health intelligence dashboard that aggregates public health data from CDC, EPA, WHO, CMS, and other government sources into a single interactive interface. Search by zip code or zoom anywhere on the globe to see what's happening with disease activity, air quality, hospital capacity, and outbreak alerts — in real time.

It is built for everyone: patients monitoring their communities, public health workers tracking signals, researchers exploring trends, and curious citizens who simply want to know what's in the air.

---

## Core Principles

| Principle | What It Means |
|---|---|
| **Privacy by architecture** | All analysis runs in your browser. No health data ever touches our servers. |
| **Fat client, thin server** | Your browser does the heavy lifting. The server only proxies public APIs. |
| **Always free** | Built on 100% public data. No paywalls, no subscriptions, ever. |
| **Serverless** | Deployed as a static site + Vercel Edge Functions. Zero backend infrastructure. |
| **Open source** | MIT licensed. Fork it, improve it, deploy your own. |

---

## Features (v1.0 — MVP)

### 🗺️ Interactive Global Map
- Zoomable world map powered by MapLibre GL + deck.gl (WebGL rendering)
- Zip code search → instant county-level data focus
- Toggleable health data layers
- Smart clustering at low zoom, expanded detail on zoom-in

### 📡 Live Health Data Layers
| Layer | Source | Update Frequency |
|---|---|---|
| Wastewater disease surveillance (COVID, flu, RSV) | CDC NWSS | Weekly |
| Influenza activity by state/region | CDC FluView | Weekly |
| Hospital bed availability | CMS | Real-time |
| Air Quality Index | EPA AirNow | Hourly |
| Global outbreak alerts | WHO Disease Outbreak News | Real-time |
| Extreme weather health alerts | NOAA NWS | Real-time |

### 🔢 Community Health Risk Score
A composite score (0–100) calculated entirely in your browser from multiple signals:
- Wastewater viral load trend
- Flu/RSV activity level
- Hospital capacity pressure
- Air quality index
- Active outbreak alerts in region

### ⚡ Real-Time Anomaly Detection
- Detects when health signals deviate from regional baselines
- "Wastewater COVID signal is 2.8× above the 90-day average for your county"
- Powered by client-side statistical analysis (no server compute needed)

---

## Architecture

PulseMap is a **fat-client, thin-server** application. This is a deliberate architectural choice, not a limitation.

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (Fat Client)                      │
│                                                              │
│  MapLibre GL ──────── Interactive world map                  │
│  deck.gl ──────────── WebGL data layer rendering             │
│  Transformers.js ───── Client-side anomaly detection/ML      │
│  Data Aggregator ───── Fetches + merges all health APIs      │
│  Risk Score Engine ─── Calculates Community Health Score     │
│  Zip → FIPS Lookup ─── Maps zip codes to county data         │
│                                                              │
└───────────────────────────┬─────────────────────────────────┘
                            │  CORS proxy + API key hiding only
┌───────────────────────────▼─────────────────────────────────┐
│              Vercel Edge Functions (Thin Server)             │
│                                                              │
│  /api/cdc-wastewater    ── Proxies CDC NWSS API              │
│  /api/cdc-fluview       ── Proxies CDC FluView               │
│  /api/epa-airquality    ── Proxies EPA AirNow                │
│  /api/who-outbreaks     ── Proxies WHO RSS feed              │
│  /api/cms-hospitals     ── Proxies CMS hospital data         │
│  /api/nws-alerts        ── Proxies NWS weather alerts        │
│                                                              │
│  ❌ No database  ❌ No user data stored  ❌ No auth           │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Category | Technology | Why |
|---|---|---|
| **Language** | TypeScript | Type safety across all data shapes |
| **Build Tool** | Vite | Fast dev server, optimized production builds |
| **Map Engine** | MapLibre GL | Open-source, no API key required for base map |
| **Data Layers** | deck.gl | WebGL-accelerated, handles 100k+ data points |
| **API Layer** | Vercel Edge Functions | Serverless, global CDN, zero cold starts |
| **Client ML** | Transformers.js | In-browser anomaly detection, no server GPU |
| **Styling** | CSS Modules | Scoped, maintainable, no runtime overhead |

---

## Data Sources

All data used by PulseMap is **100% public**, provided by official government agencies, and free to access.

| Source | Data Type | Endpoint |
|---|---|---|
| [CDC NWSS](https://www.cdc.gov/nwss/) | Wastewater disease surveillance | Public API |
| [CDC FluView](https://www.cdc.gov/flu/weekly/) | Influenza activity | Public API |
| [EPA AirNow](https://www.airnow.gov/) | Air Quality Index | Public API |
| [CMS](https://healthdata.gov/) | Hospital capacity & utilization | Public API |
| [WHO](https://www.who.int/emergencies/disease-outbreak-news) | Global outbreak alerts | RSS Feed |
| [NOAA NWS](https://www.weather.gov/alerts) | Extreme weather alerts | Public API |
| [OpenFDA](https://open.fda.gov/) | Drug recalls, food safety | Public API |

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- [npm](https://www.npmjs.com/) v9 or higher

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/pulsemap.git
cd pulsemap

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Environment Variables

Create a `.env.local` file in the root directory:

```env
# EPA AirNow API key (free, register at https://docs.airnow.gov/)
AIRNOW_API_KEY=your_key_here

# Optional: Upstash Redis for API response caching
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

Most features work without any API keys during development. See [docs/API_SETUP.md](docs/API_SETUP.md) for the complete list.

### Build for Production

```bash
npm run build       # Compile TypeScript + bundle
npm run preview     # Preview production build locally
npm run typecheck   # Run TypeScript type checking
```

### Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

That's it. No servers to configure. No databases to provision.

---

## Project Structure

```
pulsemap/
├── api/                          # Vercel Edge Functions (thin server)
│   ├── cdc-wastewater.ts         # CDC NWSS proxy
│   ├── cdc-fluview.ts            # CDC FluView proxy
│   ├── epa-airquality.ts         # EPA AirNow proxy
│   ├── who-outbreaks.ts          # WHO RSS proxy
│   ├── cms-hospitals.ts          # CMS hospital data proxy
│   └── nws-alerts.ts             # NWS weather alerts proxy
│
├── src/
│   ├── components/               # UI components
│   │   ├── Map/                  # MapLibre + deck.gl map
│   │   ├── Sidebar/              # Data panels + risk score
│   │   ├── ZipSearch/            # Zip code search bar
│   │   ├── LayerControls/        # Toggle health data layers
│   │   └── AlertBanner/          # Anomaly / outbreak alerts
│   │
│   ├── data/                     # Data fetching + aggregation
│   │   ├── fetchWastewater.ts    # CDC NWSS data fetcher
│   │   ├── fetchFluView.ts       # CDC FluView data fetcher
│   │   ├── fetchAirQuality.ts    # EPA AirNow data fetcher
│   │   ├── fetchOutbreaks.ts     # WHO outbreak feed parser
│   │   ├── fetchHospitals.ts     # CMS hospital data fetcher
│   │   └── aggregator.ts         # Merges all sources → unified model
│   │
│   ├── scoring/
│   │   ├── communityRiskScore.ts # Community Health Risk Score engine
│   │   └── anomalyDetection.ts   # Client-side baseline + z-score
│   │
│   ├── geo/
│   │   ├── zipToFips.ts          # Zip code → County FIPS lookup
│   │   └── layers/               # deck.gl layer definitions
│   │
│   ├── types/                    # TypeScript interfaces for all data
│   └── main.ts                   # App entry point
│
├── public/                       # Static assets
│   └── geo/                      # GeoJSON county boundaries
│
├── docs/                         # Documentation
│   ├── ARCHITECTURE.md
│   ├── DATA_SOURCES.md
│   └── API_SETUP.md
│
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Roadmap

### v1.0 — MVP *(current)*
- [x] Project scaffolding and architecture
- [ ] Interactive MapLibre world map
- [ ] Zip code search → county data
- [ ] CDC wastewater layer
- [ ] EPA air quality layer
- [ ] WHO outbreak pins
- [ ] Community Health Risk Score (client-side)

### v1.1 — Intelligence Layer
- [ ] Anomaly detection ("2.8× above baseline")
- [ ] Hospital capacity layer (CMS)
- [ ] CDC FluView layer
- [ ] NWS extreme weather health alerts
- [ ] OpenFDA drug recall alerts

### v1.2 — AI Health Briefs
- [ ] AI-synthesized regional health summaries (client-side, Transformers.js)
- [ ] Custom zip code alert subscriptions (localStorage, no account needed)
- [ ] Historical data playback (90-day trends)
- [ ] Shareable health snapshots (URL deep links)

---

## Contributing

Contributions are welcome and encouraged. PulseMap is for everyone, so it should be built by everyone.

```bash
# Run type checking before submitting a PR
npm run typecheck

# Run the linter
npm run lint
```

Please open an issue before starting a large feature so we can discuss the approach. See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.

---

## Why This Exists

Public health data is public. It belongs to everyone — it's collected using public funds, maintained by public agencies, and describes the health of our communities. But it's scattered across a dozen different government portals, locked in inconsistent formats, and nearly impossible for a regular person to actually use.

PulseMap exists to fix that. One URL. Type your zip code. See what's happening. No account, no app to download, no data sold to advertisers. Just public health data, made accessible.

If knowing that wastewater surveillance in your county is spiking before RSV season hits helps one parent take their kid to the doctor a week earlier — that's worth building.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

Free forever. Fork it. Improve it. Deploy your own.

---

## Author

Built with 💙 for public health.

---

*PulseMap uses only publicly available government data. It is not a medical device and does not provide medical advice. Always consult a healthcare provider for medical decisions.*
