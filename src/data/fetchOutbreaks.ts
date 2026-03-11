/**
 * PulseMap — WHO Disease Outbreak News fetcher.
 *
 * Calls /api/who-outbreaks which parses the WHO RSS feed and returns a
 * normalised array.  Country names are mapped to approximate coordinates using
 * a hardcoded lookup table (no geocoding API needed for this source).
 */

import type { HealthSignal, OutbreakAlert } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

// ─── Country → centroid lookup (top ~100 countries) ───────────────────────────

const COUNTRY_COORDS: Record<string, [number, number]> = {
  'Afghanistan': [33.93, 67.71], 'Algeria': [28.03, 1.66],
  'Angola': [-11.20, 17.87], 'Argentina': [-38.42, -63.62],
  'Australia': [-25.27, 133.78], 'Austria': [47.52, 14.55],
  'Bangladesh': [23.68, 90.35], 'Belgium': [50.50, 4.47],
  'Bolivia': [-16.29, -63.59], 'Brazil': [-14.24, -51.93],
  'Cambodia': [12.57, 104.99], 'Cameroon': [3.85, 11.50],
  'Canada': [56.13, -106.35], 'Central African Republic': [6.61, 20.94],
  'Chad': [15.45, 18.73], 'Chile': [-35.68, -71.54],
  'China': [35.86, 104.19], 'Colombia': [4.57, -74.30],
  'Democratic Republic of the Congo': [-4.04, 21.76],
  'Republic of the Congo': [-0.23, 15.83],
  'Costa Rica': [9.75, -83.75], 'Cuba': [21.52, -77.78],
  'Egypt': [26.82, 30.80], 'Ethiopia': [9.14, 40.49],
  'France': [46.23, 2.21], 'Germany': [51.17, 10.45],
  'Ghana': [7.95, -1.02], 'Guatemala': [15.78, -90.23],
  'Guinea': [9.95, -11.24], 'Haiti': [18.97, -72.29],
  'Honduras': [15.20, -86.24], 'India': [20.59, 78.96],
  'Indonesia': [-0.79, 113.92], 'Iran': [32.43, 53.69],
  'Iraq': [33.22, 43.68], 'Italy': [41.87, 12.57],
  'Japan': [36.20, 138.25], 'Jordan': [30.59, 36.24],
  'Kazakhstan': [48.02, 66.92], 'Kenya': [0.02, 37.91],
  'Kuwait': [29.31, 47.48], 'Laos': [19.86, 102.50],
  'Lebanon': [33.85, 35.86], 'Liberia': [6.43, -9.43],
  'Libya': [26.34, 17.23], 'Madagascar': [-18.77, 46.87],
  'Malawi': [-13.25, 34.30], 'Malaysia': [4.21, 108.00],
  'Mali': [17.57, -3.99], 'Mauritania': [21.01, -10.94],
  'Mexico': [23.63, -102.55], 'Morocco': [31.79, -7.09],
  'Mozambique': [-18.67, 35.53], 'Myanmar': [21.91, 95.96],
  'Nepal': [28.39, 84.12], 'Netherlands': [52.13, 5.29],
  'Niger': [17.61, 8.08], 'Nigeria': [9.08, 8.68],
  'North Korea': [40.34, 127.51], 'Norway': [60.47, 8.47],
  'Oman': [21.51, 55.92], 'Pakistan': [30.38, 69.35],
  'Papua New Guinea': [-6.31, 143.96], 'Peru': [-9.19, -75.01],
  'Philippines': [12.88, 121.77], 'Poland': [51.92, 19.15],
  'Portugal': [39.40, -8.22], 'Romania': [45.94, 24.97],
  'Russia': [61.52, 105.32], 'Rwanda': [-1.94, 29.87],
  'Saudi Arabia': [23.89, 45.08], 'Senegal': [14.50, -14.45],
  'Sierra Leone': [8.46, -11.78], 'Somalia': [5.15, 46.20],
  'South Africa': [-30.56, 22.94], 'South Korea': [35.91, 127.77],
  'South Sudan': [7.86, 29.69], 'Spain': [40.46, -3.75],
  'Sri Lanka': [7.87, 80.77], 'Sudan': [12.86, 30.22],
  'Sweden': [60.13, 18.64], 'Syria': [34.80, 38.99],
  'Taiwan': [23.70, 121.00], 'Tanzania': [-6.37, 34.89],
  'Thailand': [15.87, 100.99], 'Turkey': [38.96, 35.24],
  'Uganda': [1.37, 32.29], 'Ukraine': [48.38, 31.17],
  'United Arab Emirates': [23.42, 53.85],
  'United Kingdom': [55.38, -3.44],
  'United States': [37.09, -95.71],
  'United States of America': [37.09, -95.71],
  'Uruguay': [-32.52, -55.77], 'Venezuela': [6.42, -66.59],
  'Vietnam': [14.06, 108.28], 'Yemen': [15.55, 48.52],
  'Zambia': [-13.13, 27.85], 'Zimbabwe': [-19.02, 29.15],
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_OUTBREAKS: OutbreakAlert[] = [
  {
    id: 'who-1',
    title: 'Mpox – Democratic Republic of the Congo',
    country: 'Democratic Republic of the Congo',
    disease: 'Mpox',
    date: '2024-12-01',
    link: 'https://www.who.int/emergencies/disease-outbreak-news/item/1',
    severity: 'high',
  },
  {
    id: 'who-2',
    title: 'Cholera – Sudan',
    country: 'Sudan',
    disease: 'Cholera',
    date: '2024-12-03',
    link: 'https://www.who.int/emergencies/disease-outbreak-news/item/2',
    severity: 'high',
  },
  {
    id: 'who-3',
    title: 'Avian Influenza A(H5N1) – Cambodia',
    country: 'Cambodia',
    disease: 'Avian Influenza A(H5N1)',
    date: '2024-12-05',
    link: 'https://www.who.int/emergencies/disease-outbreak-news/item/3',
    severity: 'critical',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferSeverity(title: string): HealthSignal['severity'] {
  const t = title.toLowerCase();
  if (t.includes('h5n1') || t.includes('ebola') || t.includes('pandemic')) return 'critical';
  if (t.includes('cholera') || t.includes('plague') || t.includes('marburg')) return 'high';
  if (t.includes('mpox') || t.includes('dengue') || t.includes('yellow fever')) return 'medium';
  return 'low';
}

interface WhoRssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
}

function parseItem(item: WhoRssItem, index: number): OutbreakAlert | null {
  const title = item.title ?? 'Unknown outbreak';

  // Extract country from title: "Disease – Country" or "Disease - Country"
  const dashMatch = title.match(/[–—-]\s*([^–—-]+)$/);
  const country = dashMatch?.[1]?.trim() ?? 'Unknown';
  const disease = dashMatch
    ? title.split(/[–—-]/)[0]?.trim() ?? title
    : title;

  const coords = COUNTRY_COORDS[country];

  return {
    id: `who-${index}`,
    title,
    country,
    disease,
    date: item.pubDate ?? new Date().toISOString(),
    link: item.link ?? 'https://www.who.int',
    latitude: coords?.[0],
    longitude: coords?.[1],
    severity: inferSeverity(title),
  };
}

function outbreakToSignal(alert: OutbreakAlert): HealthSignal | null {
  if (alert.latitude === undefined || alert.longitude === undefined) return null;

  return {
    id: alert.id,
    type: 'outbreak',
    severity: alert.severity,
    latitude: alert.latitude,
    longitude: alert.longitude,
    value: alert.severity === 'critical' ? 90 : alert.severity === 'high' ? 70 : alert.severity === 'medium' ? 45 : 15,
    rawValue: 1,
    label: alert.title,
    source: 'WHO Disease Outbreak News',
    updatedAt: alert.date,
    metadata: {
      country: alert.country,
      disease: alert.disease,
      link: alert.link,
    },
  };
}

// ─── XML parser ───────────────────────────────────────────────────────────────

function parseXmlItems(xml: string): WhoRssItem[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.querySelectorAll('item')).map((el) => {
    const item: WhoRssItem = {};
    const title       = el.querySelector('title')?.textContent?.trim();
    const link        = el.querySelector('link')?.textContent?.trim();
    const pubDate     = el.querySelector('pubDate')?.textContent?.trim();
    const description = el.querySelector('description')?.textContent?.trim();
    if (title !== undefined)       item.title = title;
    if (link !== undefined)        item.link = link;
    if (pubDate !== undefined)     item.pubDate = pubDate;
    if (description !== undefined) item.description = description;
    return item;
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Fetches WHO outbreak alerts.  Falls back to mock data on failure. */
export async function fetchOutbreaks(): Promise<HealthSignal[]> {
  try {
    const response = await fetch('/api/who-outbreaks');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    const items = parseXmlItems(xml);
    const alerts = items
      .map((item, i) => parseItem(item, i))
      .filter((a): a is OutbreakAlert => a !== null);
    const signals = alerts
      .map(outbreakToSignal)
      .filter((s): s is HealthSignal => s !== null);
    if (signals.length === 0) throw new Error('Empty response');
    logger.info(`fetchOutbreaks: loaded ${signals.length} alerts`);
    return signals;
  } catch (err) {
    logger.warn('fetchOutbreaks: falling back to mock data', err);
    return MOCK_OUTBREAKS
      .map(outbreakToSignal)
      .filter((s): s is HealthSignal => s !== null);
  }
}
