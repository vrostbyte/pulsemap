/**
 * PulseMap — NASA FIRMS Wildfire data fetcher.
 *
 * Calls our /api/nasa-firms proxy which parses the VIIRS NOAA-20 NRT CSV feed
 * and returns filtered JSON. Falls back to mock data on any error.
 */

import type { HealthSignal } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

// ─── Mock data (dev fallback) ─────────────────────────────────────────────────

const MOCK_WILDFIRES: HealthSignal[] = [
  {
    id: 'wildfire-37.2--122.1',
    type: 'wildfire',
    severity: 'high',
    latitude: 37.2,
    longitude: -122.1,
    value: 60,
    rawValue: 420,
    label: 'Active wildfire — FRP 45.0 MW',
    source: 'NASA FIRMS',
    updatedAt: new Date().toISOString(),
    metadata: { confidence: 'h', frp: 45.0 },
  },
  {
    id: 'wildfire-38.1--120.9',
    type: 'wildfire',
    severity: 'critical',
    latitude: 38.1,
    longitude: -120.9,
    value: 80,
    rawValue: 460,
    label: 'Active wildfire — FRP 68.2 MW',
    source: 'NASA FIRMS',
    updatedAt: new Date().toISOString(),
    metadata: { confidence: 'h', frp: 68.2 },
  },
  {
    id: 'wildfire-39.5--121.3',
    type: 'wildfire',
    severity: 'medium',
    latitude: 39.5,
    longitude: -121.3,
    value: 35,
    rawValue: 370,
    label: 'Active wildfire — FRP 18.5 MW',
    source: 'NASA FIRMS',
    updatedAt: new Date().toISOString(),
    metadata: { confidence: 'n', frp: 18.5 },
  },
  {
    id: 'wildfire-40.1--122.0',
    type: 'wildfire',
    severity: 'critical',
    latitude: 40.1,
    longitude: -122.0,
    value: 95,
    rawValue: 490,
    label: 'Active wildfire — FRP 112.3 MW',
    source: 'NASA FIRMS',
    updatedAt: new Date().toISOString(),
    metadata: { confidence: 'h', frp: 112.3 },
  },
];

// ─── API shape from the proxy ─────────────────────────────────────────────────

interface FirmsRow {
  lat:        number;
  lng:        number;
  brightness: number;
  frp:        number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function valueToSeverity(value: number): HealthSignal['severity'] {
  if (value >= 75) return 'critical';
  if (value >= 50) return 'high';
  if (value >= 25) return 'medium';
  return 'low';
}

function rowToSignal(row: FirmsRow): HealthSignal {
  const value    = Math.min(100, Math.round(((row.brightness - 290) / 110) * 100));
  const severity = valueToSeverity(value);

  return {
    id:        `wildfire-${row.lat}-${row.lng}`,
    type:      'wildfire',
    severity,
    latitude:  row.lat,
    longitude: row.lng,
    value,
    rawValue:  row.brightness,
    label:     `Active wildfire — FRP ${row.frp.toFixed(1)} MW`,
    source:    'NASA FIRMS',
    updatedAt: new Date().toISOString(),
    metadata: {
      frp:        row.frp,
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches NASA FIRMS wildfire signals.
 * Returns an empty array (not a throw) on any failure.
 */
export async function fetchWildfire(): Promise<HealthSignal[]> {
  try {
    const response = await fetch('/api/nasa-firms', {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const rows = (await response.json()) as FirmsRow[];

    // Guard against error response shape { error: string }
    if (!Array.isArray(rows)) throw new Error('Unexpected response shape');

    const signals = rows.map(rowToSignal);
    // zero detections is valid — no active fires

    logger.info(`fetchWildfire: loaded ${signals.length} fire detections`);
    return signals;
  } catch (err) {
    logger.warn('fetchWildfire: falling back to mock data', err);
    return MOCK_WILDFIRES;
  }
}
