/**
 * PulseMap — NASA FIRMS Wildfire deck.gl layer.
 * Renders active wildfire detections as translucent scatter circles.
 * Color encodes fire intensity from orange (moderate) to dark red (extreme).
 * Circle radius scales with the normalised brightness temperature value.
 */

import { ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { HealthSignal } from '@/types/index.js';
import { getLayerRadius } from '../../utils/normalizeRadius';

function getWildfireColor(value: number): [number, number, number, number] {
  if (value < 50) return [255, 165,  0, 200]; // orange
  if (value < 75) return [255,  69,  0, 220]; // orange-red
  return               [178,  34, 34, 240];   // firebrick
}

export function createWildfireLayer(
  signals: HealthSignal[],
  onHover: (info: PickingInfo) => void,
) {
  const wildfireSignals = signals.filter((s) => s.type === 'wildfire');

  return new ScatterplotLayer({
    id: 'wildfire-layer',
    data: wildfireSignals,
    getPosition: (s: HealthSignal) => [s.longitude, s.latitude],
    getRadius: (s: HealthSignal) => getLayerRadius(s.value, 'wildfire'),
    getFillColor: (s: HealthSignal) => getWildfireColor(s.value),
    getLineColor: [255, 220, 100, 60],
    getLineWidth: 1,
    stroked: true,
    filled: true,
    opacity: 0.75,
    radiusUnits: 'meters',
    radiusMinPixels: 4,
    radiusMaxPixels: 60,
    pickable: true,
    onHover,
    updateTriggers: { getRadius: signals.length, getFillColor: signals.length },
  });
}
