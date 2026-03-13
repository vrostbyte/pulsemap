/**
 * PulseMap — UV Index deck.gl layer.
 * Renders UV index signals as translucent scatter circles.
 * Color follows the WHO UV category scale (green→yellow→orange→red→purple).
 * Large radius — UV exposure affects a wide area around the point.
 */

import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { HealthSignal } from '@/types/index.js';
import { getLayerRadius } from '../../utils/normalizeRadius';

function getUVColor(value: number): [number, number, number, number] {
  if (value < 30) return [ 76, 153,   0, 200]; // Low      — green
  if (value < 55) return [255, 215,   0, 210]; // Moderate — yellow
  if (value < 73) return [255, 140,   0, 220]; // High     — orange
  if (value < 91) return [255,  30,  30, 230]; // Very High — red
  return               [130,   0, 130, 240];   // Extreme  — purple
}

export function createUVLayer(
  signals: HealthSignal[],
  onHover: (info: PickingInfo) => void,
) {
  const uvSignals = signals.filter((s) => s.type === 'uv');

  return new ScatterplotLayer({
    id: 'uv-layer',
    data: uvSignals,
    getPosition: (s: HealthSignal) => [s.longitude, s.latitude],
    getRadius: (s: HealthSignal) => getLayerRadius(s.value, 'uv'),
    getFillColor: (s: HealthSignal) => getUVColor(s.value),
    getLineColor: [255, 255, 200, 60],
    getLineWidth: 1,
    stroked: true,
    filled: true,
    opacity: 0.75,
    radiusUnits: 'meters',
    radiusMinPixels: 8,
    radiusMaxPixels: 120,
    pickable: true,
    onHover,
    updateTriggers: { getRadius: signals.length, getFillColor: signals.length },
  });
}
