/**
 * PulseMap — Data aggregator.
 *
 * Runs all data fetchers in parallel using Promise.allSettled so that a
 * failure in one source does not block the others.  Merges the results into a
 * single HealthSignal[] array.
 *
 * Also tracks per-source freshness so the Sidebar can show data-age
 * indicators without any extra state management.
 */

import type { HealthSignal } from '@/types/index.js';
import { fetchWastewater } from './fetchWastewater.js';
import { fetchFluView } from './fetchFluView.js';
import { fetchAirQuality } from './fetchAirQuality.js';
import { fetchOutbreaks } from './fetchOutbreaks.js';
import { fetchHospitals } from './fetchHospitals.js';
import { logger } from '@/utils/logger.js';

// ─── Freshness tracking ───────────────────────────────────────────────────────

/** ISO timestamp of the last successful fetch for each named source. */
const freshnessMap = new Map<string, string>();

/**
 * Returns a copy of the current freshness map.
 * Call after fetchAllHealthData() to display data-age in the sidebar.
 */
export function getDataFreshness(): Map<string, string> {
  return new Map(freshnessMap);
}

// ─── Source names (used as keys in freshnessMap) ──────────────────────────────

export const SOURCE_NAMES = {
  wastewater: 'CDC Wastewater',
  flu: 'CDC FluView',
  airquality: 'EPA AirNow',
  outbreak: 'WHO Outbreaks',
  hospital: 'CMS Hospitals',
  weather: 'NWS Alerts',
} as const;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches all health data sources in parallel.
 *
 * Each fetcher already handles its own errors and returns [] on failure, so
 * this function is always safe to await.  Individual source failures are
 * visible via the freshness map (no timestamp = never loaded successfully).
 *
 * @param zip - Optional ZIP code to pass to AQI lookup for localised results
 */
export async function fetchAllHealthData(zip?: string): Promise<HealthSignal[]> {
  logger.info('aggregator: starting parallel fetch', { zip });

  const [
    wastewaterResult,
    fluResult,
    airQualityResult,
    outbreakResult,
    hospitalResult,
  ] = await Promise.allSettled([
    fetchWastewater(),
    fetchFluView(),
    fetchAirQuality(zip),
    fetchOutbreaks(),
    fetchHospitals(),
  ]);

  const now = new Date().toISOString();
  const allSignals: HealthSignal[] = [];

  if (wastewaterResult.status === 'fulfilled') {
    allSignals.push(...wastewaterResult.value);
    freshnessMap.set(SOURCE_NAMES.wastewater, now);
  } else {
    logger.error('aggregator: wastewater fetch failed', wastewaterResult.reason);
  }

  if (fluResult.status === 'fulfilled') {
    allSignals.push(...fluResult.value);
    freshnessMap.set(SOURCE_NAMES.flu, now);
  } else {
    logger.error('aggregator: flu fetch failed', fluResult.reason);
  }

  if (airQualityResult.status === 'fulfilled') {
    allSignals.push(...airQualityResult.value);
    freshnessMap.set(SOURCE_NAMES.airquality, now);
  } else {
    logger.error('aggregator: air quality fetch failed', airQualityResult.reason);
  }

  if (outbreakResult.status === 'fulfilled') {
    allSignals.push(...outbreakResult.value);
    freshnessMap.set(SOURCE_NAMES.outbreak, now);
  } else {
    logger.error('aggregator: outbreak fetch failed', outbreakResult.reason);
  }

  if (hospitalResult.status === 'fulfilled') {
    allSignals.push(...hospitalResult.value);
    freshnessMap.set(SOURCE_NAMES.hospital, now);
  } else {
    logger.error('aggregator: hospital fetch failed', hospitalResult.reason);
  }

  logger.info(`aggregator: loaded ${allSignals.length} total signals`);
  return allSignals;
}
