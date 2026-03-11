/**
 * PulseMap — Statistical anomaly detection using Welford's online algorithm.
 *
 * Welford's algorithm computes running mean and variance in a single pass
 * without storing all historical values.  This is ideal for a browser that
 * can't persist a full time-series database.
 *
 * Each (signalType, countyFips) pair gets its own accumulator so anomalies
 * are localised — a nationwide spike in flu doesn't mask a local wastewater
 * anomaly.
 *
 * Z-score thresholds (configurable):
 *   ≥ 1.5 → low
 *   ≥ 2.0 → medium
 *   ≥ 3.0 → high
 *
 * A minimum of 10 data points is required before alerts are emitted so that
 * early sparse data doesn't produce false positives.
 */

import type { AnomalyAlert, HealthSignal } from '@/types/index.js';
import { logger } from '@/utils/logger.js';

// ─── Welford accumulator ──────────────────────────────────────────────────────

/**
 * Implements Welford's online algorithm for streaming mean/variance.
 * See: https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm
 */
export class WelfordAccumulator {
  count = 0;
  mean = 0;
  /** Second moment (M2) used to compute variance */
  M2 = 0;

  /**
   * Ingest a new observation and update the running statistics.
   */
  add(x: number): void {
    this.count += 1;
    const delta = x - this.mean;
    this.mean += delta / this.count;
    const delta2 = x - this.mean;
    this.M2 += delta * delta2;
  }

  /**
   * Returns the population standard deviation.
   * Returns 0 when fewer than 2 observations have been ingested.
   */
  getStdDev(): number {
    if (this.count < 2) return 0;
    return Math.sqrt(this.M2 / this.count);
  }

  /**
   * Returns the z-score of value x relative to the current distribution.
   * Returns 0 if standard deviation is 0 (constant series).
   */
  getZScore(x: number): number {
    const sd = this.getStdDev();
    if (sd === 0) return 0;
    return (x - this.mean) / sd;
  }
}

// ─── Accumulator registry ─────────────────────────────────────────────────────

/**
 * Key format: "{signalType}::{countyFips || 'global'}"
 * Stored at module scope so accumulators persist across re-renders for the
 * lifetime of the browser session.
 */
const accumulators = new Map<string, WelfordAccumulator>();

function getAccumulator(type: HealthSignal['type'], scope: string): WelfordAccumulator {
  const key = `${type}::${scope}`;
  let acc = accumulators.get(key);
  if (!acc) {
    acc = new WelfordAccumulator();
    accumulators.set(key, acc);
  }
  return acc;
}

// ─── Z-score thresholds ───────────────────────────────────────────────────────

const THRESHOLDS: Array<{ minZ: number; severity: AnomalyAlert['severity'] }> = [
  { minZ: 3.0, severity: 'high' },
  { minZ: 2.0, severity: 'medium' },
  { minZ: 1.5, severity: 'low' },
];

const MINIMUM_OBSERVATIONS = 10;

// ─── Human-readable messages ──────────────────────────────────────────────────

function buildMessage(signal: HealthSignal, zScore: number): string {
  const multiplier = Math.abs(zScore).toFixed(1);
  const direction = zScore > 0 ? 'above' : 'below';
  const typeLabel: Record<HealthSignal['type'], string> = {
    wastewater: 'Wastewater signal',
    flu: 'Flu activity',
    airquality: 'Air quality index',
    outbreak: 'Outbreak alert count',
    hospital: 'Hospital capacity pressure',
    weather: 'Weather alert severity',
  };

  const label = typeLabel[signal.type];
  const location = signal.countyFips
    ? `county ${signal.countyFips}`
    : signal.state ?? 'this area';

  return `${label} in ${location} is ${multiplier}× ${direction} historical average`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Feeds all signals into their respective accumulators and returns any
 * anomalies detected.  Should be called each time the signal array is updated.
 */
export function detectAnomalies(signals: HealthSignal[]): AnomalyAlert[] {
  const alerts: AnomalyAlert[] = [];

  for (const signal of signals) {
    const scope = signal.countyFips ?? signal.state ?? 'global';
    const acc = getAccumulator(signal.type, scope);

    // Ingest the value into the running statistics
    acc.add(signal.value);

    // Don't fire alerts until we have enough data for reliable statistics
    if (acc.count < MINIMUM_OBSERVATIONS) continue;

    const z = acc.getZScore(signal.value);

    // Check against thresholds from highest to lowest — emit only the
    // most severe applicable alert per signal
    for (const threshold of THRESHOLDS) {
      if (z >= threshold.minZ) {
        alerts.push({
          type: `${signal.type}_spike`,
          message: buildMessage(signal, z),
          zScore: parseFloat(z.toFixed(2)),
          severity: threshold.severity,
        });
        logger.debug('anomaly detected', { type: signal.type, scope, z });
        break;
      }
    }
  }

  return alerts;
}
