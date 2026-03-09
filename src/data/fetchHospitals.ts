/**
 * PulseMap — CMS hospital capacity data fetcher.
 *
 * Fetches hospital data from our /api/cms-hospitals proxy.
 * This data changes slowly (daily cache) so the signals are stable.
 * Hospital signals are used in the community risk score but rendered
 * as a separate optional layer on the map.
 */

import type { HealthSignal } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_HOSPITALS: HealthSignal[] = [
  {
    id: 'hospital-mock-1',
    type: 'hospital',
    severity: 'low',
    latitude: 34.0522,
    longitude: -118.2437,
    value: 30,
    rawValue: 30,
    label: 'Cedars-Sinai Medical Center — Emergency Services Available',
    source: 'CMS',
    updatedAt: new Date().toISOString(),
    metadata: { hospitalType: 'Acute Care Hospitals', emergencyServices: 'Yes', state: 'CA' },
  },
  {
    id: 'hospital-mock-2',
    type: 'hospital',
    severity: 'low',
    latitude: 40.7128,
    longitude: -74.006,
    value: 35,
    rawValue: 35,
    label: 'NYU Langone Medical Center — Emergency Services Available',
    source: 'CMS',
    updatedAt: new Date().toISOString(),
    metadata: { hospitalType: 'Acute Care Hospitals', emergencyServices: 'Yes', state: 'NY' },
  },
];

// ─── API shape ────────────────────────────────────────────────────────────────

interface CmsHospitalRow {
  hospital_name?: string;
  address?: string;
  city?: string;
  state?: string;
  hospital_type?: string;
  emergency_services?: string;
  lat?: string | number;
  lng?: string | number;
  geocoded_column?: { coordinates?: [number, number] };
}

function parseApiRows(rows: CmsHospitalRow[]): HealthSignal[] {
  const signals: HealthSignal[] = [];
  for (const row of rows) {
    // Try geocoded_column first, then explicit lat/lng
    const coords = row.geocoded_column?.coordinates;
    const lng = coords ? coords[0] : Number(row.lng);
    const lat = coords ? coords[1] : Number(row.lat);

    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

    const name = row.hospital_name ?? 'Unknown Hospital';
    const emergency = row.emergency_services?.toLowerCase() === 'yes';

    signals.push({
      id: `hospital-${name.replace(/\s+/g, '-').toLowerCase()}-${row.state ?? ''}`,
      type: 'hospital',
      severity: 'low', // CMS data is structural, not severity-based
      latitude: lat,
      longitude: lng,
      state: row.state,
      value: emergency ? 20 : 50, // Penalise hospitals without emergency services
      rawValue: emergency ? 1 : 0,
      label: `${name} — ${emergency ? 'Emergency Services Available' : 'No Emergency Services'}`,
      source: 'CMS',
      updatedAt: new Date().toISOString(),
      metadata: {
        hospitalType: row.hospital_type ?? '',
        emergencyServices: row.emergency_services ?? '',
        city: row.city ?? '',
        state: row.state ?? '',
      },
    });
  }
  return signals;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Fetches CMS hospital location data.  Falls back to mock data on failure. */
export async function fetchHospitals(): Promise<HealthSignal[]> {
  try {
    const response = await fetch('/api/cms-hospitals');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = (await response.json()) as CmsHospitalRow[];
    const signals = parseApiRows(rows);
    if (signals.length === 0) throw new Error('Empty response');
    logger.info(`fetchHospitals: loaded ${signals.length} hospitals`);
    return signals;
  } catch (err) {
    logger.warn('fetchHospitals: falling back to mock data', err);
    return MOCK_HOSPITALS;
  }
}
