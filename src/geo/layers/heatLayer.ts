/**
 * PulseMap — NWS Heat Alerts deck.gl layer.
 * Renders heat alert signals as translucent scatter circles.
 * Color encodes severity from orange (moderate) to crimson (critical/warning).
 * Circle radius scales with the normalised signal value.
 */

import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { HealthSignal } from '@/types/index.js';
import { getLayerRadius } from '../../utils/normalizeRadius';

function getHeatColor(value: number): [number, number, number, number] {
  if (value < 50)  return [255, 140,  0, 200]; // orange
  if (value < 75)  return [255,  69,  0, 220]; // orange-red
  return                  [220,  20, 60, 240]; // crimson
}

export function createHeatLayer(
  signals: HealthSignal[],
  onHover: (info: PickingInfo) => void,
) {
  const heatSignals = signals.filter((s) => s.type === 'weather');

  return new ScatterplotLayer({
    id: 'heat-layer',
    data: heatSignals,
    getPosition: (s: HealthSignal) => [s.longitude, s.latitude],
    getRadius: (s: HealthSignal) => getLayerRadius(s.value, 'weather'),
    getFillColor: (s: HealthSignal) => getHeatColor(s.value),
    getLineColor: [255, 200, 100, 60],
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
