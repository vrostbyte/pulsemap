/**
 * PulseMap — Open-Meteo Pollen deck.gl layer.
 * Renders pollen signals as translucent scatter circles.
 * Color encodes pollen intensity from yellow-green (low) to orange (high).
 * Circle radius scales with the normalised pollen value.
 */

import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { HealthSignal } from '@/types/index.js';
import { getLayerRadius } from '../../utils/normalizeRadius';

function getPollenColor(value: number): [number, number, number, number] {
  if (value < 25) return [144, 238, 144, 180]; // light green
  if (value < 50) return [154, 205,  50, 200]; // yellow-green
  if (value < 75) return [255, 215,   0, 210]; // gold
  return               [255, 140,   0, 230];   // orange
}

export function createPollenLayer(
  signals: HealthSignal[],
  onHover: (info: PickingInfo) => void,
) {
  const pollenSignals = signals.filter((s) => s.type === 'pollen');

  return new ScatterplotLayer({
    id: 'pollen-layer',
    data: pollenSignals,
    getPosition: (s: HealthSignal) => [s.longitude, s.latitude],
    getRadius: (s: HealthSignal) => getLayerRadius(s.value, 'pollen'),
    getFillColor: (s: HealthSignal) => getPollenColor(s.value),
    getLineColor: [200, 230, 100, 60],
    getLineWidth: 1,
    stroked: true,
    filled: true,
    opacity: 0.75,
    radiusUnits: 'meters',
    radiusMinPixels: 6,
    radiusMaxPixels: 80,
    pickable: true,
    onHover,
    updateTriggers: { getRadius: signals.length, getFillColor: signals.length },
  });
}
