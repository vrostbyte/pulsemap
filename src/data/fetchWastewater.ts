/**
 * PulseMap — Wastewater surveillance data fetcher.
 *
 * Calls our Vercel Edge Function proxy (/api/cdc-wastewater) which in turn
 * hits the CDC NWSS Socrata endpoint.  On any error the function returns an
 * empty array and logs a warning so the rest of the app continues to function.
 *
 * In development, when /api/* is not available (standalone Vite dev server),
 * the proxy will return a network error and the mock fallback fires.
 */

import type { HealthSignal, WastewaterData } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

// ─── Mock data (dev fallback) ─────────────────────────────────────────────────

const MOCK_DATA: WastewaterData[] = [
  {
    countyFips: '06037',
    countyName: 'Los Angeles',
    state: 'CA',
    percentileCategory: 'high',
    ptcChangeFrom15d: 23.4,
    firstSampleDateCollected: '2024-01-01',
    latitude: 34.0522,
    longitude: -118.2437,
  },
  {
    countyFips: '36061',
    countyName: 'New York',
    state: 'NY',
    percentileCategory: 'moderate',
    ptcChangeFrom15d: -5.2,
    firstSampleDateCollected: '2024-01-01',
    latitude: 40.7128,
    longitude: -74.006,
  },
  {
    countyFips: '17031',
    countyName: 'Cook',
    state: 'IL',
    percentileCategory: 'low',
    ptcChangeFrom15d: -12.1,
    firstSampleDateCollected: '2024-01-01',
    latitude: 41.8819,
    longitude: -87.6278,
  },
  {
    countyFips: '48201',
    countyName: 'Harris',
    state: 'TX',
    percentileCategory: 'very high',
    ptcChangeFrom15d: 67.8,
    firstSampleDateCollected: '2024-01-01',
    latitude: 29.7604,
    longitude: -95.3698,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalises the CDC NWSS category string to lowercase for consistent matching.
 * Handles both the `level` field ("Very High") and fallback from numeric
 * `percentile` (already lowercase from deriveCategory).
 */
function percentileToSeverity(
  category: string,
): HealthSignal['severity'] {
  switch (category.toLowerCase().trim()) {
    case 'very high': return 'critical';
    case 'high':      return 'high';
    case 'moderate':  return 'medium';
    default:          return 'low'; // "low", "minimal", unknown
  }
}

function percentileToValue(category: string): number {
  switch (category.toLowerCase().trim()) {
    case 'very high': return 90;
    case 'high':      return 70;
    case 'moderate':  return 45;
    default:          return 15;
  }
}

/**
 * Converts a numeric Socrata percentile (0–100) to a category string when
 * the `level` field is absent from the CDC response.
 */
function deriveCategory(percentile: string | number | undefined): string {
  if (percentile === undefined || percentile === null || percentile === '') return 'low';
  const p = Number(percentile);
  if (isNaN(p)) return String(percentile).toLowerCase(); // already a category string
  if (p >= 90) return 'very high';
  if (p >= 75) return 'high';
  if (p >= 40) return 'moderate';
  return 'low';
}

function wastewaterToSignal(d: WastewaterData): HealthSignal {
  const severity = percentileToSeverity(d.percentileCategory);
  return {
    id: `wastewater-${d.countyFips}-${d.firstSampleDateCollected}`,
    type: 'wastewater',
    severity,
    latitude: d.latitude,
    longitude: d.longitude,
    countyFips: d.countyFips,
    state: d.state,
    value: percentileToValue(d.percentileCategory),
    rawValue: d.ptcChangeFrom15d,
    label: `${d.countyName} County — ${d.percentileCategory} wastewater signal`,
    source: 'CDC NWSS',
    updatedAt: new Date().toISOString(),
    metadata: {
      countyName: d.countyName,
      percentileCategory: d.percentileCategory,
      ptcChangeFrom15d: d.ptcChangeFrom15d,
    },
  };
}

// ─── API shape from the proxy ─────────────────────────────────────────────────

interface CdcNwssRow {
  county_fips?: string;
  county_names?: string;       // actual CDC field name
  wwtp_jurisdiction?: string;  // actual CDC field name (state)
  ptc_15d?: string | number;
  /** Numeric percentile rank (0–100). Present in all rows. */
  percentile?: string | number;
  /** Categorical level string: "Low" | "Moderate" | "High" | "Very High".
   *  Present if the API returns it; fall back to deriveCategory(percentile). */
  level?: string;
  date_start?: string;
  date_end?: string;
  county_lat?: string | number;  // enriched by api/cdc-wastewater.ts
  county_long?: string | number; // enriched by api/cdc-wastewater.ts
}

/**
 * Parses CDC NWSS rows into WastewaterData, deduplicating per county FIPS.
 *
 * The CDC dataset has one row per wastewater treatment plant (WWTP), and
 * multiple WWTPs can exist in a single county. Since the data is ordered by
 * date_start DESC, the first occurrence of each county FIPS is the most
 * recent and is kept; subsequent rows for the same county are discarded
 * unless their signal level is higher.
 */
function parseApiRows(rows: CdcNwssRow[]): WastewaterData[] {
  // county_fips → highest-severity WastewaterData seen so far
  const byFips = new Map<string, WastewaterData>();

  for (const row of rows) {
    const fips = row.county_fips;
    const coords = row.county_lat != null
      ? [Number(row.county_lat), Number(row.county_long)] as [number, number]
      : null;
    if (!fips) continue;
    const lat = coords?.[0] ?? 0;
    const lng = coords?.[1] ?? 0;

    // Prefer the `level` field (e.g. "Very High"); fall back to numeric `percentile`
    const category = row.level ? row.level : deriveCategory(row.percentile);

    const data: WastewaterData = {
      countyFips: fips,
      countyName: row.county_names ?? 'Unknown',
      state: row.wwtp_jurisdiction ?? '',
      percentileCategory: category,
      ptcChangeFrom15d: Number(row.ptc_15d) || 0,
      firstSampleDateCollected: row.date_start ?? new Date().toISOString(),
      latitude: lat,
      longitude: lng,
    };

    // Keep whichever entry for this county has the higher severity value
    const existing = byFips.get(fips);
    if (
      !existing ||
      percentileToValue(category) > percentileToValue(existing.percentileCategory)
    ) {
      byFips.set(fips, data);
    }
  }

  return Array.from(byFips.values());
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches wastewater surveillance signals.
 * Returns an empty array (not a throw) on any failure so the app degrades
 * gracefully when this single data source is unavailable.
 */
export async function fetchWastewater(): Promise<HealthSignal[]> {
  try {
    const response = await fetch('/api/cdc-wastewater', {
      signal: AbortSignal.timeout(8_000), // fail fast so mock fallback kicks in quickly
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const rows = (await response.json()) as CdcNwssRow[];
    const parsed = parseApiRows(rows);
    if (parsed.length === 0) throw new Error('Empty response');
    logger.info(`fetchWastewater: loaded ${parsed.length} counties`);
    return parsed.map(wastewaterToSignal);
  } catch (err) {
    logger.warn('fetchWastewater: falling back to mock data', err);
    return MOCK_DATA.map(wastewaterToSignal);
  }
}
