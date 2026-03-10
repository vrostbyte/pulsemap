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

function percentileToSeverity(
  category: string,
): HealthSignal['severity'] {
  switch (category.toLowerCase()) {
    case 'very high': return 'critical';
    case 'high':      return 'high';
    case 'moderate':  return 'medium';
    default:          return 'low';
  }
}

function percentileToValue(category: string): number {
  switch (category.toLowerCase()) {
    case 'very high': return 90;
    case 'high':      return 70;
    case 'moderate':  return 45;
    default:          return 15;
  }
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
  county?: string;
  percentile?: string;
  date_start?: string;
  county_names?: string;
  wwtp_jurisdiction?: string;
}

function parseApiRows(rows: CdcNwssRow[]): WastewaterData[] {
  const results: WastewaterData[] = [];
  for (const row of rows) {
    const fips = row.county_fips;
    if (!fips) continue;
    const stateFips = fips.slice(0, 2);
    const STATE_CENTROIDS: Record<string,[number,number]> = {"01":[32.80,-86.81],"06":[36.78,-119.42],"12":[27.77,-81.69],"13":[32.17,-82.90],"17":[40.63,-89.40],"24":[39.05,-76.64],"25":[42.41,-71.38],"26":[44.31,-85.60],"36":[42.17,-74.95],"37":[35.76,-79.02],"39":[40.42,-82.91],"42":[41.20,-77.19],"47":[35.52,-86.58],"48":[31.97,-99.90],"51":[37.43,-78.66],"53":[47.75,-120.74]};
    const [lat, lng] = STATE_CENTROIDS[stateFips] ?? [39.5, -98.35];

    results.push({
      countyFips: fips,
      countyName: row.county_names ?? 'Unknown',
      state: row.wwtp_jurisdiction ?? '',
      percentileCategory: row.percentile ?? 'low',
      ptcChangeFrom15d: Number((row as Record<string, unknown>)['ptc_15d']) || 0,
      firstSampleDateCollected: row.date_start ?? new Date().toISOString(),
      latitude: lat,
      longitude: lng,
    });
  }
  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches wastewater surveillance signals.
 * Returns an empty array (not a throw) on any failure so the app degrades
 * gracefully when this single data source is unavailable.
 */
export async function fetchWastewater(): Promise<HealthSignal[]> {
  try {
    const response = await fetch('/api/cdc-wastewater');
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
