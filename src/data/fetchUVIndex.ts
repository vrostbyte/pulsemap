/**
 * PulseMap — UV Index data fetcher.
 *
 * Called after a ZIP code search resolves to lat/lng coordinates.
 * NOT part of the global data load — this is a single-point fetch
 * triggered only when the user searches a specific location.
 *
 * API: https://currentuvindex.com/api/v1/uvi (CORS-enabled, no key required)
 */

import type { HealthSignal } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uvCategory(uvi: number): string {
  if (uvi >= 11) return 'Extreme';
  if (uvi >= 8)  return 'Very High';
  if (uvi >= 6)  return 'High';
  if (uvi >= 3)  return 'Moderate';
  return 'Low';
}

function uviToSeverity(uvi: number): HealthSignal['severity'] {
  if (uvi >= 8) return 'critical';
  if (uvi >= 6) return 'high';
  if (uvi >= 3) return 'medium';
  return 'low';
}

// ─── API shape ────────────────────────────────────────────────────────────────

interface UVIResponse {
  ok: boolean;
  now: {
    uvi: number;
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches the current UV index for a given lat/lng.
 * Returns a single HealthSignal or null on any failure.
 * Only call this after a successful ZIP code search.
 */
export async function fetchUVIndex(
  lat: number,
  lng: number,
): Promise<HealthSignal | null> {
  try {
    const url = `https://currentuvindex.com/api/v1/uvi?latitude=${lat}&longitude=${lng}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = (await response.json()) as UVIResponse;
    if (!data.ok || !data.now) throw new Error('Invalid response shape');

    const uvi   = data.now.uvi;
    const value = Math.min(100, Math.round((uvi / 11) * 100));

    return {
      id:        `uv-${lat}-${lng}`,
      type:      'uv',
      severity:  uviToSeverity(uvi),
      latitude:  lat,
      longitude: lng,
      value,
      rawValue:  uvi,
      label:     `UV Index ${uvi.toFixed(1)} — ${uvCategory(uvi)}`,
      source:    'CurrentUVIndex',
      updatedAt: new Date().toISOString(),
      metadata:  {},
    };
  } catch (err) {
    logger.warn('fetchUVIndex: failed to fetch UV data', err);
    return null;
  }
}
