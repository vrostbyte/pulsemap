/**
 * PulseMap — Open-Meteo Pollen data fetcher.
 *
 * Samples a 35-point grid across the continental US via the Open-Meteo
 * Air Quality API (CORS-enabled, no API key required).
 * Extracts the maximum pollen count across all species at index 0 (current hour)
 * and normalises to a 0-100 value. Grid points with zero pollen are dropped.
 */

import type { HealthSignal } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

// ─── Grid ─────────────────────────────────────────────────────────────────────

const GRID: [number, number][] = [
  [49,-124],[49,-117],[49,-110],[49,-103],[49,-96],[49,-89],[49,-82],[49,-75],
  [44,-124],[44,-117],[44,-110],[44,-103],[44,-96],[44,-89],[44,-82],[44,-75],
  [39,-120],[39,-113],[39,-106],[39,-99],[39,-92],[39,-85],[39,-78],[39,-71],
  [34,-118],[34,-111],[34,-104],[34,-97],[34,-90],[34,-83],[34,-76],
  [29,-103],[29,-97],[29,-91],[29,-85],
];

const POLLEN_FIELDS = [
  'alder_pollen',
  'birch_pollen',
  'grass_pollen',
  'mugwort_pollen',
  'olive_pollen',
  'ragweed_pollen',
] as const;

// ─── Mock data (dev fallback) ─────────────────────────────────────────────────

const MOCK_POLLEN: HealthSignal[] = [
  {
    id: 'pollen-39--99',
    type: 'pollen',
    severity: 'low',
    latitude: 39,
    longitude: -99,
    value: 20,
    rawValue: 30,
    label: 'Pollen Index 20 — Central US',
    source: 'Open-Meteo',
    updatedAt: new Date().toISOString(),
    metadata: {},
  },
  {
    id: 'pollen-44--96',
    type: 'pollen',
    severity: 'medium',
    latitude: 44,
    longitude: -96,
    value: 45,
    rawValue: 67,
    label: 'Pollen Index 45 — Northern US',
    source: 'Open-Meteo',
    updatedAt: new Date().toISOString(),
    metadata: {},
  },
  {
    id: 'pollen-39--85',
    type: 'pollen',
    severity: 'high',
    latitude: 39,
    longitude: -85,
    value: 60,
    rawValue: 90,
    label: 'Pollen Index 60 — Central US',
    source: 'Open-Meteo',
    updatedAt: new Date().toISOString(),
    metadata: {},
  },
  {
    id: 'pollen-34--97',
    type: 'pollen',
    severity: 'critical',
    latitude: 34,
    longitude: -97,
    value: 75,
    rawValue: 112,
    label: 'Pollen Index 75 — Southern US',
    source: 'Open-Meteo',
    updatedAt: new Date().toISOString(),
    metadata: {},
  },
  {
    id: 'pollen-29--91',
    type: 'pollen',
    severity: 'critical',
    latitude: 29,
    longitude: -91,
    value: 85,
    rawValue: 127,
    label: 'Pollen Index 85 — Southern US',
    source: 'Open-Meteo',
    updatedAt: new Date().toISOString(),
    metadata: {},
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gridPointName(lat: number): string {
  if (lat >= 44) return 'Northern US';
  if (lat >= 34) return 'Central US';
  return 'Southern US';
}

function valueToSeverity(value: number): HealthSignal['severity'] {
  if (value >= 75) return 'critical';
  if (value >= 50) return 'high';
  if (value >= 25) return 'medium';
  return 'low';
}

// ─── API shape ────────────────────────────────────────────────────────────────

type PollenField = typeof POLLEN_FIELDS[number];

interface OpenMeteoResponse {
  hourly?: Partial<Record<PollenField, (number | null)[]>>;
}

function buildUrl(lat: number, lng: number): string {
  const fields = POLLEN_FIELDS.join(',');
  return (
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${lat}&longitude=${lng}` +
    `&hourly=${fields}` +
    `&forecast_days=1&timezone=auto`
  );
}

function extractSignal(
  lat: number,
  lng: number,
  json: OpenMeteoResponse,
): HealthSignal | null {
  const hourly = json.hourly;
  if (!hourly) return null;

  let maxPollen = 0;
  for (const field of POLLEN_FIELDS) {
    const val = hourly[field]?.[0] ?? 0;
    if (val > maxPollen) maxPollen = val;
  }

  if (maxPollen === 0) return null;

  const value = Math.min(100, Math.round((maxPollen / 150) * 100));
  const severity = valueToSeverity(value);

  return {
    id: `pollen-${lat}-${lng}`,
    type: 'pollen',
    severity,
    latitude: lat,
    longitude: lng,
    value,
    rawValue: maxPollen,
    label: `Pollen Index ${value} — ${gridPointName(lat)}`,
    source: 'Open-Meteo',
    updatedAt: new Date().toISOString(),
    metadata: {},
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches pollen data for a 35-point US grid from Open-Meteo.
 * Falls back to mock data on total failure.
 */
async function fetchBatch(batch: [number, number][]): Promise<{ lat: number; lng: number; json: OpenMeteoResponse }[]> {
  const results = await Promise.allSettled(
    batch.map(async ([lat, lng]) => {
      const res = await fetch(buildUrl(lat, lng), { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { lat, lng, json: (await res.json()) as OpenMeteoResponse };
    }),
  );
  return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
}

export async function fetchPollen(): Promise<HealthSignal[]> {
  try {
    const BATCH_SIZE = 5;
    const DELAY_MS = 300;
    const signals: HealthSignal[] = [];
    for (let i = 0; i < GRID.length; i += BATCH_SIZE) {
      const batch = GRID.slice(i, i + BATCH_SIZE) as [number, number][];
      const rows = await fetchBatch(batch);
      for (const { lat, lng, json } of rows) {
        const signal = extractSignal(lat, lng, json);
        if (signal) signals.push(signal);
      }
      if (i + BATCH_SIZE < GRID.length) {
        await new Promise((res) => setTimeout(res, DELAY_MS));
      }
    }
    // zero pollen is valid off-season — return empty not mock
    logger.info(`fetchPollen: loaded ${signals.length} grid points`);
    return signals;
  } catch (err) {
    logger.warn('fetchPollen: falling back to mock data', err);
    return MOCK_POLLEN;
  }
}
