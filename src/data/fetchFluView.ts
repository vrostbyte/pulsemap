/**
 * PulseMap — CDC FluView ILI activity data fetcher.
 *
 * Fetches current-season influenza-like illness (ILI) data by HHS region from
 * our /api/cdc-fluview proxy.  HHS regions are mapped to representative
 * geographic centroids so flu signals can be displayed on the map.
 */

import type { HealthSignal } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

// ─── HHS Region centroids ─────────────────────────────────────────────────────
// Region → { latitude, longitude, label }
// Centroids are approximate geographic centres used for map display only.

const HHS_REGION_CENTROIDS: Record<string, { lat: number; lng: number; label: string }> = {
  'Region 1':  { lat: 42.36,  lng: -71.05,  label: 'New England' },
  'Region 2':  { lat: 40.71,  lng: -74.00,  label: 'NY/NJ/PR/VI' },
  'Region 3':  { lat: 38.89,  lng: -77.03,  label: 'Mid-Atlantic' },
  'Region 4':  { lat: 33.74,  lng: -84.38,  label: 'Southeast' },
  'Region 5':  { lat: 41.88,  lng: -87.63,  label: 'Great Lakes' },
  'Region 6':  { lat: 32.78,  lng: -96.80,  label: 'South Central' },
  'Region 7':  { lat: 39.10,  lng: -94.58,  label: 'Midwest' },
  'Region 8':  { lat: 39.73,  lng: -104.99, label: 'Mountain' },
  'Region 9':  { lat: 37.77,  lng: -122.41, label: 'Pacific' },
  'Region 10': { lat: 47.60,  lng: -122.33, label: 'Northwest' },
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_FLU_DATA = [
  { region: 'Region 1',  iliPct: 2.1, baseline: 2.5 },
  { region: 'Region 2',  iliPct: 3.8, baseline: 2.5 },
  { region: 'Region 3',  iliPct: 2.9, baseline: 2.5 },
  { region: 'Region 4',  iliPct: 4.2, baseline: 2.5 },
  { region: 'Region 5',  iliPct: 3.1, baseline: 2.5 },
  { region: 'Region 6',  iliPct: 5.7, baseline: 2.5 },
  { region: 'Region 7',  iliPct: 2.4, baseline: 2.5 },
  { region: 'Region 8',  iliPct: 1.9, baseline: 2.5 },
  { region: 'Region 9',  iliPct: 3.3, baseline: 2.5 },
  { region: 'Region 10', iliPct: 2.8, baseline: 2.5 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function iliToSeverity(iliPct: number, baseline: number): HealthSignal['severity'] {
  const ratio = iliPct / baseline;
  if (ratio >= 3) return 'critical';
  if (ratio >= 2) return 'high';
  if (ratio >= 1.2) return 'medium';
  return 'low';
}

/** Normalise ILI% to 0–100 using a 0–10% range (10%+ = 100). */
function iliToValue(iliPct: number): number {
  return Math.min(100, Math.round((iliPct / 10) * 100));
}

interface FluRow {
  region?: string;
  ili_pct?: string | number;
  national_baseline?: string | number;
}

function parseApiRows(rows: FluRow[]): HealthSignal[] {
  const signals: HealthSignal[] = [];
  for (const row of rows) {
    const region = row.region ?? '';
    const centroid = HHS_REGION_CENTROIDS[region];
    if (!centroid) continue;

    const iliPct = Number(row.ili_pct) || 0;
    const baseline = Number(row.national_baseline) || 2.5;
    const severity = iliToSeverity(iliPct, baseline);

    signals.push({
      id: `flu-${region.replace(/\s+/g, '-').toLowerCase()}`,
      type: 'flu',
      severity,
      latitude: centroid.lat,
      longitude: centroid.lng,
      value: iliToValue(iliPct),
      rawValue: iliPct,
      label: `${centroid.label} — ILI ${iliPct.toFixed(1)}%`,
      source: 'CDC FluView',
      updatedAt: new Date().toISOString(),
      metadata: { region, baseline, centroid: centroid.label },
    });
  }
  return signals;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Fetches CDC FluView ILI signals.  Falls back to mock data on failure. */
export async function fetchFluView(): Promise<HealthSignal[]> {
  try {
    const response = await fetch('/api/cdc-fluview');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = (await response.json()) as FluRow[];
    const signals = parseApiRows(rows);
    if (signals.length === 0) throw new Error('Empty response');
    logger.info(`fetchFluView: loaded ${signals.length} HHS regions`);
    return signals;
  } catch (err) {
    logger.warn('fetchFluView: falling back to mock data', err);
    return MOCK_FLU_DATA.map((d) => {
      const centroid = HHS_REGION_CENTROIDS[d.region]!;
      const severity = iliToSeverity(d.iliPct, d.baseline);
      return {
        id: `flu-${d.region.replace(/\s+/g, '-').toLowerCase()}`,
        type: 'flu' as const,
        severity,
        latitude: centroid.lat,
        longitude: centroid.lng,
        value: iliToValue(d.iliPct),
        rawValue: d.iliPct,
        label: `${centroid.label} — ILI ${d.iliPct.toFixed(1)}%`,
        source: 'CDC FluView',
        updatedAt: new Date().toISOString(),
        metadata: { region: d.region, baseline: d.baseline },
      };
    });
  }
}
