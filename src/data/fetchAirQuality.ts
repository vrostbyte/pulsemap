/**
 * PulseMap — EPA AirNow air quality data fetcher.
 *
 * Calls our /api/epa-airquality proxy which adds the AirNow API key and
 * sets CORS headers.  Accepts either a ZIP code or lat/lng for map-view
 * queries.  Falls back to mock data on any failure.
 */

import type { AirQualityData, HealthSignal } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_AQI_DATA: AirQualityData[] = [
  { zipCode: '90210', dateObserved: '2024-01-15', aqi: 45,  category: 'Good',     pollutant: 'PM2.5', latitude: 34.09,  longitude: -118.41 },
  { zipCode: '10001', dateObserved: '2024-01-15', aqi: 72,  category: 'Moderate', pollutant: 'PM2.5', latitude: 40.75,  longitude: -74.00  },
  { zipCode: '60601', dateObserved: '2024-01-15', aqi: 55,  category: 'Moderate', pollutant: 'Ozone', latitude: 41.88,  longitude: -87.62  },
  { zipCode: '77001', dateObserved: '2024-01-15', aqi: 110, category: 'Unhealthy for Sensitive Groups', pollutant: 'Ozone', latitude: 29.75, longitude: -95.37 },
  { zipCode: '94102', dateObserved: '2024-01-15', aqi: 38,  category: 'Good',     pollutant: 'PM2.5', latitude: 37.78,  longitude: -122.42 },
  { zipCode: '85001', dateObserved: '2024-01-15', aqi: 155, category: 'Unhealthy', pollutant: 'PM10', latitude: 33.45,  longitude: -112.07 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function aqiToSeverity(aqi: number): HealthSignal['severity'] {
  if (aqi > 200) return 'critical';
  if (aqi > 150) return 'high';
  if (aqi > 100) return 'medium';
  return 'low';
}

/** Normalise AQI 0–500+ to 0–100. */
function aqiToValue(aqi: number): number {
  return Math.min(100, Math.round((aqi / 300) * 100));
}

function aqiDataToSignal(d: AirQualityData): HealthSignal {
  return {
    id: `airquality-${d.zipCode}-${d.dateObserved}`,
    type: 'airquality',
    severity: aqiToSeverity(d.aqi),
    latitude: d.latitude,
    longitude: d.longitude,
    zipCode: d.zipCode,
    value: aqiToValue(d.aqi),
    rawValue: d.aqi,
    label: `AQI ${d.aqi} — ${d.category} (${d.pollutant})`,
    source: 'EPA AirNow',
    updatedAt: new Date().toISOString(),
    metadata: {
      category: d.category,
      pollutant: d.pollutant,
      dateObserved: d.dateObserved,
    },
  };
}

// ─── API shape ────────────────────────────────────────────────────────────────

interface AirNowObservation {
  DateObserved?: string;
  HourObserved?: number;
  LocalTimeZone?: string;
  ReportingArea?: string;
  StateCode?: string;
  Latitude?: number;
  Longitude?: number;
  ParameterName?: string;
  AQI?: number;
  Category?: { Number?: number; Name?: string };
}

function parseApiRows(
  rows: AirNowObservation[],
  zip?: string,
): AirQualityData[] {
  const results: AirQualityData[] = [];
  for (const row of rows) {
    const aqi = row.AQI;
    const lat = row.Latitude;
    const lng = row.Longitude;
    if (aqi === undefined || lat === undefined || lng === undefined) continue;

    results.push({
      zipCode: zip ?? row.ReportingArea ?? '',
      dateObserved: row.DateObserved?.trim() ?? new Date().toISOString(),
      aqi,
      category: row.Category?.Name ?? 'Unknown',
      pollutant: row.ParameterName ?? 'Unknown',
      latitude: lat,
      longitude: lng,
    });
  }
  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches AQI data for a given ZIP code.
 * Falls back to mock data on any failure.
 *
 * @param zip - 5-digit ZIP code to query
 */
export async function fetchAirQuality(zip?: string): Promise<HealthSignal[]> {
  try {
    const params = zip ? `?zip=${encodeURIComponent(zip)}` : '';
    const response = await fetch(`/api/epa-airquality${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = (await response.json()) as AirNowObservation[];
    const parsed = parseApiRows(rows, zip);
    if (parsed.length === 0) throw new Error('Empty response');
    logger.info(`fetchAirQuality: loaded ${parsed.length} observations`);
    return parsed.map(aqiDataToSignal);
  } catch (err) {
    logger.warn('fetchAirQuality: falling back to mock data', err);
    return MOCK_AQI_DATA.map(aqiDataToSignal);
  }
}
