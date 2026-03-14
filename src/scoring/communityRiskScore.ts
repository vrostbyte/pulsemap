/**
 * PulseMap — Community health risk score calculator.
 *
 * Combines signals from multiple data sources into a single 0–100 composite
 * score.  Lower is better (0 = excellent conditions, 100 = critical emergency).
 *
 * Component weights:
 *   Wastewater:         30%
 *   Flu activity:       25%
 *   Air quality:        20%
 *   Hospital capacity:  15%
 *   Outbreak alerts:    10%
 *
 * Each component is the mean normalised signal value (0–100) for matching
 * signals.  Missing components default to 0 (no signal = no concern).
 */

import type { CommunityHealthScore, HealthSignal } from '@/types/index.js';
import { detectAnomalies } from './anomalyDetection.js';
import { scoreLabel } from '@/utils/formatters.js';

// ─── Weights ──────────────────────────────────────────────────────────────────

const WEIGHTS = {
  wastewater:        0.25,
  fluActivity:       0.20,
  airQuality:        0.18,
  hospitalCapacity:  0.13,
  outbreakAlerts:    0.09,
  wildfireRisk:      0.07,
  heatAlerts:        0.04,
  pollenIndex:       0.03,
  uvIndex:           0.01,
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the mean value of all signals of a given type, or 0 if none. */
function meanValue(signals: HealthSignal[], type: HealthSignal['type']): number {
  const matching = signals.filter((s) => s.type === type);
  if (matching.length === 0) return 0;
  const sum = matching.reduce((acc, s) => acc + s.value, 0);
  return Math.round(sum / matching.length);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Calculates the composite community health score for a geographic area.
 *
 * @param signals     - Full signal array from the aggregator
 * @param countyFips  - If provided, score is calculated using only signals
 *                      from that county.  Otherwise all signals are used
 *                      (national overview).
 */
export function calculateHealthScore(
  signals: HealthSignal[],
  countyFips?: string,
): CommunityHealthScore {
  // Narrow to the selected county when a FIPS is provided
  const scoped = countyFips
    ? signals.filter((s) => s.countyFips === countyFips || s.countyFips === undefined)
    : signals;

  const components = {
    wastewater:       meanValue(scoped, 'wastewater'),
    fluActivity:      meanValue(scoped, 'flu'),
    airQuality:       meanValue(scoped, 'airquality'),
    hospitalCapacity: meanValue(scoped, 'hospital'),
    outbreakAlerts:   meanValue(scoped, 'outbreak'),
    wildfireRisk:     meanValue(scoped, 'wildfire'),
    heatAlerts:       meanValue(scoped, 'weather'),
    pollenIndex:      meanValue(scoped, 'pollen'),
    uvIndex:          meanValue(scoped, 'uv'),
  };

  const score = Math.round(
    components.wastewater       * WEIGHTS.wastewater +
    components.fluActivity      * WEIGHTS.fluActivity +
    components.airQuality       * WEIGHTS.airQuality +
    components.hospitalCapacity * WEIGHTS.hospitalCapacity +
    components.outbreakAlerts   * WEIGHTS.outbreakAlerts +
    components.wildfireRisk     * WEIGHTS.wildfireRisk +
    components.heatAlerts       * WEIGHTS.heatAlerts +
    components.pollenIndex      * WEIGHTS.pollenIndex +
    components.uvIndex          * WEIGHTS.uvIndex,
  );

  const anomalies = detectAnomalies(scoped);

  return {
    score,
    label: scoreLabel(score),
    components,
    anomalies,
  };
}
