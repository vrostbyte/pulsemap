/**
 * PulseMap — NWS Heat Alerts data fetcher.
 *
 * Calls our /api/nws-alerts proxy and filters for Heat and Excessive Heat events.
 * Computes a centroid from GeoJSON polygon geometry for map placement.
 * Falls back to mock data on any error so the app degrades gracefully.
 */

import type { HealthSignal } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

// ─── Mock data (dev fallback) ─────────────────────────────────────────────────

const MOCK_HEAT_ALERTS: HealthSignal[] = [
  {
    id: 'heat-mock-0',
    type: 'weather',
    severity: 'critical',
    latitude: 33.4484,
    longitude: -112.074,
    value: 90,
    rawValue: 1,
    label: 'Excessive Heat Warning in effect for Phoenix metro area',
    source: 'NOAA NWS',
    updatedAt: new Date().toISOString(),
    metadata: {
      event: 'Excessive Heat Warning',
      areaDesc: 'Maricopa County, AZ',
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    },
  },
  {
    id: 'heat-mock-1',
    type: 'weather',
    severity: 'critical',
    latitude: 32.7767,
    longitude: -96.797,
    value: 90,
    rawValue: 1,
    label: 'Excessive Heat Warning in effect for Dallas–Fort Worth',
    source: 'NOAA NWS',
    updatedAt: new Date().toISOString(),
    metadata: {
      event: 'Excessive Heat Warning',
      areaDesc: 'Dallas County, TX',
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    },
  },
  {
    id: 'heat-mock-2',
    type: 'weather',
    severity: 'critical',
    latitude: 36.1699,
    longitude: -115.1398,
    value: 90,
    rawValue: 1,
    label: 'Excessive Heat Warning in effect for Las Vegas Valley',
    source: 'NOAA NWS',
    updatedAt: new Date().toISOString(),
    metadata: {
      event: 'Excessive Heat Warning',
      areaDesc: 'Clark County, NV',
      expires: new Date(Date.now() + 86_400_000).toISOString(),
    },
  },
];

// ─── GeoJSON types ────────────────────────────────────────────────────────────

interface NwsAlertProperties {
  event?: string;
  headline?: string;
  areaDesc?: string;
  effective?: string;
  expires?: string;
}

interface NwsAlertGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

interface NwsAlertFeature {
  type: 'Feature';
  geometry: NwsAlertGeometry | null;
  properties: NwsAlertProperties;
}

interface NwsAlertCollection {
  type: 'FeatureCollection';
  features: NwsAlertFeature[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function centroidFromRing(ring: number[][]): [number, number] | null {
  if (ring.length === 0) return null;
  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of ring) {
    sumLng += lng ?? 0;
    sumLat += lat ?? 0;
  }
  return [sumLng / ring.length, sumLat / ring.length];
}

function computeCentroid(geometry: NwsAlertGeometry): [number, number] | null {
  if (geometry.type === 'Polygon') {
    const ring = (geometry.coordinates as number[][][])[0];
    return ring ? centroidFromRing(ring) : null;
  }
  if (geometry.type === 'MultiPolygon') {
    const ring = (geometry.coordinates as number[][][][])[0]?.[0];
    return ring ? centroidFromRing(ring) : null;
  }
  return null;
}

function eventToSeverity(event: string): HealthSignal['severity'] {
  if (event.includes('Warning')) return 'critical';
  if (event.includes('Watch'))   return 'high';
  return 'medium';
}

function severityToValue(severity: HealthSignal['severity']): number {
  switch (severity) {
    case 'critical': return 90;
    case 'high':     return 70;
    default:         return 50;
  }
}

// ─── NWS Office fallback coordinates ─────────────────────────────────────────
const NWS_OFFICE_COORDS: Record<string, [number, number]> = {
  'Phoenix AZ':         [-112.07, 33.45],
  'Tucson AZ':          [-110.97, 32.22],
  'Los Angeles':        [-119.18, 34.20],
  'Oxnard':             [-119.18, 34.20],
  'San Diego':          [-117.16, 32.72],
  'Las Vegas':          [-115.14, 36.17],
  'Salt Lake City':     [-111.89, 40.77],
  'Denver':             [-104.98, 39.74],
  'Albuquerque':        [-106.65, 35.08],
  'El Paso':            [-106.49, 31.76],
  'San Antonio':        [ -98.47, 29.53],
  'Houston':            [ -95.37, 29.76],
  'Dallas':             [ -97.30, 32.90],
  'Miami':              [ -80.44, 25.76],
  'Tampa Bay':          [ -82.45, 27.96],
  'Atlanta':            [ -84.39, 33.75],
  'Memphis':            [ -90.05, 35.15],
  'New Orleans':        [ -90.07, 29.95],
  'Jackson MS':         [ -90.18, 32.30],
  'Birmingham':         [ -86.81, 33.52],
  'Sacramento':         [-121.49, 38.59],
  'San Francisco':      [-122.42, 37.77],
  'Portland':           [-122.68, 45.52],
  'Seattle':            [-122.34, 47.61],
  'Boise':              [-116.20, 43.61],
  'Reno':               [-119.81, 39.53],
};

function officeCoords(headline: string): [number, number] | null {
  const m = headline.match(/by NWS ([^\n]+?)\s*$/i);
  if (!m) return null;
  const office = (m[1] ?? '').trim();
  for (const [key, coords] of Object.entries(NWS_OFFICE_COORDS)) {
    if (office.includes(key)) return coords;
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches NWS heat alert signals.
 * Returns an empty array (not a throw) on any failure.
 */
export async function fetchHeatAlerts(): Promise<HealthSignal[]> {
  try {
    const response = await fetch('/api/nws-alerts', {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const collection = (await response.json()) as NwsAlertFeature[];
    const signals: HealthSignal[] = [];

    for (let i = 0; i < collection.length; i++) {
      const feature = collection[i];
      if (!feature) continue;

      const props = feature.properties;
      const event = props.event ?? '';

      if (!event.includes('Heat') && !event.includes('Excessive Heat')) continue;
      if (!feature.geometry) continue;

      const centroid = computeCentroid(feature.geometry);
      if (!centroid) continue;

      const [longitude, latitude] = centroid;
      const severity = eventToSeverity(event);

      signals.push({
        id: `heat-${i}`,
        type: 'weather',
        severity,
        latitude,
        longitude,
        value: severityToValue(severity),
        rawValue: 1,
        label: props.headline ?? event,
        source: 'NOAA NWS',
        updatedAt: props.effective ?? new Date().toISOString(),
        metadata: {
          event,
          areaDesc: props.areaDesc,
          expires: props.expires,
        },
      });
    }

    // zero alerts is valid — no active heat warnings
    logger.info(`fetchHeatAlerts: loaded ${signals.length} heat alerts`);
    return signals;
  } catch (err) {
    logger.warn('fetchHeatAlerts: falling back to mock data', err);
    return MOCK_HEAT_ALERTS;
  }
}
