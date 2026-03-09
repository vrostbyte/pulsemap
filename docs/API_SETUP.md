# PulseMap — API Setup Guide

## Quick start (zero API keys)

PulseMap works out of the box with no API keys.  When the Edge Function
proxies are unavailable (e.g. running `vite` alone without `vercel dev`),
every data fetcher falls back to realistic mock data automatically.

```bash
npm install
npm run dev
# Open http://localhost:5173
```

You'll see the map with mock wastewater, flu, AQI, and outbreak signals.

---

## Adding real data

### 1. EPA AirNow API key (free, required for real AQI data)

1. Register at https://docs.airnowapi.org/account/request/
2. You'll receive an API key by email within minutes
3. Add it to your `.env`:

```bash
cp .env.example .env
# Edit .env:
AIRNOW_API_KEY=your_key_here
```

### 2. Running with Vercel Edge Functions locally

Install the Vercel CLI and run the dev server with function support:

```bash
npm install -g vercel
vercel dev
# Open http://localhost:3000
```

The `vercel dev` command starts both the Vite frontend and the Edge Functions
so all `/api/*` routes are live.

### 3. Deploying to Vercel

```bash
vercel                    # Deploy to preview
vercel --prod             # Deploy to production
```

Set environment variables in the Vercel dashboard:
- `AIRNOW_API_KEY` → your AirNow key

All other APIs are public and require no keys.

---

## Optional: Upstash Redis (rate-limit cache)

The Edge Functions currently have no server-side caching beyond Vercel's
`Cache-Control` edge cache.  For high-traffic deployments, add Upstash Redis
as a secondary cache layer:

1. Create a free Redis database at https://upstash.com/
2. Add to `.env`:

```
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token
```

The Edge Functions currently don't implement Redis caching — this is a
documented future enhancement (see `docs/ARCHITECTURE.md`).

---

## API rate limits

| Source | Rate limit | Notes |
|--------|-----------|-------|
| CDC Socrata | 1000 req/hr unauthenticated | Add `X-App-Token` header for 10× limit |
| EPA AirNow | 500 req/hr | Per the free tier |
| WHO RSS | No published limit | RSS — be respectful |
| CMS Data Catalog | No published limit | Public API |
| NOAA NWS | No published limit | Requires `User-Agent` header |
| Census Geocoding | No published limit | Client-side only |

All Vercel Edge Functions set `Cache-Control` headers so the upstream APIs
are only hit once per cache window per edge node.

---

## Troubleshooting

**Map shows mock data only**
→ Check that `vercel dev` is running (not just `vite dev`).
→ Check browser DevTools Network tab for `/api/*` requests returning errors.

**AQI data missing**
→ Verify `AIRNOW_API_KEY` is set in `.env` and not empty.
→ Check the `/api/epa-airquality?zip=10001` endpoint directly.

**WHO outbreaks not showing**
→ The WHO RSS feed sometimes returns empty or malformed XML.
→ Mock data will be used as a fallback.

**TypeScript errors**
→ Run `npm run typecheck` and address each error.
→ Ensure you're using Node 20+ and TypeScript 5.4+.
