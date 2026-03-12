/**
 * PulseMap — WHO Disease Outbreak News fetcher.
 * API now returns JSON directly with lat/lng included.
 */

import type { HealthSignal, OutbreakAlert } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_OUTBREAKS: OutbreakAlert[] = [
  {
    id: 'who-1',
    title: 'Mpox – Democratic Republic of the Congo',
    country: 'Democratic Republic of the Congo',
    disease: 'Mpox',
    date: '2024-12-01',
    link: 'https://www.who.int/emergencies/disease-outbreak-news',
    severity: 'high',
    latitude: -4.04,
    longitude: 21.76,
  },
  {
    id: 'who-2',
    title: 'Cholera – Sudan',
    country: 'Sudan',
    disease: 'Cholera',
    date: '2024-12-03',
    link: 'https://www.who.int/emergencies/disease-outbreak-news',
    severity: 'high',
    latitude: 12.86,
    longitude: 30.22,
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface WhoJsonItem {
  title: string;
  date: string;
  country: string;
  lat: number;
  lng: number;
  severity: HealthSignal['severity'];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function itemToSignal(item: WhoJsonItem, index: number): HealthSignal {
  const dashMatch = item.title.match(/[–—-]\s*([^–—-]+)$/);
  const disease = dashMatch
    ? item.title.split(/[–—-]/)[0]?.trim() ?? item.title
    : item.title;

  const value =
    item.severity === 'critical' ? 90 :
    item.severity === 'high'     ? 70 :
    item.severity === 'medium'   ? 45 : 15;

  return {
    id: `who-${index}`,
    type: 'outbreak',
    severity: item.severity,
    latitude: item.lat,
    longitude: item.lng,
    value,
    rawValue: 1,
    label: item.title,
    source: 'WHO Disease Outbreak News',
    updatedAt: item.date,
    metadata: {
      country: item.country,
      disease,
      link: 'https://www.who.int/emergencies/disease-outbreak-news',
    },
  };
}

function outbreakToSignal(alert: OutbreakAlert): HealthSignal | null {
  if (alert.latitude === undefined || alert.longitude === undefined) return null;
  const value =
    alert.severity === 'critical' ? 90 :
    alert.severity === 'high'     ? 70 :
    alert.severity === 'medium'   ? 45 : 15;
  return {
    id: alert.id,
    type: 'outbreak',
    severity: alert.severity,
    latitude: alert.latitude,
    longitude: alert.longitude,
    value,
    rawValue: 1,
    label: alert.title,
    source: 'WHO Disease Outbreak News',
    updatedAt: alert.date,
    metadata: { country: alert.country, disease: alert.disease, link: alert.link },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Fetches WHO outbreak alerts. Falls back to mock data on failure. */
export async function fetchOutbreaks(): Promise<HealthSignal[]> {
  try {
    const response = await fetch('/api/who-outbreaks');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const items = await response.json() as WhoJsonItem[];
    if (!Array.isArray(items) || items.length === 0) throw new Error('Empty response');
    const signals = items.map((item, i) => itemToSignal(item, i));
    logger.info(`fetchOutbreaks: loaded ${signals.length} alerts`);
    return signals;
  } catch (err) {
    logger.warn('fetchOutbreaks: falling back to mock data', err);
    return MOCK_OUTBREAKS
      .map(outbreakToSignal)
      .filter((s): s is HealthSignal => s !== null);
  }
}
